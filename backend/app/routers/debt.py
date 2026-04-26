from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.models import DebtItem, GitHubRepoImport, GitHubAccount
from app.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/debt", tags=["Technical Debt"])


@router.get("/repo/{repo_id}/summary")
async def get_debt_summary(
    repo_id: int,
    days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    repo = db.query(GitHubRepoImport).join(GitHubAccount).filter(
        GitHubRepoImport.id == repo_id,
        GitHubAccount.user_id == current_user.id,
        GitHubRepoImport.is_active == True
    ).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    since = datetime.utcnow() - timedelta(days=days)

    base = db.query(DebtItem).filter(
        DebtItem.repo_id == repo_id,
        DebtItem.is_resolved == False,
        DebtItem.created_at >= since
    )

    all_items = base.all()
    total = len(all_items)

    weights = {"high": 3, "medium": 2, "low": 1}
    raw_score = sum(weights.get(i.severity, 1) for i in all_items)
    debt_score = min(100, raw_score)

    by_type: dict = {}
    for item in all_items:
        by_type[item.debt_type] = by_type.get(item.debt_type, 0) + 1

    by_severity: dict = {"high": 0, "medium": 0, "low": 0}
    for item in all_items:
        by_severity[item.severity] = by_severity.get(item.severity, 0) + 1

    trend = []
    for week in range(11, -1, -1):
        week_start = datetime.utcnow() - timedelta(weeks=week+1)
        week_end   = datetime.utcnow() - timedelta(weeks=week)
        count = db.query(func.count(DebtItem.id)).filter(
            DebtItem.repo_id == repo_id,
            DebtItem.is_resolved == False,
            DebtItem.created_at >= week_start,
            DebtItem.created_at < week_end
        ).scalar() or 0
        trend.append({
            "week": week_end.strftime("%b %d"),
            "count": count
        })

    file_counts: dict = {}
    for item in all_items:
        if item.file_path:
            file_counts[item.file_path] = file_counts.get(item.file_path, 0) + 1
    worst_files = sorted(file_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    worst_files = [{"file": f, "count": c} for f, c in worst_files]

    recent = db.query(DebtItem).filter(
        DebtItem.repo_id == repo_id,
        DebtItem.is_resolved == False
    ).order_by(desc(DebtItem.created_at)).limit(10).all()

    recent_items = [
        {
            "id": i.id,
            "debt_type": i.debt_type,
            "severity": i.severity,
            "description": i.description,
            "suggestion": i.suggestion,
            "pr_number": i.pr_number,
            "created_at": i.created_at.isoformat(),
        }
        for i in recent
    ]

    return {
        "repo_id": repo_id,
        "repo_name": repo.repo_full_name,
        "debt_score": debt_score,
        "total_items": total,
        "by_type": by_type,
        "by_severity": by_severity,
        "trend": trend,
        "worst_files": worst_files,
        "recent_items": recent_items,
        "since": since.isoformat(),
    }


@router.post("/repo/{repo_id}/items/{item_id}/resolve")
async def resolve_debt_item(
    repo_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a debt item as resolved."""
    item = db.query(DebtItem).filter(
        DebtItem.id == item_id,
        DebtItem.repo_id == repo_id,
        DebtItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Debt item not found")
    item.is_resolved = True
    db.commit()
    return {"message": "Debt item resolved", "success": True}