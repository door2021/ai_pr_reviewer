from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, GitHubRepo, GitHubRepoImport
from app.schemas import (
    GitHubTokenRequest,
    GitHubRepoResponse,
    GitHubPR,
    GitHubPRResponse,
    GitHubRepoImportRequest,
    MessageResponse,
)
from app.dependencies import get_current_user
from app.github_client import get_github_client

router = APIRouter(prefix="/github", tags=["GitHub"])


@router.post("/connect", response_model=MessageResponse)
async def connect_github(
    token_data: GitHubTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        client = get_github_client(token_data.token)
        user_info = await client.get_user()

        current_user.github_username = user_info.get("login")
        current_user.github_token = token_data.token
        db.commit()

        return {"message": "GitHub connected successfully", "success": True}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to connect GitHub: {str(e)}",
        )


@router.get("/repos/available", response_model=List[GitHubRepoListItem])
async def get_available_repos(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected",
        )

    try:
        client = get_github_client(current_user.github_token)
        repos = await client.get_repos()

        return [
            GitHubRepoListItem(
                id=repo["id"],
                name=repo["name"],
                full_name=repo["full_name"],
                html_url=repo["html_url"],
                private=repo["private"],
                created_at=repo["created_at"],
                updated_at=repo["updated_at"],
            )
            for repo in repos
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repos: {str(e)}",
        )


@router.post("/import", response_model=MessageResponse)
async def import_repos(
    import_data: GitHubRepoImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected",
        )

    try:
        client = get_github_client(current_user.github_token)

        for repo_full_name in import_data.repo_full_names:
            existing = (
                db.query(GitHubRepoImport)
                .filter(
                    GitHubRepoImport.user_id == current_user.id,
                    GitHubRepoImport.repo_full_name == repo_full_name,
                )
                .first()
            )

            if existing:
                existing.is_active = True
                continue

            owner, repo = repo_full_name.split("/")
            repos = await client.get_repos()
            repo_data = next(
                (r for r in repos if r["full_name"] == repo_full_name), None
            )

            if repo_data:
                imported_repo = GitHubRepoImport(
                    user_id=current_user.id,
                    repo_name=repo_data["name"],
                    repo_full_name=repo_full_name,
                    github_id=repo_data["id"],
                )
                db.add(imported_repo)

        db.commit()

        return {
            "message": f"Successfully imported {len(import_data.repo_full_names)} repos",
            "success": True,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import repos: {str(e)}",
        )


@router.get("/imports", response_model=List[GitHubRepoResponse])
async def get_imported_repos(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    repos = (
        db.query(GitHubRepoImport)
        .filter(
            GitHubRepoImport.user_id == current_user.id,
            GitHubRepoImport.is_active == True,
        )
        .all()
    )
    return repos


@router.delete("/imports/{repo_id}", response_model=MessageResponse)
async def remove_imported_repo(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = (
        db.query(GitHubRepoImport)
        .filter(
            GitHubRepoImport.id == repo_id, GitHubRepoImport.user_id == current_user.id
        )
        .first()
    )

    if not repo:
        raise HTTPException(status_code=404, detail="Imported repo not found")

    repo.is_active = False
    db.commit()

    return {"message": "Repo removed from imports", "success": True}


@router.get("/imports/{repo_full_name}/pulls", response_model=List[GitHubPRResponse])
async def get_repo_pull_requests(
    repo_full_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.github_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected",
        )

    imported = (
        db.query(GitHubRepoImport)
        .filter(
            GitHubRepoImport.user_id == current_user.id,
            GitHubRepoImport.repo_full_name == repo_full_name,
            GitHubRepoImport.is_active == True,
        )
        .first()
    )

    if not imported:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Repo not imported or not accessible",
        )

    try:
        client = get_github_client(current_user.github_token)
        prs = await client.get_pull_requests(repo_full_name, state="open")

        return [
            GitHubPRResponse(
                number=pr["number"],
                title=pr["title"],
                url=pr["html_url"],
                state=pr["state"],
                head_ref=pr["head"]["ref"],
                base_ref=pr["base"]["ref"],
                created_at=pr["created_at"],
                user=pr["user"],
            )
            for pr in prs
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch PRs: {str(e)}",
        )


@router.get("/check", response_model=Dict[str, Any])
async def check_github_connection(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return {
        "connected": bool(current_user.github_token),
        "username": current_user.github_username,
        "has_imported_repos": db.query(GitHubRepoImport)
        .filter(
            GitHubRepoImport.user_id == current_user.id,
            GitHubRepoImport.is_active == True,
        )
        .count()
        > 0,
    }


@router.post("/disconnect", response_model=MessageResponse)
async def disconnect_github(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    current_user.github_token = None
    current_user.github_username = None
    db.commit()

    return {"message": "GitHub disconnected successfully", "success": True}
