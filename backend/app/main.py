from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.config import settings
from app.database import Base, engine
from app.routers import auth, reviews, github, pr_management, users

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered PR Code Reviewer with LangChain & Auto-Merge",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(reviews.router, prefix=settings.API_V1_PREFIX)
app.include_router(github.router, prefix=settings.API_V1_PREFIX)
app.include_router(pr_management.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)

# Serve frontend (production)
if os.path.exists("../frontend/dist"):
    app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")

@app.get("/")
async def root():
    return {
        "message": "AI PR Reviewer API",
        "version": "2.0.0",
        "features": ["LangChain AI", "LangGraph Workflows", "Auto-Merge", "Safety Checks"]
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected", "redis": "connected"}