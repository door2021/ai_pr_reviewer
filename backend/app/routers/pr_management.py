from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import User, Review, GitHubAccount, GitHubRepoImport, GitHubPR
from app.schemas import (
    ReviewResponse, 
    MessageResponse, 
    PRMergeRequest, 
    PRApproveRequest, 
    PRChangesRequest
)
from app.dependencies import get_current_user
from app.github_client import get_github_client

router = APIRouter(prefix="/pr", tags=["PR Management"])

@router.post("/{review_id}/approve", response_model=MessageResponse)
async def approve_pr(
    review_id: int,
    request_data: Optional[PRApproveRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve a GitHub PR"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not review.github_account_id:
        raise HTTPException(status_code=400, detail="Not an imported PR")
    
    github_account = db.query(GitHubAccount).filter(
        GitHubAccount.id == review.github_account_id,
        GitHubAccount.is_active == True
    ).first()
    
    if not github_account or not github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(github_account.access_token)
        comment = request_data.comment if request_data else "Approved via AI PR Reviewer"
        await client.approve_pr(review.repo_full_name, review.pr_number, comment)
        
        review.status = "approved"
        review.github_action_taken = "approved"
        db.commit()
        
        return {"message": "PR approved successfully on GitHub", "success": True}
    
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
    """Request changes on a GitHub PR"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not review.github_account_id:
        raise HTTPException(status_code=400, detail="Not an imported PR")
    
    github_account = db.query(GitHubAccount).filter(
        GitHubAccount.id == review.github_account_id,
        GitHubAccount.is_active == True
    ).first()
    
    if not github_account or not github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(github_account.access_token)
        await client.request_changes(review.repo_full_name, review.pr_number, request_data.comment)
        
        review.status = "changes_requested"
        review.github_action_taken = "changes_requested"
        db.commit()
        
        return {"message": "Changes requested on GitHub", "success": True}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to request changes: {str(e)}"
        )

@router.post("/{review_id}/merge", response_model=MessageResponse)
async def merge_pr(
    review_id: int,
    request_data: Optional[PRMergeRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge a GitHub PR"""
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if not review.github_account_id:
        raise HTTPException(status_code=400, detail="Not an imported PR")
    
    github_account = db.query(GitHubAccount).filter(
        GitHubAccount.id == review.github_account_id,
        GitHubAccount.is_active == True
    ).first()
    
    if not github_account or not github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(github_account.access_token)
        
        merge_method = request_data.merge_method.value if request_data else "squash"
        commit_title = request_data.commit_title if request_data else f"Merged via AI PR Reviewer"
        
        result = await client.merge_pr(
            review.repo_full_name,
            review.pr_number,
            merge_method=merge_method,
            commit_title=commit_title
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        review.status = "merged"
        review.github_action_taken = "merged"
        db.commit()
        
        return {"message": "PR merged successfully", "success": True}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to merge PR: {str(e)}"
        )