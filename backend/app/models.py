from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    github_username = Column(String(255), nullable=True)
    github_token = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")
    repos = relationship("GitHubRepo", back_populates="user", cascade="all, delete-orphan")

class Review(Base):
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pr_url = Column(String(500), index=True)
    pr_number = Column(Integer, nullable=True)
    repo_name = Column(String(255))
    branch_name = Column(String(255), nullable=True)
    code_diff = Column(Text)
    original_code = Column(Text)
    reviewed_code = Column(Text)
    ai_feedback = Column(JSON)
    status = Column(String(50), default="pending")
    review_mode = Column(String(50), default="manual")
    safety_score = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="reviews")
    messages = relationship("ChatMessage", back_populates="review", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id"), nullable=False)
    role = Column(String(50))
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    review = relationship("Review", back_populates="messages")

class GitHubRepo(Base):
    __tablename__ = "github_repos"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_name = Column(String(255), nullable=False)
    repo_full_name = Column(String(255), unique=True)
    github_id = Column(Integer, unique=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="repos")