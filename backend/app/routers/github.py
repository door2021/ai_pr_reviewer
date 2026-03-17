from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import asyncio
from app.database import get_db
from app.models import User, GitHubAccount, GitHubRepoImport, GitHubPR, Review
from app.schemas import (
    GitHubAccountCreate, 
    GitHubAccountResponse, 
    GitHubRepoListItem,
    GitHubRepoImportRequest, 
    GitHubPRDetail, 
    RepoImportResponse, 
    MessageResponse,
    UserCommentCreate,
    GitHubRepoResponse
)
from app.dependencies import get_current_user
from app.github_client import get_github_client

router = APIRouter(prefix="/github-import", tags=["GitHub Import"])

@router.post("/connect-account", response_model=GitHubAccountResponse)
async def connect_github_account(
    request: GitHubAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Connect GitHub account with PAT (token stored for future API calls)"""
    try:
        client = get_github_client(request.access_token)
        user_info = await client.get_user()
        
        # Check if account already exists
        existing = db.query(GitHubAccount).filter(
            GitHubAccount.user_id == current_user.id,
            GitHubAccount.github_username == user_info["login"],
            GitHubAccount.is_active == True
        ).first()
        
        if existing:
            existing.access_token = request.access_token
            existing.account_label = request.account_label or existing.account_label
            existing.is_token_valid = True
            existing.last_synced_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            return GitHubAccountResponse.from_orm(existing)
        
        # Create new account
        account = GitHubAccount(
            user_id=current_user.id,
            github_username=user_info["login"],
            github_user_id=user_info["id"],
            github_avatar_url=user_info.get("avatar_url"),
            access_token=request.access_token,
            account_label=request.account_label or f"account-{user_info['login']}",
            is_active=True,
            is_token_valid=True
        )
        db.add(account)
        db.commit()
        db.refresh(account)
        
        return GitHubAccountResponse.from_orm(account)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to connect GitHub account: {str(e)}"
        )

@router.get("/accounts", response_model=List[GitHubAccountResponse])
async def get_connected_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all connected GitHub accounts"""
    accounts = db.query(GitHubAccount).filter(
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).all()
    return accounts

@router.delete("/accounts/{account_id}", response_model=MessageResponse)
async def disconnect_github_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Disconnect GitHub account (soft delete)"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.is_active = False
    db.commit()
    
    return {"message": "GitHub account disconnected", "success": True}

@router.get("/accounts/{account_id}/repos", response_model=List[GitHubRepoListItem])
async def fetch_account_repos(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch all repos from a connected GitHub account"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if not account.is_token_valid:
        raise HTTPException(
            status_code=401,
            detail="GitHub token expired. Please reconnect account."
        )
    
    try:
        client = get_github_client(account.access_token)
        repos = await client.get_repos()
        
        return [
            GitHubRepoListItem(
                id=repo["id"],
                name=repo["name"],
                full_name=repo["full_name"],
                html_url=repo["html_url"],
                private=repo["private"],
                default_branch=repo["default_branch"],
                description=repo.get("description")
            )
            for repo in repos
        ]
    except Exception as e:
        # Token might be expired
        if "401" in str(e) or "bad credentials" in str(e).lower():
            account.is_token_valid = False
            db.commit()
            raise HTTPException(
                status_code=401,
                detail="GitHub token expired. Please reconnect account."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repos: {str(e)}"
        )

@router.post("/import-repos", response_model=RepoImportResponse)
async def import_repos(
    request: GitHubRepoImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import selected repos from a connected GitHub account"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == request.github_account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="GitHub account not found")
    
    if not account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(account.access_token)
        imported_repos = []
        
        for repo_full_name in request.repo_full_names:
            # Check if already imported
            existing = db.query(GitHubRepoImport).filter(
                GitHubRepoImport.github_account_id == account.id,
                GitHubRepoImport.repo_full_name == repo_full_name,
                GitHubRepoImport.is_active == True
            ).first()
            
            if existing:
                imported_repos.append(existing)
                continue
            
            # Fetch repo details
            owner, repo = repo_full_name.split("/")
            repos = await client.get_repos()
            repo_data = next((r for r in repos if r["full_name"] == repo_full_name), None)
            
            if not repo_data:
                continue
            
            # Create import record
            imported_repo = GitHubRepoImport(
                github_account_id=account.id,
                repo_name=repo_data["name"],
                repo_full_name=repo_full_name,
                github_id=repo_data["id"],
                default_branch=repo_data["default_branch"],
                description=repo_data.get("description"),
                is_private=repo_data["private"],
                is_active=True,
                is_synced=False
            )
            db.add(imported_repo)
            db.commit()
            db.refresh(imported_repo)
            
            # Background task: Fetch and cache open PRs
            background_tasks.add_task(sync_repo_prs, imported_repo.id, account.access_token)
            
            imported_repos.append(imported_repo)
        
        # Update account last synced
        account.last_synced_at = datetime.utcnow()
        db.commit()
        
        return RepoImportResponse(
            message=f"Successfully imported {len(imported_repos)} repos",
            success=True,
            imported_count=len(imported_repos),
            repos=[GitHubRepoResponse.from_orm(r) for r in imported_repos]
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import repos: {str(e)}"
        )

def sync_repo_prs(repo_id: int, access_token: str):
    """Background task to sync PRs for a repo"""
    from app.database import SessionLocal
    
    db = SessionLocal()
    try:
        repo = db.query(GitHubRepoImport).filter(GitHubRepoImport.id == repo_id).first()
        if not repo:
            return
        
        client = get_github_client(access_token)
        prs = asyncio.run(client.get_pull_requests(repo.repo_full_name, state="open"))
        
        for pr_data in prs:
            existing = db.query(GitHubPR).filter(
                GitHubPR.repo_id == repo_id,
                GitHubPR.pr_number == pr_data["number"]
            ).first()
            
            if existing:
                existing.title = pr_data["title"]
                existing.body = pr_data.get("body")
                existing.state = pr_data["state"]
                existing.head_ref = pr_data["head"]["ref"]
                existing.base_ref = pr_data["base"]["ref"]
                existing.updated_at_github = pr_data["updated_at"]
            else:
                pr = GitHubPR(
                    repo_id=repo_id,
                    pr_number=pr_data["number"],
                    pr_id=pr_data["id"],
                    title=pr_data["title"],
                    body=pr_data.get("body"),
                    state=pr_data["state"],
                    head_ref=pr_data["head"]["ref"],
                    head_sha=pr_data["head"]["sha"],
                    base_ref=pr_data["base"]["ref"],
                    base_sha=pr_data["base"]["sha"],
                    author_login=pr_data["user"]["login"],
                    author_avatar_url=pr_data["user"].get("avatar_url"),
                    created_at_github=pr_data["created_at"],
                    updated_at_github=pr_data["updated_at"],
                    commits=pr_data.get("commits", 0),
                    additions=pr_data.get("additions", 0),
                    deletions=pr_data.get("deletions", 0),
                    is_active=True
                )
                db.add(pr)
        
        repo.is_synced = True
        repo.last_synced_at = datetime.utcnow()
        db.commit()
        
    except Exception as e:
        print(f"PR sync error: {e}")
        db.rollback()
    finally:
        db.close()

@router.get("/repos", response_model=List[GitHubRepoResponse])
async def get_imported_repos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all imported repos for user (from all accounts)"""
    repos = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).all()
    return repos

@router.get("/accounts/{account_id}/repos", response_model=List[GitHubRepoResponse])
async def get_account_repos(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get imported repos for a specific account"""
    repos = db.query(GitHubRepoImport).filter(
        GitHubRepoImport.github_account_id == account_id,
        GitHubRepoImport.is_active == True
    ).all()
    return repos

@router.delete("/repos/{repo_id}", response_model=MessageResponse)
async def remove_imported_repo(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove an imported repo"""
    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Imported repo not found")
    
    repo.is_active = False
    db.commit()
    
    return {"message": "Repo removed from imports", "success": True}

@router.post("/repos/{repo_id}/sync", response_model=MessageResponse)
async def sync_repo(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Force sync PRs for a repo"""
    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    
    if not repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    # Sync in background
    sync_repo_prs(repo_id, repo.github_account.access_token)
    
    return {"message": "Repo sync started", "success": True}

@router.get("/repos/{repo_id}/pulls", response_model=List[GitHubPRDetail])
async def get_repo_prs(
    repo_id: int,
    force_sync: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get cached PRs for a repo"""
    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    
    if force_sync and repo.github_account.is_token_valid:
        sync_repo_prs(repo_id, repo.github_account.access_token)
    
    prs = db.query(GitHubPR).filter(
        GitHubPR.repo_id == repo_id,
        GitHubPR.is_active == True
    ).order_by(GitHubPR.created_at_github.desc()).all()
    
    return [GitHubPRDetail.from_orm(pr) for pr in prs]

@router.post("/prs/{pr_id}/comment", response_model=MessageResponse)
async def add_pr_comment(
    pr_id: int,
    comment: UserCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add comment to a GitHub PR"""
    pr = db.query(GitHubPR).join(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubPR.id == pr_id,
        GitHubAccount.user_id == current_user.id
    ).first()
    
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    if not pr.repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(pr.repo.github_account.access_token)
        await client.create_pr_comment(
            pr.repo.repo_full_name,
            pr.pr_number,
            comment.content
        )
        
        return {"message": "Comment posted to GitHub PR", "success": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to post comment: {str(e)}"
        )

@router.post("/prs/{pr_id}/approve", response_model=MessageResponse)
async def approve_pr(
    pr_id: int,
    comment: Optional[str] = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve a GitHub PR"""
    pr = db.query(GitHubPR).join(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubPR.id == pr_id,
        GitHubAccount.user_id == current_user.id
    ).first()
    
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    if not pr.repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(pr.repo.github_account.access_token)
        await client.approve_pr(
            pr.repo.repo_full_name,
            pr.pr_number,
            comment or "Approved via AI PR Reviewer"
        )
        
        return {"message": "PR approved on GitHub", "success": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve PR: {str(e)}"
        )

@router.post("/prs/{pr_id}/merge", response_model=MessageResponse)
async def merge_pr(
    pr_id: int,
    merge_method: str = "squash",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge a GitHub PR"""
    pr = db.query(GitHubPR).join(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubPR.id == pr_id,
        GitHubAccount.user_id == current_user.id
    ).first()
    
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    if not pr.repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")
    
    try:
        client = get_github_client(pr.repo.github_account.access_token)
        result = await client.merge_pr(
            pr.repo.repo_full_name,
            pr.pr_number,
            merge_method=merge_method,
            commit_title=f"Merged via AI PR Reviewer ({pr.head_ref} → {pr.base_ref})"
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return {"message": "PR merged successfully", "success": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to merge PR: {str(e)}"
        )