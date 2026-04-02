# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# import os
# from app.config import settings
# from app.database import Base, engine
# from app.routers import auth, reviews, github, users, pr_management, github_app_router

# # Create database tables
# Base.metadata.create_all(bind=engine)

# app = FastAPI(
#     title=settings.APP_NAME,
#     description="AI-Powered PR Code Reviewer",
#     version="3.0.0",
#     docs_url="/docs",
#     redoc_url="/redoc"
# )

# # CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.CORS_ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Include routers
# app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
# app.include_router(reviews.router, prefix=settings.API_V1_PREFIX)
# app.include_router(github.router, prefix=settings.API_V1_PREFIX)
# app.include_router(users.router, prefix=settings.API_V1_PREFIX)
# app.include_router(pr_management.router, prefix=settings.API_V1_PREFIX)


# app.include_router(
#     github_app_router.router,
#     prefix="/api/v1"
# )

# # Serve frontend
# if os.path.exists("../frontend/dist"):
#     app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")

# @app.get("/")
# async def root():
#     return {"message": "AI PR Reviewer API", "version": "3.0.0"}

# @app.get("/health")
# async def health_check():
#     return {"status": "healthy"}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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

# Billing — optional, only if Stripe is configured
if settings.STRIPE_SECRET_KEY:
    try:
        from app.routers import billing as billing_router
        app.include_router(billing_router.router, prefix="/api/v1")
        print("[main] Billing router loaded")
    except Exception as e:
        print(f"[main] Billing router skipped: {e}")


@app.get("/")
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}


@app.get("/health")
def health():
    return {"status": "healthy"}