from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    APP_NAME: str = "AI PR Reviewer"
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

    # ── OpenRouter (PRIMARY — free, no credit card) ────────────────────────
    # Sign up: https://openrouter.ai → API Keys → Create key
    # Free tier: 50 req/day. $10 one-time credit → 1,000 req/day
    OPENROUTER_API_KEY: str = ""

    # Best FREE models for code review (append :free for zero-cost):
    #   meta-llama/llama-3.3-70b-instruct:free  ← great quality, most reliable
    #   deepseek/deepseek-r1:free               ← best reasoning, slower
    #   qwen/qwen3-coder-480b-instruct:free     ← best for code specifically
    #   google/gemini-2.0-flash-exp:free        ← fast, when available
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"

    # ── Groq (FALLBACK — free, just email signup) ──────────────────────────
    # Sign up: https://console.groq.com → API Keys → Create key
    # Free tier: 14,400 req/day, 6,000 tokens/min — very generous
    GROQ_API_KEY: str = ""

    # Best Groq model for code review (all free on free tier):
    #   llama-3.3-70b-versatile  ← best quality
    #   llama-3.1-8b-instant     ← fastest, use if 70b is slow
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # ── Legacy (kept for backward compat, not used) ────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_DEFAULT: str = "gemini-2.0-flash"
    DEEPSEEK_API_KEY: str = ""
    HF_TOKEN: str = ""
    HF_MODEL_NAME: str = ""

    # GitHub
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    GITHUB_WEBHOOK_SECRET: str = "change-this-too"

    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
    )

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()