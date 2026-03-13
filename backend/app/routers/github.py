from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, GitHubRepo
from app.schemas import GitHubTokenRequest, GitHubRepoResponse, GitHubPR, MessageResponse
from app.dependencies import get_current_user
from app.github_client import get_github_client

router = APIRouter(prefix="/github", tags=["GitHub"])

@router.post("/connect", response_model=MessageResponse)
async def connect_github(
    token_data: GitHubTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        client = get_github_client(token_data.token)
        user_info = await client.get_user()
        
        current_user.github_username = user_info.get("login")
        current_user.github_token = token_data.token
        db.commit()
        
        repos = await client.get_repos()
        for repo in repos[:50]:
            existing = db.query(GitHubRepo).filter(
                GitHubRepo.repo_full_name == repo["full_name"]
            ).first()
            
            if not existing:
                github_repo = GitHubRepo(
                    user_id=current_user.id,
                    repo_name=repo["name"],
                    repo_full_name=repo["full_name"],
                    github_id=repo["id"]
                )
                db.add(github_repo)
        
        db.commit()
        
        return {"message": "GitHub connected successfully", "success": True}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to connect GitHub: {str(e)}"
        )

@router.get("/repos", response_model=List[GitHubRepoResponse])
async def get_connected_repos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    repos = db.query(GitHubRepo).filter(
        GitHubRepo.user_id == current_user.id,
        GitHubRepo.is_active == True
    ).all()
    return repos

@router.get("/pull-requests/{repo_name}", response_model=List[GitHubPR])
async def get_pull_requests(
    repo_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        client = get_github_client(current_user.github_token)
        prs = await client.get_pull_requests(repo_name)
        
        return [
            GitHubPR(
                number=pr["number"],
                title=pr["title"],
                url=pr["html_url"],
                state=pr["state"],
                created_at=pr["created_at"],
                user=pr["user"]
            )
            for pr in prs
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch PRs: {str(e)}"
        )

@router.post("/disconnect", response_model=MessageResponse)
async def disconnect_github(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.github_token = None
    current_user.github_username = None
    db.commit()
    
    return {"message": "GitHub disconnected successfully", "success": True}