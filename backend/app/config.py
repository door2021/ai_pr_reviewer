from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    APP_NAME: str = "DeepReviewAI"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    VERSION: str = "2.0.0"

    # Database
    DATABASE_URL: str = "mysql+pymysql://root:@localhost:3306/ai_pr"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    SECRET_KEY: str = "change-this-in-production-min-32-characters"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    OPENROUTER_API_KEY: str = ""

    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"

    GROQ_API_KEY: str = ""

    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_DEFAULT: str = "gemini-2.0-flash"
    DEEPSEEK_API_KEY: str = ""
    HF_TOKEN: str = ""
    HF_MODEL_NAME: str = ""

    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    GITHUB_WEBHOOK_SECRET: str = "change-this-to-random-secret"

    GITHUB_APP_NAME: str = ""
    GITHUB_APP_ID: str = ""
    GITHUB_APP_PRIVATE_KEY: str = ""
    GITHUB_APP_CLIENT_ID: str = ""
    GITHUB_APP_CLIENT_SECRET: str = ""

    FRONTEND_URL: str = "http://localhost:5173"

    STRIPE_SECRET_KEY: str = ""          # sk_test_...
    STRIPE_PUBLISHABLE_KEY: str = ""     # pk_test_...
    STRIPE_WEBHOOK_SECRET: str = ""      # whsec_...  (from Stripe Dashboard > Webhooks)

    STRIPE_PRICE_SOLO: str = ""    # $9/month Solo plan Price ID
    STRIPE_PRICE_TEAM: str = ""    # $29/month Team plan Price ID
    STRIPE_PRICE_PRO: str = ""     # $59/month Pro plan Price ID

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    def get_cors_origins(self) -> list:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()