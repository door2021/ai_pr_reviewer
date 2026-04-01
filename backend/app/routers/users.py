from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserResponse, UserUpdate, UserSettingsUpdate, MessageResponse
from app.dependencies import get_current_user
from passlib.context import CryptContext
from pydantic import BaseModel

router = APIRouter(prefix="/users", tags=["Users"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update profile — full name and avatar only (email change requires re-auth)"""
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name

    if user_data.avatar_url is not None:
        current_user.avatar_url = user_data.avatar_url

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/settings", response_model=UserResponse)
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update review mode and auto-merge threshold"""
    if settings_data.review_mode is not None:
        if settings_data.review_mode not in ["manual", "automatic"]:
            raise HTTPException(status_code=400, detail="Invalid review mode. Must be 'manual' or 'automatic'")
        current_user.review_mode = settings_data.review_mode

    if settings_data.auto_merge_threshold is not None:
        if not 0 <= settings_data.auto_merge_threshold <= 100:
            raise HTTPException(status_code=400, detail="Threshold must be between 0 and 100")
        current_user.auto_merge_threshold = settings_data.auto_merge_threshold

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", response_model=MessageResponse)
async def change_password(
    request: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change password — requires current password for verification"""
    # Verify current password
    if not pwd_context.verify(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters"
        )

    current_user.hashed_password = pwd_context.hash(request.new_password)
    db.commit()
    return {"message": "Password changed successfully", "success": True}


@router.delete("/me", response_model=MessageResponse)
async def deactivate_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deactivate account (soft delete)"""
    current_user.is_active = False
    db.commit()
    return {"message": "Account deactivated", "success": True}