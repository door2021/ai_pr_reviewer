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


# ==========================================================
# ACCOUNT ENDPOINTS
# ==========================================================

@router.post("/connect-account", response_model=GitHubAccountResponse)
async def connect_github_account(
    request: GitHubAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Connect GitHub account with PAT"""
    try:
        client = get_github_client(request.access_token)
        user_info = await client.get_user()

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
    """Disconnect a GitHub account"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account.is_active = False
    db.commit()
    return {"message": "GitHub account disconnected", "success": True}


@router.get("/accounts/{account_id}/available-repos", response_model=List[GitHubRepoListItem])
async def get_available_repos_for_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch repos from GitHub for a given account (for import modal)"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if not account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token is invalid or expired")

    try:
        client = get_github_client(account.access_token)
        repos = await client.get_repos()
        return [
            GitHubRepoListItem(
                id=r["id"],
                name=r["name"],
                full_name=r["full_name"],
                html_url=r["html_url"],
                private=r["private"],
                default_branch=r.get("default_branch", "main"),
                description=r.get("description")
            )
            for r in repos
        ]
    except Exception as e:
        # Mark token as invalid if GitHub returns 401
        if "401" in str(e):
            account.is_token_valid = False
            db.commit()
            raise HTTPException(status_code=401, detail="GitHub token expired — please reconnect")
        raise HTTPException(status_code=500, detail=f"Failed to fetch repos: {str(e)}")


@router.post("/accounts/{account_id}/sync", response_model=MessageResponse)
async def sync_account_repos(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sync all imported repos for a given account (refresh PRs)"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if not account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")

    repos = db.query(GitHubRepoImport).filter(
        GitHubRepoImport.github_account_id == account_id,
        GitHubRepoImport.is_active == True
    ).all()

    for repo in repos:
        sync_repo_prs(repo.id, account.access_token)

    account.last_synced_at = datetime.utcnow()
    db.commit()

    return {"message": f"Synced {len(repos)} repos for @{account.github_username}", "success": True}


# ==========================================================
# REPO IMPORT ENDPOINTS
# ==========================================================

