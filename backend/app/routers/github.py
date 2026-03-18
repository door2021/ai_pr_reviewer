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


@router.post("/accounts/{account_id}/validate-token", response_model=MessageResponse)
async def validate_account_token(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if the stored token for an account is still valid by calling GitHub API"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        client = get_github_client(account.access_token)
        await client.get_user()  # Will 401 if token expired
        account.is_token_valid = True
        db.commit()
        return {"message": "Token is valid", "success": True}
    except Exception:
        account.is_token_valid = False
        db.commit()
        raise HTTPException(
            status_code=401,
            detail=f"Token for @{account.github_username} has expired. Please reconnect with a new token."
        )


@router.post("/accounts/{account_id}/reconnect", response_model=MessageResponse)
async def reconnect_account(
    account_id: int,
    request: GitHubAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update the access token for an existing account (re-auth after expiry)"""
    account = db.query(GitHubAccount).filter(
        GitHubAccount.id == account_id,
        GitHubAccount.user_id == current_user.id,
        GitHubAccount.is_active == True
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        client = get_github_client(request.access_token)
        user_info = await client.get_user()

        # Ensure the token belongs to the same GitHub user
        if user_info["login"] != account.github_username:
            raise HTTPException(
                status_code=400,
                detail=f"Token belongs to @{user_info['login']} but account is @{account.github_username}"
            )

        account.access_token = request.access_token
        account.is_token_valid = True
        account.last_synced_at = datetime.utcnow()
        db.commit()
        return {"message": f"Account @{account.github_username} reconnected successfully", "success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reconnect: {str(e)}")



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
        err_str = str(e)
        # Auto-mark token invalid on any 401 from GitHub
        if "401" in err_str or "Bad credentials" in err_str:
            account.is_token_valid = False
            db.commit()
            raise HTTPException(
                status_code=401,
                detail=f"GitHub token for @{account.github_username} has expired. Please reconnect."
            )
        raise HTTPException(status_code=500, detail=f"Failed to fetch repos: {err_str}")


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
        await asyncio.to_thread(sync_repo_prs, repo.id, account.access_token)

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

            # Fetch repo details directly by name — no need to list all repos
            try:
                repo_data = await client.get_repo_details(repo_full_name)
            except Exception as e:
                if "401" in str(e) or "404" in str(e):
                    raise HTTPException(
                        status_code=404,
                        detail=f"Repo '{repo_full_name}' not found or not accessible with this token."
                    )
                raise

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
    """Force sync PRs for a repo from GitHub"""
    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()

    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    if not repo.github_account.is_token_valid:
        raise HTTPException(
            status_code=401,
            detail=f"GitHub token for @{repo.github_account.github_username} has expired. Please reconnect."
        )

    # Run in thread pool — sync_repo_prs is fully synchronous
    await asyncio.to_thread(sync_repo_prs, repo_id, repo.github_account.access_token)

    # Check how many PRs we now have
    db.expire_all()
    pr_count = db.query(GitHubPR).filter(
        GitHubPR.repo_id == repo_id,
        GitHubPR.is_active == True
    ).count()

    return {"message": f"Synced successfully — {pr_count} open PR(s)", "success": True}


def sync_repo_prs(repo_id: int, access_token: str):
    """
    Sync open PRs for a repo from GitHub.
    Fully synchronous — safe to call from asyncio.to_thread() or background tasks.
    Uses httpx sync client directly, no asyncio.run() inside.
    """
    import httpx
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        repo = db.query(GitHubRepoImport).filter(GitHubRepoImport.id == repo_id).first()
        if not repo:
            return

        headers = {
            "Authorization": f"token {access_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Fetch open PRs from GitHub using sync httpx
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"https://api.github.com/repos/{repo.repo_full_name}/pulls",
                headers=headers,
                params={"state": "open", "per_page": 100},
            )

        if resp.status_code == 401:
            # Token expired — mark it invalid
            account = repo.github_account
            if account:
                account.is_token_valid = False
                db.commit()
            print(f"[sync] Token expired for repo {repo.repo_full_name}")
            return

        resp.raise_for_status()
        open_prs = resp.json()
        open_pr_numbers = {pr["number"] for pr in open_prs}

        print(f"[sync] Found {len(open_prs)} open PRs for {repo.repo_full_name}")

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
                new_pr = GitHubPR(
                    repo_id=repo_id,
                    pr_number=pr_data["number"],
                    pr_id=pr_data["id"],
                    title=pr_data["title"],
                    body=pr_data.get("body"),
                    state=pr_data["state"],
                    head_ref=pr_data["head"]["ref"],
                    head_sha=pr_data["head"]["sha"],
                    base_ref=pr_data["base"]["ref"],
                    base_sha=pr_data.get("base", {}).get("sha"),
                    author_login=pr_data["user"]["login"],
                    author_avatar_url=pr_data["user"].get("avatar_url"),
                    created_at_github=pr_data["created_at"],
                    updated_at_github=pr_data["updated_at"],
                    commits=pr_data.get("commits", 0),
                    additions=pr_data.get("additions", 0),
                    deletions=pr_data.get("deletions", 0),
                    is_active=True
                )
                db.add(new_pr)

        # Mark PRs no longer in the open list as closed
        tracked_open = db.query(GitHubPR).filter(
            GitHubPR.repo_id == repo_id,
            GitHubPR.state == "open",
            GitHubPR.is_active == True
        ).all()
        for tracked in tracked_open:
            if tracked.pr_number not in open_pr_numbers:
                tracked.state = "closed"
                tracked.is_active = False

        repo.is_synced = True
        repo.last_synced_at = datetime.utcnow()
        db.commit()
        print(f"[sync] Committed PRs for repo {repo_id}")

    except Exception as e:
        err_str = str(e)
        print(f"[sync] PR sync error for repo {repo_id}: {err_str}")
        db.rollback()
    finally:
        db.close()


# ==========================================================
# DEBUG — remove in production
# ==========================================================

@router.get("/repos/{repo_id}/debug-sync")
async def debug_sync(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Debug: fetch PRs live from GitHub and return raw result + what's in DB."""
    import httpx

    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
    ).first()

    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    token = repo.github_account.access_token
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"https://api.github.com/repos/{repo.repo_full_name}/pulls",
                headers=headers,
                params={"state": "open", "per_page": 100},
            )
        github_status = resp.status_code
        github_prs = resp.json() if resp.status_code == 200 else resp.text
    except Exception as e:
        github_status = "error"
        github_prs = str(e)

    db_prs = db.query(GitHubPR).filter(
        GitHubPR.repo_id == repo_id
    ).all()

    return {
        "repo_id": repo_id,
        "repo_full_name": repo.repo_full_name,
        "token_valid": repo.github_account.is_token_valid,
        "github_api_status": github_status,
        "github_open_prs_count": len(github_prs) if isinstance(github_prs, list) else "error",
        "github_pr_numbers": [p["number"] for p in github_prs] if isinstance(github_prs, list) else github_prs,
        "db_prs_total": len(db_prs),
        "db_prs": [{"id": p.id, "number": p.pr_number, "title": p.title, "state": p.state, "is_active": p.is_active} for p in db_prs],
    }


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
    """
    Get PRs for a repo.
    force_sync=true  → fetch live from GitHub and upsert in the SAME db session, then return.
    force_sync=false → return cached rows only.
    """
    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()

    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    if not repo.github_account.is_token_valid:
        raise HTTPException(status_code=401,
            detail=f"GitHub token for @{repo.github_account.github_username} has expired.")

    if force_sync:
        account_id_for_error = repo.github_account_id
        repo_name_for_log = repo.repo_full_name
        access_token = repo.github_account.access_token

        try:
            client = get_github_client(access_token)
            open_prs_raw = await client.get_pull_requests(repo_name_for_log, state="open")
            print(f"[pulls] GitHub returned {len(open_prs_raw)} open PR(s) for {repo_name_for_log}")

            open_pr_numbers = {p["number"] for p in open_prs_raw}

            def parse_dt(val):
                if not val:
                    return None
                try:
                    return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    return None

            for pr_data in open_prs_raw:
                print(f"[pulls] Processing PR #{pr_data['number']}: {pr_data['title']}")
                try:
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
                        existing.updated_at_github = parse_dt(pr_data.get("updated_at"))
                        print(f"[pulls] Updated PR #{pr_data['number']}")
                    else:
                        new_pr = GitHubPR(
                            repo_id=repo_id,
                            pr_number=int(pr_data["number"]),
                            pr_id=int(pr_data["id"]),
                            title=str(pr_data["title"]),
                            body=pr_data.get("body"),
                            state=str(pr_data["state"]),
                            head_ref=str(pr_data["head"]["ref"]),
                            head_sha=str(pr_data["head"]["sha"]),
                            base_ref=str(pr_data["base"]["ref"]),
                            base_sha=str(pr_data.get("base", {}).get("sha", "")),
                            author_login=str(pr_data["user"]["login"]),
                            author_avatar_url=pr_data["user"].get("avatar_url"),
                            created_at_github=parse_dt(pr_data.get("created_at")),
                            updated_at_github=parse_dt(pr_data.get("updated_at")),
                            commits=0,
                            additions=0,
                            deletions=0,
                            is_active=True
                        )
                        db.add(new_pr)
                        db.flush()  # catch constraint errors per-PR, not at commit
                        print(f"[pulls] Inserted PR #{pr_data['number']}")
                except Exception as pr_err:
                    import traceback
                    print(f"[pulls] ERROR on PR #{pr_data.get('number')}: {traceback.format_exc()}")
                    db.rollback()
                    raise

            # Mark PRs no longer open as closed
            for tracked in db.query(GitHubPR).filter(
                GitHubPR.repo_id == repo_id,
                GitHubPR.state == "open",
                GitHubPR.is_active == True
            ).all():
                if tracked.pr_number not in open_pr_numbers:
                    tracked.state = "closed"
                    tracked.is_active = False
                    print(f"[pulls] Closed PR #{tracked.pr_number}")

            repo.is_synced = True
            repo.last_synced_at = datetime.utcnow()
            db.commit()
            print(f"[pulls] Committed. Done.")

        except HTTPException:
            raise
        except Exception as e:
            import traceback
            full_tb = traceback.format_exc()
            print(f"[pulls] SYNC FAILED:\n{full_tb}")
            try:
                db.rollback()
            except Exception:
                pass
            # Re-check token validity in a fresh query
            try:
                err_str = str(e)
                if "401" in err_str or "Bad credentials" in err_str:
                    bad_account = db.query(GitHubAccount).filter(
                        GitHubAccount.id == account_id_for_error
                    ).first()
                    if bad_account:
                        bad_account.is_token_valid = False
                        db.commit()
            except Exception:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch PRs: {str(e)}"
            )

    prs = db.query(GitHubPR).filter(
        GitHubPR.repo_id == repo_id,
        GitHubPR.is_active == True
    ).order_by(GitHubPR.created_at_github.desc()).all()

    print(f"[pulls] Returning {len(prs)} PR(s) for repo {repo_id}")
    return [GitHubPRDetail.from_orm(pr) for pr in prs]


