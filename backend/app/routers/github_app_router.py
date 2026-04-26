from typing import Optional
from fastapi import APIRouter, Depends, Request, Header
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import User, GitHubAccount, GitHubRepoImport
from app.dependencies import get_current_user
from app.config import settings
from app.github_app import get_installation_token, get_installation_repos
from app.github_client import GitHubClient

router = APIRouter(prefix="/github-app", tags=["GitHub App"])


@router.get("/install")
async def start_installation(
    current_user: User = Depends(get_current_user),
):
    if not settings.GITHUB_APP_NAME:
        from fastapi import HTTPException
        raise HTTPException(400, "GITHUB_APP_NAME not configured in .env")

    state = f"user_{current_user.id}"
    install_url = (
        f"https://github.com/apps/{settings.GITHUB_APP_NAME}/installations/new"
        f"?state={state}"
    )
    return RedirectResponse(url=install_url)


@router.get("/callback")
async def installation_callback(
    installation_id: int,
    setup_action: str = "install",
    state: Optional[str] = None,
    db: Session = Depends(get_db),
):
    user_id = None
    if state and state.startswith("user_"):
        try:
            user_id = int(state.split("_")[1])
        except ValueError:
            pass

    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            await _sync_installation(installation_id, user, db)

    frontend_url = settings.FRONTEND_URL or "http://localhost:5173"
    return RedirectResponse(url=f"{frontend_url}/dashboard?installed=true")


@router.get("/installations")
async def list_installations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = (
        db.query(GitHubAccount)
        .filter(
            GitHubAccount.user_id == current_user.id,
            GitHubAccount.is_active == True,
            GitHubAccount.installation_id != None,
        )
        .all()
    )
    return [
        {
            "id": acc.id,
            "installation_id": acc.installation_id,
            "github_username": acc.github_username,
            "github_avatar_url": acc.github_avatar_url,
            "account_label": acc.account_label,
        }
        for acc in accounts
    ]


@router.get("/repos")
async def list_app_repos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = (
        db.query(GitHubAccount)
        .filter(
            GitHubAccount.user_id == current_user.id,
            GitHubAccount.is_active == True,
            GitHubAccount.installation_id != None,
        )
        .all()
    )

    all_repos = []
    for account in accounts:
        try:
            repos = await get_installation_repos(account.installation_id)
            for repo in repos:
                all_repos.append({
                    "id": repo["id"],
                    "name": repo["name"],
                    "full_name": repo["full_name"],
                    "private": repo["private"],
                    "default_branch": repo.get("default_branch", "main"),
                    "description": repo.get("description"),
                    "installation_id": account.installation_id,
                    "account_id": account.id,
                })
        except Exception as e:
            print(f"[github-app] Failed to get repos for installation {account.installation_id}: {e}")

    return all_repos


@router.post("/webhook")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
):
    
    event = x_github_event or "unknown"
    print(f"[webhook] Received {event} — no-op (Option 1 pull-based mode)")
    return {"received": True}


async def _sync_installation(installation_id: int, user: User, db: Session):

    try:
        token = await get_installation_token(installation_id)
        client = GitHubClient(token)
        gh_user = await client.get_user()
        github_username = gh_user.get("login", "")

        # Find existing account by username or create new
        account = (
            db.query(GitHubAccount)
            .filter(
                GitHubAccount.user_id == user.id,
                GitHubAccount.github_username == github_username,
            )
            .first()
        )

        if not account:
            account = GitHubAccount(
                user_id=user.id,
                github_username=github_username,
                github_user_id=gh_user.get("id"),
                github_avatar_url=gh_user.get("avatar_url"),
                access_token="github-app-installation",
                account_label=f"{github_username} (via GitHub App)",
                is_active=True,
                is_token_valid=True,
            )
            db.add(account)
            db.flush()

        account.installation_id = installation_id
        account.github_avatar_url = gh_user.get("avatar_url")
        db.commit()

        print(f"[github-app] Installation {installation_id} linked to user {user.id} (@{github_username})")

    except Exception as e:
        print(f"[github-app] _sync_installation error: {e}")
        db.rollback()