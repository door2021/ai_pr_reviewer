"""
GitHub App Router

Endpoints:
  GET  /github-app/install          → redirect to GitHub App installation page
  GET  /github-app/callback         → OAuth callback after installation
  POST /github-app/webhook          → receive GitHub events (PR opened, etc.)
  GET  /github-app/installations    → list user's installations
  GET  /github-app/repos            → list repos from all installations

Webhook events handled:
  pull_request.opened    → auto-trigger AI review (if user has auto mode)
  pull_request.reopened  → same as opened
  pull_request.closed    → mark PR as merged/closed in DB
  installation.created   → new user installed the app
  installation.deleted   → user uninstalled the app
"""

import json
import asyncio
import hashlib
import hmac
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, GitHubAccount, GitHubRepoImport, GitHubPR, Review
from app.dependencies import get_current_user
from app.config import settings
from app.github_app import (
    get_installation_token,
    get_installation_repos,
    verify_webhook_signature,
)
from app.github_client import GitHubClient
from app import ai_engine

router = APIRouter(prefix="/github-app", tags=["GitHub App"])


# ─────────────────────────────────────────────────────────────────────────────
# Installation OAuth flow
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/install")
async def start_installation(
    current_user: User = Depends(get_current_user),
):
    """
    Redirect user to GitHub to install the app on their account/org.
    GitHub will redirect back to /github-app/callback after install.
    We embed the user ID in the state param so we can link the installation.
    """
    if not settings.GITHUB_APP_NAME:
        raise HTTPException(400, "GITHUB_APP_NAME not configured in .env")

    # state param — we'll verify this in callback
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
    """
    GitHub redirects here after user installs/updates the app.
    We save the installation_id and immediately fetch repos.

    Query params GitHub sends:
      installation_id=12345678
      setup_action=install  (or "update")
      state=user_42         (what we sent in /install)
    """
    user_id = None
    if state and state.startswith("user_"):
        try:
            user_id = int(state.split("_")[1])
        except ValueError:
            pass

    # Save installation to DB
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            await _sync_installation(installation_id, user, db)

    # Redirect back to dashboard with success indicator
    frontend_url = settings.FRONTEND_URL or "http://localhost:5173"
    return RedirectResponse(url=f"{frontend_url}/dashboard?installed=true")


@router.get("/installations")
async def list_installations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all GitHub App installations linked to this user's accounts"""
    installations = (
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
        for acc in installations
    ]


