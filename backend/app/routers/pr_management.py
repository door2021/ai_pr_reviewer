from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import User, Review
from app.schemas import (
    ReviewResponse, MessageResponse, 
    PRMergeRequest, PRApproveRequest, PRChangesRequest
)
from app.dependencies import get_current_user
from app.github_client import get_github_client
from app.ai_engine import ai_engine
from app.workflows.pr_review_workflow import pr_review_workflow
from app.config import settings
import asyncio

router = APIRouter(prefix="/pr", tags=["PR Management"])

@router.post("/{review_id}/approve", response_model=MessageResponse)
async def approve_pr(
    review_id: int,
    request_data: PRApproveRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        parts = review.pr_url.split("/")
        if len(parts) < 7:
            raise HTTPException(status_code=400, detail="Invalid PR URL")
        
        repo_name = f"{parts[-4]}/{parts[-3]}"
        pr_number = int(parts[-1])
        
        client = get_github_client(current_user.github_token)
        verified, message = await client.verify_pr_ownership(
            repo_name, pr_number, review.repo_name or ""
        )
        
        if not verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Safety check failed: {message}"
            )
        
        comment = request_data.comment if request_data else ""
        await client.approve_pr(repo_name, pr_number, comment or "Approved via AI PR Reviewer")
        
        review.status = "approved"
        db.commit()
        
        return {
            "message": "PR approved successfully on GitHub",
            "success": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve PR: {str(e)}"
        )

@router.post("/{review_id}/request-changes", response_model=MessageResponse)
async def request_changes(
    review_id: int,
    request_data: PRChangesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        parts = review.pr_url.split("/")
        repo_name = f"{parts[-4]}/{parts[-3]}"
        pr_number = int(parts[-1])
        
        client = get_github_client(current_user.github_token)
        await client.request_changes(repo_name, pr_number, request_data.comment)
        
        review.status = "changes_requested"
        db.commit()
        
        return {
            "message": "Changes requested on GitHub",
            "success": True
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to request changes: {str(e)}"
        )

@router.post("/{review_id}/auto-merge", response_model=MessageResponse)
async def auto_merge_pr(
    review_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if review.review_mode != "automatic":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-merge only available for automatic review mode"
        )
    
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        parts = review.pr_url.split("/")
        repo_name = f"{parts[-4]}/{parts[-3]}"
        pr_number = int(parts[-1])
        
        background_tasks.add_task(
            execute_auto_merge_workflow,
            review_id,
            repo_name,
            pr_number,
            current_user.github_token,
            db
        )
        
        review.status = "processing"
        db.commit()
        
        return {
            "message": "Auto-merge workflow started",
            "success": True
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start auto-merge: {str(e)}"
        )

async def execute_auto_merge_workflow(
    review_id: int,
    repo_name: str,
    pr_number: int,
    github_token: str,
    db: Session
):
    from app.workflows.pr_review_workflow import PRReviewState
    
    try:
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review:
            return
        
        client = get_github_client(github_token)
        
        pr_details = await client.get_pr_details(repo_name, pr_number)
        branch_name = pr_details.get("head", {}).get("ref", "")
        
        verified, message = await client.verify_pr_ownership(
            repo_name, pr_number, review.repo_name or ""
        )
        if not verified:
            review.status = "failed"
            review.ai_feedback = {"error": message}
            db.commit()
            return
        
        protection = await client.get_branch_protection(repo_name, branch_name)
        ci_status = await client.get_ci_status(repo_name, pr_number)
        current_approvals = await client.get_pr_approvals(repo_name, pr_number)
        required_approvals = protection.get("required_approvals", settings.AUTO_MERGE_REQUIRE_REVIEWS)
        
        initial_state: PRReviewState = {
            "review_id": review_id,
            "pr_url": review.pr_url,
            "repo_name": repo_name,
            "pr_number": pr_number,
            "branch_name": branch_name,
            "code_diff": review.code_diff,
            "original_code": review.original_code,
            "review": None,
            "reviewed_code": None,
            "merge_decision": None,
            "ci_status": ci_status,
            "current_approvals": current_approvals,
            "required_approvals": required_approvals,
            "status": "running",
            "errors": []
        }
        
        final_state = pr_review_workflow.invoke(initial_state)
        
        if final_state.get("errors"):
            review.status = "failed"
            review.ai_feedback = {"errors": final_state["errors"]}
        elif final_state.get("merge_decision") and final_state["merge_decision"].should_merge:
            merge_result = await client.merge_pr(
                repo_name,
                pr_number,
                commit_title=f"Auto-merged by AI PR Reviewer (Safety Score: {final_state.get('review', {}).safety_score if final_state.get('review') else 0})",
                merge_method="squash"
            )
            
            if "error" not in merge_result:
                review.status = "merged"
                review.ai_feedback = {
                    "decision": final_state["merge_decision"].__dict__ if hasattr(final_state["merge_decision"], '__dict__') else {},
                    "merge_result": merge_result
                }
            else:
                review.status = "merge_failed"
                review.ai_feedback = {"merge_error": merge_result["error"]}
        else:
            review.status = "completed"
            review.ai_feedback = {
                "decision": final_state.get("merge_decision", {}).__dict__ if final_state.get("merge_decision") and hasattr(final_state.get("merge_decision"), '__dict__') else {},
                "reason": "Auto-merge declined by safety checks"
            }
        
        db.commit()
        
    except Exception as e:
        review.status = "failed"
        review.ai_feedback = {"error": str(e)}
        db.commit()

@router.post("/{review_id}/merge", response_model=MessageResponse)
async def merge_pr(
    review_id: int,
    request_data: PRMergeRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        parts = review.pr_url.split("/")
        repo_name = f"{parts[-4]}/{parts[-3]}"
        pr_number = int(parts[-1])
        
        client = get_github_client(current_user.github_token)
        
        verified, message = await client.verify_pr_ownership(
            repo_name, pr_number, review.repo_name or ""
        )
        
        if not verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Safety check failed: {message}"
            )
        
        merge_method = request_data.merge_method.value if request_data else "squash"
        commit_title = request_data.commit_title if request_data else f"Merged via AI PR Reviewer"
        
        result = await client.merge_pr(
            repo_name,
            pr_number,
            commit_title=commit_title,
            merge_method=merge_method
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        review.status = "merged"
        db.commit()
        
        return {
            "message": "PR merged successfully",
            "success": True
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to merge PR: {str(e)}"
        )