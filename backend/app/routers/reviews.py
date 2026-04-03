from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.database import get_db
from app.models import User, Review, ChatMessage, GitHubAccount, GitHubRepoImport, GitHubPR, DebtItem
from app.schemas import (
    ReviewCreate,
    ReviewUpdate,
    ReviewResponse,
    ReviewStatusResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    MessageResponse,
    AIAnalysis
)
from app.dependencies import get_current_user
from app.ai_engine import ai_engine
from app.redis_client import redis_client
from app.github_client import get_github_client


router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.post("/", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    review_data: ReviewCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new code review"""
    github_account = None
    if review_data.github_account_id:
        github_account = db.query(GitHubAccount).filter(
            GitHubAccount.id == review_data.github_account_id,
            GitHubAccount.user_id == current_user.id,
            GitHubAccount.is_active == True
        ).first()
        if not github_account:
            raise HTTPException(status_code=404, detail="GitHub account not found")
        if not github_account.is_token_valid:
            raise HTTPException(status_code=401, detail="GitHub token expired")

    imported_repo = None
    if review_data.imported_repo_id:
        imported_repo = db.query(GitHubRepoImport).filter(
            GitHubRepoImport.id == review_data.imported_repo_id,
            GitHubRepoImport.is_active == True
        ).first()
        if not imported_repo:
            raise HTTPException(status_code=404, detail="Imported repo not found")

    pr = None
    if review_data.pr_id:
        pr = db.query(GitHubPR).filter(
            GitHubPR.id == review_data.pr_id,
            GitHubPR.is_active == True
        ).first()
        if not pr:
            raise HTTPException(status_code=404, detail="PR not found")

        if github_account and imported_repo:
            try:
                client = get_github_client(github_account.access_token)
                diff = await client.get_pr_diff(imported_repo.repo_full_name, pr.pr_number)
                review_data.code_diff = diff
                review_data.original_code = diff
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to fetch PR code: {str(e)}"
                )

    review = Review(
        user_id=current_user.id,
        github_account_id=review_data.github_account_id,
        imported_repo_id=review_data.imported_repo_id,
        pr_id=review_data.pr_id,
        pr_url=review_data.pr_url,
        pr_number=review_data.pr_number,
        repo_full_name=review_data.repo_full_name,
        branch_name=review_data.branch_name,
        target_branch=review_data.target_branch,
        pr_title=review_data.pr_title,
        code_diff=review_data.code_diff,
        original_code=review_data.original_code,
        status="processing"
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    background_tasks.add_task(
        process_ai_review,
        review.id,
        review_data.code_diff,
        review_data.original_code,
        review_data.repo_full_name or "",
        review_data.branch_name or ""
    )

    return review


VALID_DEBT_TYPES = {
    "missing_tests", "missing_error_handling", "complexity",
    "hardcoded_values", "security", "dead_code",
    "duplication", "outdated_patterns", "other"
}

def _save_debt_items(db, review, analysis):
    """Extract debt items from review issues and persist them."""
    try:
        for issue in analysis.issues:
            raw_type = getattr(issue, "debt_type", None) or "other"
            debt_type = raw_type if raw_type in VALID_DEBT_TYPES else "other"

            # Skip low-noise issues with no real debt signal
            if issue.severity == "low" and debt_type == "other":
                continue

            item = DebtItem(
                user_id=review.user_id,
                repo_id=review.imported_repo_id or 0,
                pr_id=review.pr_id,
                pr_number=review.pr_number,
                review_id=review.id,
                file_path=None,           # file_path added in future when we have per-file diffs
                debt_type=debt_type,
                severity=issue.severity,
                description=issue.message,
                suggestion=issue.suggestion,
                is_resolved=False,
            )
            db.add(item)
        db.commit()
    except Exception as e:
        print(f"[debt] failed to save debt items for review {review.id}: {e}")
        db.rollback()


async def process_ai_review(
    review_id: int,
    code_diff: str,
    original_code: str,
    repo_name: str = "",
    branch_name: str = ""
):
    """Background task: run AI analysis and update review"""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            return

        analysis = await ai_engine.analyze_code(
            code_diff, original_code, repo_name, branch_name
        )

        reviewed_code = await ai_engine.generate_reviewed_code(original_code, analysis)

        review.ai_feedback = analysis.dict()
        review.reviewed_code = reviewed_code
        review.safety_score = analysis.safety_score
        review.status = "completed"

        user = db.query(User).filter(User.id == review.user_id).first()
        if user and user.review_mode == "automatic" and analysis.safety_score >= user.auto_merge_threshold:
            review.status = "auto_merged"

        db.commit()

        # ── Save debt items from this review ──────────────────────────────
        _save_debt_items(db, review, analysis)

    except Exception as e:
        try:
            review.status = "failed"
            db.commit()
        except Exception:
            pass
        print(f"AI review error: {e}")
    finally:
        db.close()


@router.get("/", response_model=List[ReviewResponse])
async def get_reviews(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's reviews"""
    query = db.query(Review).filter(Review.user_id == current_user.id)
    if status_filter:
        query = query.filter(Review.status == status_filter)
    reviews = query.order_by(Review.created_at.desc()).offset(skip).limit(limit).all()
    return reviews


@router.get("/{review_id}/status", response_model=ReviewStatusResponse)
async def get_review_status(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lightweight poll endpoint — returns status + ai_feedback only.
    Frontend polls this while status == 'processing' instead of GET /{id}.
    """
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    return ReviewStatusResponse(
        id=review.id,
        status=review.status,
        safety_score=review.safety_score or 0,
        reviewed_code=review.reviewed_code,
        ai_feedback=review.ai_feedback,
    )


@router.get("/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific review — always from DB, never from partial cache"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )

    return review


@router.put("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: int,
    review_data: ReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a review"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    for field, value in review_data.dict(exclude_unset=True).items():
        if hasattr(value, 'value'):
            value = value.value
        setattr(review, field, value)

    db.commit()
    db.refresh(review)
    return review


@router.delete("/{review_id}", response_model=MessageResponse)
async def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a review"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    db.delete(review)
    db.commit()
    return {"message": "Review deleted successfully", "success": True}


@router.post("/{review_id}/messages", response_model=ChatMessageResponse)
async def add_chat_message(
    review_id: int,
    message_data: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a chat message to a review"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    user_message = ChatMessage(
        review_id=review_id,
        role=message_data.role,
        content=message_data.content
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    return user_message


@router.get("/{review_id}/messages", response_model=List[ChatMessageResponse])
async def get_chat_messages(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all chat messages for a review"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    messages = db.query(ChatMessage).filter(
        ChatMessage.review_id == review_id
    ).order_by(ChatMessage.created_at.asc()).all()
    return messages


@router.post("/generate-description")
async def generate_pr_description(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Generate an AI PR title + description from a code diff.
    Request body: { "code_diff": "..." }
    Returns: { "title": "...", "summary": "...", "changes": [...], "testing": "...", "notes": "..." }
    """
    code_diff = request.get("code_diff", "")
    if not code_diff:
        raise HTTPException(status_code=400, detail="code_diff is required")

    try:
        result = await ai_engine.generate_pr_description(code_diff)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate description: {str(e)}")