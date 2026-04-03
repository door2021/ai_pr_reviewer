from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    """Create all DB tables on startup if they don't exist"""
    import app.models  # ensure all models are imported before create_all
    Base.metadata.create_all(bind=engine)
    print("[startup] Database tables verified/created")

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers import github as github_router
from app.routers import reviews as reviews_router
from app.routers import users as users_router
from app.routers import github_app_router

# Auth router (assumed to exist in app/routers/auth.py)
try:
    from app.routers import auth as auth_router
    app.include_router(auth_router.router, prefix="/api/v1")
except ImportError:
    print("[main] Warning: auth router not found")

app.include_router(github_router.router,      prefix="/api/v1")
app.include_router(reviews_router.router,     prefix="/api/v1")
app.include_router(users_router.router,       prefix="/api/v1")
app.include_router(github_app_router.router,  prefix="/api/v1")

# Debt router
from app.routers import debt as debt_router
app.include_router(debt_router.router, prefix="/api/v1")

# Billing — optional, only if Stripe is configured
# if settings.STRIPE_SECRET_KEY:
#     try:
#         from app.routers import billing as billing_router
#         app.include_router(billing_router.router, prefix="/api/v1")
#         print("[main] Billing router loaded")
#     except Exception as e:
#         print(f"[main] Billing router skipped: {e}")


@app.get("/")
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}


@app.get("/health")
def health():
    return {"status": "healthy"}