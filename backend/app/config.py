from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List

class Settings(BaseSettings):
    # App
    APP_NAME: str = "AI PR Reviewer"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/ai_pr"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Hugging Face & LangChain
    HF_TOKEN: str = ""
    HF_MODEL_NAME: str = "mistralai/Mistral-7B-Instruct-v0.2"
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_API_KEY: str = ""
    
    # GitHub
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    GITHUB_WEBHOOK_SECRET: str = "your-webhook-secret"
    
    # Auto-Merge Safety
    AUTO_MERGE_REQUIRE_CI: bool = True
    AUTO_MERGE_REQUIRE_REVIEWS: int = 1
    PROTECTED_BRANCHES: List[str] = ["main", "master", "develop"]
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()