@router.get("/repos")
async def list_app_repos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all repos accessible via GitHub App installations for this user"""
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


# ─────────────────────────────────────────────────────────────────────────────
# Webhook handler — the core of the GitHub App
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    x_github_delivery: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    GitHub sends ALL events here.
    We verify the signature, then dispatch based on event type.

    Key events:
      pull_request  → auto-review if user enabled auto mode
      installation  → save new install, remove uninstalls
    """
    payload_bytes = await request.body()

    # ── Signature verification — NEVER skip this ──────────────────────────
    if settings.GITHUB_WEBHOOK_SECRET:
        if not verify_webhook_signature(payload_bytes, x_hub_signature_256 or ""):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(payload_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = x_github_event or ""
    action = payload.get("action", "")
    print(f"[webhook] {event}.{action} delivery={x_github_delivery}")

    # ── Route events ──────────────────────────────────────────────────────
    if event == "pull_request":
        if action in ("opened", "reopened", "synchronize"):
            # New PR opened or updated — trigger auto-review in background
            background_tasks.add_task(
                handle_pr_opened, payload, db
            )
        elif action == "closed":
            background_tasks.add_task(
                handle_pr_closed, payload, db
            )

    elif event == "installation":
        if action == "created":
            background_tasks.add_task(
                handle_installation_created, payload, db
            )
        elif action == "deleted":
            background_tasks.add_task(
                handle_installation_deleted, payload, db
            )

    elif event == "installation_repositories":
        # User added/removed repos from an existing installation
        if action in ("added", "removed"):
            background_tasks.add_task(
                handle_repos_changed, payload, action, db
            )

    elif event == "ping":
        # GitHub sends this when you first set up a webhook — just confirm
        return {"message": "pong", "zen": payload.get("zen", "")}

    return {"received": True, "event": event, "action": action}


# ─────────────────────────────────────────────────────────────────────────────
# Background task handlers
# ─────────────────────────────────────────────────────────────────────────────

async def handle_pr_opened(payload: dict, db: Session):
    """
    A PR was opened or updated.
    1. Find which user owns this installation
    2. If they have auto mode enabled → run AI review and post comment
    3. If manual mode → just sync the PR into DB so it appears in dashboard
    """
    from app.database import SessionLocal

    installation_id = payload.get("installation", {}).get("id")
    pr_data = payload.get("pull_request", {})
    repo_data = payload.get("repository", {})

    if not installation_id or not pr_data:
        return

    repo_full_name = repo_data.get("full_name", "")
    pr_number = pr_data.get("number")

    print(f"[webhook] PR opened: {repo_full_name}#{pr_number} install={installation_id}")

    # Use fresh DB session for background task
    db = SessionLocal()
    try:
        # Find account with this installation
        account = (
            db.query(GitHubAccount)
            .filter(
                GitHubAccount.installation_id == installation_id,
                GitHubAccount.is_active == True,
            )
            .first()
        )

        if not account:
            print(f"[webhook] No account found for installation {installation_id}")
            return

        user = db.query(User).filter(User.id == account.user_id).first()
        if not user:
            return

        # Get installation token to call GitHub API
        token = await get_installation_token(installation_id)
        client = GitHubClient(token)

        # Find or create repo in DB
        repo = (
            db.query(GitHubRepoImport)
            .filter(
                GitHubRepoImport.github_account_id == account.id,
                GitHubRepoImport.repo_full_name == repo_full_name,
                GitHubRepoImport.is_active == True,
            )
            .first()
        )

        if not repo:
            # Auto-import repo when we get a webhook for it
            repo = GitHubRepoImport(
                github_account_id=account.id,
                repo_name=repo_data.get("name", ""),
                repo_full_name=repo_full_name,
                github_id=repo_data.get("id"),
                default_branch=repo_data.get("default_branch", "main"),
                description=repo_data.get("description"),
                is_private=repo_data.get("private", False),
                is_active=True,
                is_synced=True,
            )
            db.add(repo)
            db.flush()

        # Upsert PR record
        pr = (
            db.query(GitHubPR)
            .filter(
                GitHubPR.repo_id == repo.id,
                GitHubPR.pr_number == pr_number,
            )
            .first()
        )

        if not pr:
            pr = GitHubPR(repo_id=repo.id)
            db.add(pr)

        # Update PR fields from webhook payload
        pr.pr_number = pr_number
        pr.pr_id = pr_data.get("id")
        pr.title = pr_data.get("title", "")
        pr.body = pr_data.get("body", "")
        pr.state = pr_data.get("state", "open")
        pr.head_ref = pr_data.get("head", {}).get("ref", "")
        pr.head_sha = pr_data.get("head", {}).get("sha", "")
        pr.base_ref = pr_data.get("base", {}).get("ref", "")
        pr.base_sha = pr_data.get("base", {}).get("sha", "")
        pr.author_login = pr_data.get("user", {}).get("login")
        pr.author_avatar_url = pr_data.get("user", {}).get("avatar_url")
        pr.additions = pr_data.get("additions", 0)
        pr.deletions = pr_data.get("deletions", 0)
        pr.commits = pr_data.get("commits", 0)
        pr.is_active = True
        pr.last_synced_at = datetime.utcnow()
        db.commit()

        # ── Auto-review if user has auto mode ─────────────────────────────
        if user.review_mode == "automatic":
            print(f"[webhook] Auto-reviewing PR #{pr_number} for user {user.id}")
            await _run_auto_review(
                user=user,
                account=account,
                repo=repo,
                pr=pr,
                pr_data=pr_data,
                repo_full_name=repo_full_name,
                client=client,
                db=db,
            )
        else:
            # Manual mode — just post a comment that review is ready in dashboard
            try:
                await client.create_pr_comment(
                    repo=repo_full_name,
                    pr_number=pr_number,
                    comment=(
                        "👋 **AI PR Reviewer** is watching this PR.\n\n"
                        f"Open your [AI PR Reviewer dashboard]({settings.FRONTEND_URL}/dashboard) "
                        "to run an AI review and get feedback on this PR."
                    )
                )
            except Exception as e:
                print(f"[webhook] Failed to post comment: {e}")

    except Exception as e:
        print(f"[webhook] handle_pr_opened error: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


async def handle_pr_closed(payload: dict, db: Session):
    """Mark PR as closed/merged in DB"""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        pr_data = payload.get("pull_request", {})
        repo_data = payload.get("repository", {})
        repo_full_name = repo_data.get("full_name", "")
        pr_number = pr_data.get("number")
        merged = pr_data.get("merged", False)

        repo = db.query(GitHubRepoImport).filter(
            GitHubRepoImport.repo_full_name == repo_full_name,
            GitHubRepoImport.is_active == True,
        ).first()

        if repo:
            pr = db.query(GitHubPR).filter(
                GitHubPR.repo_id == repo.id,
                GitHubPR.pr_number == pr_number,
            ).first()
            if pr:
                pr.state = "merged" if merged else "closed"
                pr.is_active = False
                db.commit()
                print(f"[webhook] PR #{pr_number} marked as {'merged' if merged else 'closed'}")
    except Exception as e:
        print(f"[webhook] handle_pr_closed error: {e}")
    finally:
        db.close()


async def handle_installation_created(payload: dict, db: Session):
    """
    User installed the GitHub App.
    We need to link the installation_id to a user account.
    The linkage happens via the OAuth callback — this just logs it.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        installation = payload.get("installation", {})
        installation_id = installation.get("id")
        account_login = installation.get("account", {}).get("login", "")
        account_type = installation.get("account", {}).get("type", "")
        print(f"[webhook] New installation: id={installation_id} account={account_login} type={account_type}")

        # Try to find existing account by github_username and link the installation_id
        account = db.query(GitHubAccount).filter(
            GitHubAccount.github_username == account_login,
            GitHubAccount.is_active == True,
        ).first()

        if account:
            account.installation_id = installation_id
            db.commit()
            print(f"[webhook] Linked installation {installation_id} to account {account.id}")
    except Exception as e:
        print(f"[webhook] handle_installation_created error: {e}")
    finally:
        db.close()


async def handle_installation_deleted(payload: dict, db: Session):
    """User uninstalled the app — deactivate their installation"""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        installation = payload.get("installation", {})
        installation_id = installation.get("id")

        account = db.query(GitHubAccount).filter(
            GitHubAccount.installation_id == installation_id,
        ).first()

        if account:
            account.installation_id = None
            db.commit()
            print(f"[webhook] Installation {installation_id} removed for account {account.id}")
    except Exception as e:
        print(f"[webhook] handle_installation_deleted error: {e}")
    finally:
        db.close()


async def handle_repos_changed(payload: dict, action: str, db: Session):
    """User added or removed repos from their installation"""
    repos_key = "repositories_added" if action == "added" else "repositories_removed"
    repos = payload.get(repos_key, [])
    installation_id = payload.get("installation", {}).get("id")
    print(f"[webhook] Repos {action} for installation {installation_id}: {[r.get('full_name') for r in repos]}")


# ─────────────────────────────────────────────────────────────────────────────
# Auto-review helper
# ─────────────────────────────────────────────────────────────────────────────

async def _run_auto_review(
    user: User,
    account: GitHubAccount,
    repo: GitHubRepoImport,
    pr: GitHubPR,
    pr_data: dict,
    repo_full_name: str,
    client: GitHubClient,
    db: Session,
):
    """
    Run a full AI review on a PR triggered by webhook.
    Posts the result as a GitHub comment.
    """
    try:
        # Get the diff
        diff = await client.get_pr_diff(repo_full_name, pr.pr_number)
        if not diff:
            print(f"[auto-review] No diff for PR #{pr.pr_number}")
            return

        # Create review record in DB
        review = Review(
            user_id=user.id,
            github_account_id=account.id,
            imported_repo_id=repo.id,
            pr_id=pr.id,
            pr_url=pr_data.get("html_url", ""),
            pr_number=pr.pr_number,
            repo_full_name=repo_full_name,
            branch_name=pr.head_ref,
            target_branch=pr.base_ref,
            pr_title=pr.title,
            pr_description=pr.body or "",
            code_diff=diff,
            original_code=diff,
            status="processing",
        )
        db.add(review)
        db.commit()
        db.refresh(review)

        # Run AI analysis
        analysis = await ai_engine.analyze_code(
            code_diff=diff,
            original_code=diff,
            repo_name=repo_full_name,
            branch_name=pr.head_ref,
        )

        # Save results
        review.ai_feedback = analysis.dict() if hasattr(analysis, 'dict') else analysis
        review.safety_score = analysis.safety_score if hasattr(analysis, 'safety_score') else 0
        review.status = "completed"
        db.commit()

        # Format and post GitHub comment
        comment = _format_review_comment(analysis, pr.pr_number, user)
        await client.create_pr_comment(repo_full_name, pr.pr_number, comment)

        # Auto-merge if score meets threshold
        score = review.safety_score
        if score >= user.auto_merge_threshold:
            print(f"[auto-review] Score {score} >= threshold {user.auto_merge_threshold} — auto-merging PR #{pr.pr_number}")
            try:
                await client.merge_pr(
                    repo=repo_full_name,
                    pr_number=pr.pr_number,
                    commit_title=f"Auto-merged by AI PR Reviewer (score: {score}/100)",
                    merge_method="squash",
                )
                review.github_action_taken = "merged"
                pr.state = "merged"
                pr.is_active = False
                db.commit()
            except Exception as e:
                print(f"[auto-review] Auto-merge failed: {e}")
        else:
            print(f"[auto-review] Score {score} < threshold {user.auto_merge_threshold} — not auto-merging")

    except Exception as e:
        print(f"[auto-review] Error: {e}")
        import traceback; traceback.print_exc()
        try:
            review.status = "failed"
            db.commit()
        except Exception:
            pass


def _format_review_comment(analysis, pr_number: int, user: User) -> str:
    """Format AI analysis into a clean GitHub PR comment"""
    try:
        summary = analysis.summary if hasattr(analysis, 'summary') else analysis.get('summary', 'Review complete.')
        score = analysis.safety_score if hasattr(analysis, 'safety_score') else analysis.get('safety_score', 0)
        issues = analysis.issues if hasattr(analysis, 'issues') else analysis.get('issues', [])
        suggestions = analysis.suggestions if hasattr(analysis, 'suggestions') else analysis.get('suggestions', [])
        ready = analysis.ready_for_merge if hasattr(analysis, 'ready_for_merge') else analysis.get('ready_for_merge', False)
    except Exception:
        return "✅ AI PR Reviewer has reviewed this PR."

    # Score emoji
    if score >= 85:
        score_emoji = "🟢"
    elif score >= 70:
        score_emoji = "🟡"
    else:
        score_emoji = "🔴"

    lines = [
        "## 🤖 AI PR Review",
        "",
        f"**Safety Score:** {score_emoji} {score}/100",
        "",
        f"**Summary:** {summary}",
        "",
    ]

    if issues:
        lines.append("### Issues Found")
        for issue in issues[:5]:  # cap at 5 to avoid huge comments
            if hasattr(issue, 'severity'):
                sev, msg, sug = issue.severity, issue.message, getattr(issue, 'suggestion', '')
            else:
                sev = issue.get('severity', 'low')
                msg = issue.get('message', '')
                sug = issue.get('suggestion', '')

            emoji = {"high": "🔴", "medium": "🟡", "low": "🔵"}.get(sev, "⚪")
            lines.append(f"- {emoji} **{sev.upper()}**: {msg}")
            if sug:
                lines.append(f"  - 💡 {sug}")
        lines.append("")

    if suggestions:
        lines.append("### Suggestions")
        for s in suggestions[:3]:
            lines.append(f"- {s}")
        lines.append("")

    if ready:
        lines.append("✅ **Ready to merge** — no blocking issues found.")
    else:
        lines.append("⚠️ **Review recommended** before merging.")

    lines += [
        "",
        "---",
        f"*Reviewed by [AI PR Reviewer]({settings.FRONTEND_URL}) • [View in Dashboard]({settings.FRONTEND_URL}/dashboard)*",
    ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: sync installation repos into DB
# ─────────────────────────────────────────────────────────────────────────────

async def _sync_installation(installation_id: int, user: User, db: Session):
    """
    After a user installs the app, sync their repos into DB and
    link the installation to their account.
    """
    try:
        token = await get_installation_token(installation_id)
        client = GitHubClient(token)

        # Get the authenticated user from the installation token
        gh_user = await client.get_user()
        github_username = gh_user.get("login", "")

        # Find or create GitHubAccount for this installation
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
                access_token="github-app-installation",  # not a PAT
                account_label=f"{github_username} (GitHub App)",
                is_active=True,
                is_token_valid=True,
            )
            db.add(account)
            db.flush()

        # Save installation_id on the account
        account.installation_id = installation_id
        db.commit()

        print(f"[github-app] Installation {installation_id} linked to account {account.id} (user {user.id})")

    except Exception as e:
        print(f"[github-app] _sync_installation error: {e}")
        import traceback; traceback.print_exc()