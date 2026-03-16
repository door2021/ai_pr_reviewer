from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User, Review, ChatMessage, GitHubRepoImport
from app.schemas import (
    ReviewCreate,
    ReviewUpdate,
    ReviewResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    MessageResponse,
)
from app.dependencies import get_current_user
from app.ai_engine import ai_engine
from app.redis_client import redis_client
from app.github_client import get_github_client
import json
import asyncio

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.post("/", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    review_data: ReviewCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if review_data.review_type == "imported" and review_data.pr_number:
        if not current_user.github_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GitHub account not connected for imported PR",
            )

        try:
            client = get_github_client(current_user.github_token)
            code_diff = await client.get_pr_diff(
                review_data.repo_full_name or review_data.repo_name,
                review_data.pr_number,
            )
            review_data.code_diff = code_diff
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch PR diff: {str(e)}",
            )

    review = Review(
        user_id=current_user.id,
        review_type=review_data.review_type.value,
        pr_url=review_data.pr_url,
        pr_number=review_data.pr_number,
        repo_name=review_data.repo_name,
        repo_full_name=review_data.repo_full_name,
        branch_name=review_data.branch_name,
        target_branch=review_data.target_branch,
        code_diff=review_data.code_diff,
        original_code=review_data.original_code,
        review_mode=review_data.review_mode.value,
        status="processing",
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    background_tasks.add_task(
        process_ai_review,
        review.id,
        review_data.code_diff,
        review_data.original_code,
        review_data.repo_full_name or review_data.repo_name,
        review_data.branch_name or "",
    )

    return review


def process_ai_review(
    review_id: int,
    code_diff: str,
    original_code: str,
    repo_name: str = "",
    branch_name: str = "",
):
    from app.database import SessionLocal
    from app.models import Review

    db = SessionLocal()
    try:
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            return

        analysis = asyncio.run(
            ai_engine.analyze_code(code_diff, original_code, repo_name, branch_name)
        )
        reviewed_code = asyncio.run(
            ai_engine.generate_reviewed_code(original_code, analysis)
        )

        review.ai_feedback = analysis.dict()
        review.reviewed_code = reviewed_code
        review.safety_score = analysis.safety_score
        review.status = "completed"
        db.commit()

        redis_client.cache_review(
            review_id,
            {
                "id": review.id,
                "status": review.status,
                "ai_feedback": review.ai_feedback,
            },
        )

    except Exception as e:
        review.status = "failed"
        db.commit()
        print(f"AI review error: {e}")
    finally:
        db.close()


@router.get("/", response_model=List[ReviewResponse])
async def get_reviews(
    skip: int = 0,
    limit: int = 50,
    review_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Review).filter(Review.user_id == current_user.id)

    if review_type:
        query = query.filter(Review.review_type == review_type)
    if status_filter:
        query = query.filter(Review.status == status_filter)

    reviews = query.order_by(Review.created_at.desc()).offset(skip).limit(limit).all()
    return reviews


@router.get("/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cached = redis_client.get_cached_review(review_id)
    if cached:
        return cached

    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.user_id == current_user.id)
        .first()
    )

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )

    return review


@router.post("/{review_id}/messages", response_model=ChatMessageResponse)
async def add_chat_message(
    review_id: int,
    message_data: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.user_id == current_user.id)
        .first()
    )

    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    user_message = ChatMessage(
        review_id=review_id, role=message_data.role.value, content=message_data.content
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    if message_data.role == "user":
        ai_response = asyncio.run(
            ai_engine.chat_with_code(review.original_code, message_data.content, None)
        )

        ai_message = ChatMessage(review_id=review_id, role="ai", content=ai_response)
        db.add(ai_message)
        db.commit()
        db.refresh(ai_message)

        return ai_message

    return user_message


@router.get("/{review_id}/messages", response_model=List[ChatMessageResponse])
async def get_chat_messages(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.user_id == current_user.id)
        .first()
    )

    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.review_id == review_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return messages


@router.put("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: int,
    review_data: ReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.user_id == current_user.id)
        .first()
    )

    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    for field, value in review_data.dict(exclude_unset=True).items():
        if hasattr(value, "value"):
            value = value.value
        setattr(review, field, value)

    db.commit()
    db.refresh(review)

    redis_client.delete(f"review:{review_id}")

    return review


@router.delete("/{review_id}", response_model=MessageResponse)
async def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.user_id == current_user.id)
        .first()
    )

    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    db.delete(review)
    db.commit()

    redis_client.delete(f"review:{review_id}")

    return {"message": "Review deleted successfully", "success": True}
