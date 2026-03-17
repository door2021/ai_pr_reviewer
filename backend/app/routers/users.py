from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserResponse, UserUpdate, UserSettingsUpdate, MessageResponse
from app.dependencies import get_current_user
from app.utils.security import get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if user_data.email:
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = user_data.email
    
    if user_data.full_name:
        current_user.full_name = user_data.full_name
    
    if user_data.avatar_url:
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
    if settings_data.review_mode:
        if settings_data.review_mode not in ["manual", "automatic"]:
            raise HTTPException(status_code=400, detail="Invalid review mode")
        current_user.review_mode = settings_data.review_mode
    
    if settings_data.auto_merge_threshold is not None:
        if not 0 <= settings_data.auto_merge_threshold <= 100:
            raise HTTPException(status_code=400, detail="Threshold must be 0-100")
        current_user.auto_merge_threshold = settings_data.auto_merge_threshold
    
    db.commit()
    db.refresh(current_user)
    return current_user

@router.delete("/me", response_model=MessageResponse)
async def delete_current_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.is_active = False
    db.commit()
    return {"message": "Account deactivated", "success": True}