@router.get("/prs/{pr_id}/files")
async def get_pr_files(
    pr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch changed files and diff for a PR from GitHub"""
    pr = db.query(GitHubPR).join(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubPR.id == pr_id,
        GitHubAccount.user_id == current_user.id
    ).first()

    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    if not pr.repo.github_account.is_token_valid:
        raise HTTPException(status_code=401, detail="GitHub token expired")

    try:
        import httpx
        token = pr.repo.github_account.access_token
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        }
        # Get list of changed files with patch
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"https://api.github.com/repos/{pr.repo.repo_full_name}/pulls/{pr.pr_number}/files",
                headers=headers,
                params={"per_page": 100},
            )
        resp.raise_for_status()
        files = resp.json()

        return {
            "pr_number": pr.pr_number,
            "repo": pr.repo.repo_full_name,
            "files": [
                {
                    "filename": f["filename"],
                    "status": f["status"],          # added/modified/removed/renamed
                    "additions": f.get("additions", 0),
                    "deletions": f.get("deletions", 0),
                    "changes": f.get("changes", 0),
                    "patch": f.get("patch", ""),    # unified diff for this file
                    "previous_filename": f.get("previous_filename"),
                }
                for f in files
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch PR files: {str(e)}")



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
        err_msg = str(e)
        # Return 422 for known GitHub business-logic rejections (not server errors)
        if "cannot approve" in err_msg.lower() or "own pull request" in err_msg.lower():
            raise HTTPException(status_code=422, detail=err_msg)
        raise HTTPException(status_code=500, detail=f"Failed to approve PR: {err_msg}")


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