@router.post("/import-repos", response_model=RepoImportResponse)
async def import_repos(
    request: GitHubRepoImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import selected repos from a GitHub account"""
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
            existing = db.query(GitHubRepoImport).filter(
                GitHubRepoImport.github_account_id == account.id,
                GitHubRepoImport.repo_full_name == repo_full_name,
            ).first()

            if existing:
                existing.is_active = True
                db.commit()
                imported_repos.append(existing)
                continue

            repo_data = await client.get_repo_details(repo_full_name)

            imported_repo = GitHubRepoImport(
                github_account_id=account.id,
                repo_name=repo_data["name"],
                repo_full_name=repo_data["full_name"],
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

            background_tasks.add_task(sync_repo_prs, imported_repo.id, account.access_token)
            imported_repos.append(imported_repo)

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
        raise HTTPException(status_code=500, detail=f"Failed to import repos: {str(e)}")


@router.get("/repos", response_model=List[GitHubRepoResponse])
async def get_imported_repos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all imported repos for user (all accounts)"""
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


# ==========================================================
# REPO SYNC
# ==========================================================

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

    sync_repo_prs(repo_id, repo.github_account.access_token)
    return {"message": "Repo sync started", "success": True}


def sync_repo_prs(repo_id: int, access_token: str):
    """Background task: sync open PRs for a repo, mark closed PRs inactive"""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        repo = db.query(GitHubRepoImport).filter(GitHubRepoImport.id == repo_id).first()
        if not repo:
            return

        client = get_github_client(access_token)

        # Fetch open PRs from GitHub
        open_prs = asyncio.run(client.get_pull_requests(repo.repo_full_name, state="open"))
        open_pr_numbers = {pr["number"] for pr in open_prs}

        for pr_data in open_prs:
            existing = db.query(GitHubPR).filter(
                GitHubPR.repo_id == repo_id,
                GitHubPR.pr_number == pr_data["number"]
            ).first()

            if existing:
                existing.title = pr_data["title"]
                existing.body = pr_data.get("body")
                existing.state = pr_data["state"]
                existing.head_ref = pr_data["head"]["ref"]
                existing.head_sha = pr_data["head"]["sha"]
                existing.base_ref = pr_data["base"]["ref"]
                existing.is_active = True
                existing.last_synced_at = datetime.utcnow()
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

        # Mark previously open PRs as closed if no longer in open list
        all_tracked = db.query(GitHubPR).filter(
            GitHubPR.repo_id == repo_id,
            GitHubPR.state == "open",
            GitHubPR.is_active == True
        ).all()
        for tracked_pr in all_tracked:
            if tracked_pr.pr_number not in open_pr_numbers:
                tracked_pr.state = "closed"
                tracked_pr.is_active = False

        repo.is_synced = True
        repo.last_synced_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        print(f"PR sync error for repo {repo_id}: {e}")
        db.rollback()
    finally:
        db.close()


# ==========================================================
# PR ENDPOINTS
# ==========================================================

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


@router.get("/prs/{pr_id}/status")
async def check_pr_status(
    pr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check real-time PR status from GitHub before merging.
    Returns is_open, state, mergeable.
    """
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
        details = await client.get_pr_details(pr.repo.repo_full_name, pr.pr_number)

        state = details.get("state", "unknown")
        is_open = state == "open"
        mergeable = details.get("mergeable", None)  # None = GitHub still computing
        merged = details.get("merged", False)

        # Update our local DB state
        if not is_open and pr.state == "open":
            pr.state = "merged" if merged else "closed"
            pr.is_active = False
            db.commit()

        return {
            "is_open": is_open,
            "state": state,
            "merged": merged,
            "mergeable": mergeable,
            "mergeable_state": details.get("mergeable_state", "unknown"),
            "pr_number": pr.pr_number,
            "repo_full_name": pr.repo.repo_full_name,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check PR status: {str(e)}")


@router.post("/prs/{pr_id}/comment", response_model=MessageResponse)
async def add_pr_comment(
    pr_id: int,
    comment: UserCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Post a comment to a GitHub PR"""
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
        await client.create_pr_comment(pr.repo.repo_full_name, pr.pr_number, comment.content)
        return {"message": "Comment posted to GitHub PR", "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to post comment: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Failed to approve PR: {str(e)}")


@router.post("/prs/{pr_id}/merge", response_model=MessageResponse)
async def merge_pr(
    pr_id: int,
    merge_method: str = "squash",
    commit_title: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Merge a GitHub PR.
    Always verifies:
      1. PR belongs to current user's account
      2. PR is still open on GitHub (not already merged/closed)
      3. Merges into the correct branch of the correct repo using the correct account token
    """
    pr = db.query(GitHubPR).join(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubPR.id == pr_id,
        GitHubAccount.user_id == current_user.id
    ).first()

    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    if not pr.repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired — please reconnect your account")

    # Validate merge method
    valid_methods = {"merge", "squash", "rebase"}
    if merge_method not in valid_methods:
        raise HTTPException(status_code=400, detail=f"Invalid merge method. Use one of: {valid_methods}")

    try:
        client = get_github_client(pr.repo.github_account.access_token)

        # ── Pre-merge check: verify PR is still open on GitHub ──
        live_details = await client.get_pr_details(pr.repo.repo_full_name, pr.pr_number)
        live_state = live_details.get("state", "unknown")

        if live_state != "open":
            # Update local DB to reflect current state
            pr.state = "merged" if live_details.get("merged") else "closed"
            pr.is_active = False
            db.commit()
            raise HTTPException(
                status_code=409,
                detail=f"PR #{pr.pr_number} is already {pr.state} — cannot merge."
            )

        mergeable = live_details.get("mergeable")
        if mergeable is False:
            raise HTTPException(
                status_code=409,
                detail=f"PR #{pr.pr_number} has merge conflicts. Resolve conflicts before merging."
            )

        # ── Execute merge into correct branch of correct repo ──
        final_commit_title = commit_title or (
            f"Merged PR #{pr.pr_number}: {pr.title} ({pr.head_ref} → {pr.base_ref})"
        )

        result = await client.merge_pr(
            repo=pr.repo.repo_full_name,     # correct repo
            pr_number=pr.pr_number,
            merge_method=merge_method,
            commit_title=final_commit_title,
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        # ── Update local state ──
        pr.state = "merged"
        pr.is_active = False
        db.commit()

        return {
            "message": f"PR #{pr.pr_number} merged successfully into {pr.base_ref}",
            "success": True
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to merge PR: {str(e)}")