from datetime import datetime, timedelta
from typing import Optional
from app.utils.security import verify_password, get_password_hash, create_access_token
from app.config import settings

class AuthService:
    """Authentication business logic"""
    
    @staticmethod
    def authenticate_user(db, email: str, password: str):
        """Authenticate user with email and password"""
        from app.models import User
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user
    
    @staticmethod
    def create_token(user_id: int, email: str) -> str:
        """Create JWT access token"""
        return create_access_token(
            data={"user_id": user_id, "email": email},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
    
    @staticmethod
    def validate_password(password: str) -> tuple[bool, str]:
        """Validate password strength"""
        if len(password) < 8:
            return False, "Password must be at least 8 characters"
        if not any(c.isupper() for c in password):
            return False, "Password must contain at least one uppercase letter"
        if not any(c.islower() for c in password):
            return False, "Password must contain at least one lowercase letter"
        if not any(c.isdigit() for c in password):
            return False, "Password must contain at least one number"
        return True, "Password is valid"

auth_service = AuthService()