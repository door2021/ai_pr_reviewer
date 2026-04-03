from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    review_mode = Column(String(50), default="manual")
    auto_merge_threshold = Column(Integer, default=85)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Stripe billing
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    subscription_plan = Column(String(50), default="free")   # free|solo|team|pro
    subscription_status = Column(String(50), default="active")  # active|past_due|canceled|trialing

    github_accounts = relationship("GitHubAccount", back_populates="user", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")


class GitHubAccount(Base):
    __tablename__ = "github_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    github_username = Column(String(255), nullable=False)
    github_user_id = Column(BigInteger, nullable=True)   # GitHub user IDs can exceed INT
    github_avatar_url = Column(String(500), nullable=True)
    access_token = Column(String(512), nullable=False)
    account_label = Column(String(255), nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    is_token_valid = Column(Boolean, default=True)
    connected_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, nullable=True)
    installation_id = Column(BigInteger, nullable=True, index=True)  # GitHub App install

    user = relationship("User", back_populates="github_accounts")
    imported_repos = relationship("GitHubRepoImport", back_populates="github_account", cascade="all, delete-orphan")


class GitHubRepoImport(Base):
    __tablename__ = "github_repo_imports"

    id = Column(Integer, primary_key=True, index=True)
    github_account_id = Column(Integer, ForeignKey("github_accounts.id"), nullable=False)
    repo_name = Column(String(255), nullable=False)
    repo_full_name = Column(String(255), nullable=False)
    github_id = Column(BigInteger, nullable=True)        # GitHub repo IDs can exceed INT
    default_branch = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    is_private = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_synced = Column(Boolean, default=False)
    imported_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, nullable=True)

    github_account = relationship("GitHubAccount", back_populates="imported_repos")
    prs = relationship("GitHubPR", back_populates="repo", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="imported_repo", cascade="all, delete-orphan")


class GitHubPR(Base):
    __tablename__ = "github_prs"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("github_repo_imports.id"), nullable=False)
    pr_number = Column(Integer, nullable=False)
    pr_id = Column(BigInteger, nullable=True)            # GitHub PR IDs exceed INT (e.g. 3414062119)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    state = Column(String(50), default="open")
    head_ref = Column(String(255), nullable=False)
    head_sha = Column(String(255), nullable=True)
    base_ref = Column(String(255), nullable=False)
    base_sha = Column(String(255), nullable=True)
    author_login = Column(String(255), nullable=True)
    author_avatar_url = Column(String(500), nullable=True)
    created_at_github = Column(DateTime, nullable=True)
    updated_at_github = Column(DateTime, nullable=True)
    commits = Column(Integer, default=0)
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    last_synced_at = Column(DateTime, nullable=True)

    repo = relationship("GitHubRepoImport", back_populates="prs")
    reviews = relationship("Review", back_populates="pr", cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    github_account_id = Column(Integer, ForeignKey("github_accounts.id"), nullable=True)
    imported_repo_id = Column(Integer, ForeignKey("github_repo_imports.id"), nullable=True)
    pr_id = Column(Integer, ForeignKey("github_prs.id"), nullable=True)
    pr_url = Column(String(500), index=True)
    pr_number = Column(Integer, nullable=True)
    repo_full_name = Column(String(255), nullable=True)
    branch_name = Column(String(255), nullable=True)
    target_branch = Column(String(255), nullable=True)
    pr_title = Column(String(500), nullable=True)
    pr_description = Column(Text, nullable=True)
    code_diff = Column(Text)
    original_code = Column(Text)
    reviewed_code = Column(Text)
    ai_feedback = Column(JSON, default=dict)
    user_comments = Column(JSON, default=list)
    safety_score = Column(Integer, default=0)
    status = Column(String(50), default="pending")
    github_action_taken = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="reviews")
    github_account = relationship("GitHubAccount", backref="reviews")
    imported_repo = relationship("GitHubRepoImport", back_populates="reviews")
    pr = relationship("GitHubPR", back_populates="reviews")
    messages = relationship("ChatMessage", back_populates="review", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id"), nullable=False)
    role = Column(String(50))
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    review = relationship("Review", back_populates="messages")


class DebtItem(Base):
    __tablename__ = "debt_items"

    id          = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_id     = Column(BigInteger, nullable=False, index=True)
    pr_id       = Column(BigInteger, nullable=True)
    pr_number   = Column(Integer, nullable=True)
    review_id   = Column(Integer, ForeignKey("reviews.id"), nullable=False)
    file_path   = Column(String(500), nullable=True)
    debt_type   = Column(String(50), nullable=False)
    severity    = Column(String(20), nullable=False, default="medium")
    description = Column(Text, nullable=True)
    suggestion  = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=False, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)