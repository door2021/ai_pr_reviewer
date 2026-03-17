from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.database import get_db
from app.models import User, Review, ChatMessage, GitHubAccount, GitHubRepoImport, GitHubPR
from app.schemas import (
    ReviewCreate, 
    ReviewUpdate, 
    ReviewResponse, 
    ChatMessageCreate, 
    ChatMessageResponse,
    MessageResponse,
    AIAnalysis
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
    current_user: User = Depends(get_current_user)
):
    """Create a new code review (for imported PRs)"""
    
    # Get GitHub account if provided
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
    
    # Get imported repo if provided
    imported_repo = None
    if review_data.imported_repo_id:
        imported_repo = db.query(GitHubRepoImport).filter(
            GitHubRepoImport.id == review_data.imported_repo_id,
            GitHubRepoImport.is_active == True
        ).first()
        
        if not imported_repo:
            raise HTTPException(status_code=404, detail="Imported repo not found")
    
    # Get PR if provided
    pr = None
    if review_data.pr_id:
        pr = db.query(GitHubPR).filter(
            GitHubPR.id == review_data.pr_id,
            GitHubPR.is_active == True
        ).first()
        
        if not pr:
            raise HTTPException(status_code=404, detail="PR not found")
        
        # Fetch PR code from GitHub
        if github_account and imported_repo:
            try:
                client = get_github_client(github_account.access_token)
                diff = await client.get_pr_diff(imported_repo.repo_full_name, pr.pr_number)
                review_data.code_diff = diff
                review_data.original_code = diff  # For now, use diff as original
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to fetch PR code: {str(e)}"
                )
    
    # Create review record
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
    
    # Process AI review in background
    background_tasks.add_task(
        process_ai_review, 
        review.id, 
        review_data.code_diff, 
        review_data.original_code,
        review_data.repo_full_name or "",
        review_data.branch_name or ""
    )
    
    return review

def process_ai_review(
    review_id: int, 
    code_diff: str, 
    original_code: str,
    repo_name: str = "",
    branch_name: str = ""
):
    """Background task to process AI review"""
    from app.database import SessionLocal
    
    db = SessionLocal()
    try:
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            return
        
        # AI Analysis
        analysis = asyncio.run(ai_engine.analyze_code(
            code_diff, 
            original_code, 
            repo_name, 
            branch_name
        ))
        
        # Generate reviewed code
        reviewed_code = asyncio.run(ai_engine.generate_reviewed_code(original_code, analysis))
        
        # Update review
        review.ai_feedback = analysis.dict()
        review.reviewed_code = reviewed_code
        review.safety_score = analysis.safety_score
        review.status = "completed"
        
        # Auto-merge if enabled and safe
        user = db.query(User).filter(User.id == review.user_id).first()
        if user and user.review_mode == "automatic" and analysis.safety_score >= user.auto_merge_threshold:
            review.status = "auto_merged"
            # Background task to merge on GitHub would go here
        
        db.commit()
        
        # Cache in Redis
        redis_client.cache_review(review_id, {
            "id": review.id,
            "status": review.status,
            "ai_feedback": review.ai_feedback
        })
        
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

@router.get("/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific review"""
    cached = redis_client.get_cached_review(review_id)
    if cached:
        return cached
    
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
    
    if message_data.role == "user":
        # Generate AI response
        ai_response = asyncio.run(ai_engine.chat_with_code(
            review.original_code,
            message_data.content,
            None
        ))
        
        ai_message = ChatMessage(
            review_id=review_id,
            role="ai",
            content=ai_response
        )
        db.add(ai_message)
        db.commit()
        db.refresh(ai_message)
        
        return ai_message
    
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
    
    redis_client.delete(f"review:{review_id}")
    
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
    
    redis_client.delete(f"review:{review_id}")
    
    return {"message": "Review deleted successfully", "success": True}