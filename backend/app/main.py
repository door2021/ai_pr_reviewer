import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import engine, Base

# ── Silence noisy loggers ─────────────────────────────────────────────────────
# SQLAlchemy SQL query logs — only show warnings and above
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)

# Uvicorn access logs — keep but reduce noise
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

# Keep app-level logs (INFO and above)
logging.getLogger("app").setLevel(logging.INFO)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS — must be first middleware ───────────────────────────────────────────
# Allow all origins in dev, restrict to configured origins in prod
cors_origins = settings.get_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # catch all Vercel preview URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    import app.models
    Base.metadata.create_all(bind=engine)
    print(f"[startup] Tables verified. CORS origins: {cors_origins}")


# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers import github as github_router
from app.routers import reviews as reviews_router
from app.routers import users as users_router
from app.routers import github_app_router
from app.routers import debt as debt_router

try:
    from app.routers import auth as auth_router
    app.include_router(auth_router.router, prefix="/api/v1")
except ImportError:
    print("[main] Warning: auth router not found")

app.include_router(github_router.router,     prefix="/api/v1")
app.include_router(reviews_router.router,    prefix="/api/v1")
app.include_router(users_router.router,      prefix="/api/v1")
app.include_router(github_app_router.router, prefix="/api/v1")
app.include_router(debt_router.router,       prefix="/api/v1")

# Billing — optional
if settings.STRIPE_SECRET_KEY:
    try:
        from app.routers import billing as billing_router
        app.include_router(billing_router.router, prefix="/api/v1")
        print("[main] Billing router loaded")
    except Exception as e:
        print(f"[main] Billing router skipped: {e}")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

@app.get("/health")
def health():
    return {"status": "healthy"}