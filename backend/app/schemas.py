from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

# ===========================================
# ENUMS
# ===========================================

class ReviewMode(str, Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"

class ReviewStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    APPROVED = "approved"
    MERGED = "merged"
    CHANGES_REQUESTED = "changes_requested"

class MergeMethod(str, Enum):
    MERGE = "merge"
    SQUASH = "squash"
    REBASE = "rebase"

# ===========================================
# USER SCHEMAS
# ===========================================

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None

class UserSettingsUpdate(BaseModel):
    review_mode: Optional[ReviewMode] = None
    auto_merge_threshold: Optional[int] = Field(None, ge=0, le=100)

class UserResponse(UserBase):
    id: int
    review_mode: str
    auto_merge_threshold: int
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# ===========================================
# TOKEN SCHEMAS
# ===========================================

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None

# ===========================================
# GITHUB ACCOUNT SCHEMAS
# ===========================================

class GitHubAccountCreate(BaseModel):
    access_token: str
    account_label: Optional[str] = None

class GitHubAccountResponse(BaseModel):
    id: int
    github_username: str
    github_avatar_url: Optional[str] = None
    account_label: Optional[str] = None
    is_active: bool
    is_token_valid: bool
    connected_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ===========================================
# GITHUB REPO SCHEMAS
# ===========================================

class GitHubRepoListItem(BaseModel):
    id: int
    name: str
    full_name: str
    html_url: str
    private: bool
    default_branch: str
    description: Optional[str] = None

class GitHubRepoImportRequest(BaseModel):
    github_account_id: int
    repo_full_names: List[str]

class GitHubRepoResponse(BaseModel):
    id: int
    repo_name: str
    repo_full_name: str
    default_branch: Optional[str] = None
    description: Optional[str] = None
    is_private: bool
    is_active: bool
    is_synced: bool
    imported_at: datetime
    last_synced_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

# ===========================================
# GITHUB PR SCHEMAS
# ===========================================

class GitHubPRDetail(BaseModel):
    id: int
    pr_number: int
    title: str
    body: Optional[str] = None
    state: str
    head_ref: str
    base_ref: str
    author_login: Optional[str] = None
    author_avatar_url: Optional[str] = None
    created_at_github: Optional[datetime] = None
    updated_at_github: Optional[datetime] = None
    commits: int
    additions: int
    deletions: int
    
    model_config = ConfigDict(from_attributes=True)

# ===========================================
# REVIEW SCHEMAS
# ===========================================

class FeedbackItem(BaseModel):
    severity: str
    message: str
    line_number: Optional[int] = None
    suggestion: Optional[str] = None

class AIAnalysis(BaseModel):
    summary: str
    issues: List[FeedbackItem]
    suggestions: List[str] = []
    safety_score: int = 0
    ready_for_merge: bool = False

class ReviewCreate(BaseModel):
    pr_url: str
    code_diff: str
    original_code: str
    github_account_id: Optional[int] = None
    imported_repo_id: Optional[int] = None
    pr_id: Optional[int] = None
    pr_number: Optional[int] = None
    repo_full_name: Optional[str] = None
    branch_name: Optional[str] = None
    target_branch: Optional[str] = None
    pr_title: Optional[str] = None

class ReviewUpdate(BaseModel):
    status: Optional[ReviewStatus] = None
    reviewed_code: Optional[str] = None
    ai_feedback: Optional[Dict[str, Any]] = None
    safety_score: Optional[int] = None
    github_action_taken: Optional[str] = None
    user_comments: Optional[List[Any]] = None

class ReviewResponse(BaseModel):
    id: int
    pr_url: str
    pr_number: Optional[int]
    repo_full_name: Optional[str]
    branch_name: Optional[str]
    target_branch: Optional[str]
    pr_title: Optional[str]
    original_code: str
    reviewed_code: Optional[str]
    ai_feedback: Optional[Dict[str, Any]]
    user_comments: List[Any] = []
    safety_score: int
    status: str
    github_action_taken: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class UserCommentCreate(BaseModel):
    content: str
    line_number: Optional[int] = None

# ===========================================
# PR MANAGEMENT SCHEMAS ← ← ← THESE WERE MISSING!
# ===========================================

class PRMergeRequest(BaseModel):
    merge_method: MergeMethod = MergeMethod.SQUASH
    commit_title: Optional[str] = None
    commit_message: Optional[str] = None

class PRApproveRequest(BaseModel):
    comment: Optional[str] = ""

class PRChangesRequest(BaseModel):
    comment: str

class MergeDecision(BaseModel):
    should_merge: bool
    reason: str
    required_actions: List[str] = []

# ===========================================
# CHAT MESSAGE SCHEMAS
# ===========================================

class ChatMessageCreate(BaseModel):
    review_id: int
    content: str
    role: str = "user"

class ChatMessageResponse(BaseModel):
    id: int
    review_id: int
    role: str
    content: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ===========================================
# RESPONSE WRAPPERS
# ===========================================

class MessageResponse(BaseModel):
    message: str
    success: bool = True
    data: Optional[Dict[str, Any]] = None

class RepoImportResponse(BaseModel):
    message: str
    success: bool
    imported_count: int
    repos: List[GitHubRepoResponse]

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int