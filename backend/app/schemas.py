from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

# --- Enums ---
class ReviewStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    APPROVED = "approved"
    MERGED = "merged"
    CHANGES_REQUESTED = "changes_requested"

class ReviewMode(str, Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"

class ReviewType(str, Enum):
    PASTED = "pasted"
    IMPORTED = "imported"

class MessageRole(str, Enum):
    USER = "user"
    AI = "ai"

class MergeMethod(str, Enum):
    MERGE = "merge"
    SQUASH = "squash"
    REBASE = "rebase"

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None

class UserResponse(UserBase):
    id: int
    github_username: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None

# --- Review Schemas ---
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
    review_type: ReviewType = ReviewType.PASTED
    review_mode: ReviewMode = ReviewMode.MANUAL
    repo_name: Optional[str] = None
    repo_full_name: Optional[str] = None
    pr_number: Optional[int] = None
    branch_name: Optional[str] = None
    target_branch: Optional[str] = None

class ReviewUpdate(BaseModel):
    status: Optional[ReviewStatus] = None
    reviewed_code: Optional[str] = None
    ai_feedback: Optional[Dict[str, Any]] = None
    review_mode: Optional[ReviewMode] = None
    safety_score: Optional[int] = None

class ReviewResponse(BaseModel):
    id: int
    user_id: int
    review_type: ReviewType
    pr_url: str
    pr_number: Optional[int]
    repo_name: Optional[str]
    repo_full_name: Optional[str]
    branch_name: Optional[str]
    target_branch: Optional[str]
    code_diff: str
    original_code: str
    reviewed_code: Optional[str]
    ai_feedback: Optional[Dict[str, Any]]
    status: ReviewStatus
    review_mode: ReviewMode
    safety_score: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# --- Chat Message Schemas ---
class ChatMessageCreate(BaseModel):
    review_id: int
    content: str
    role: MessageRole = MessageRole.USER

class ChatMessageResponse(BaseModel):
    id: int
    review_id: int
    role: str
    content: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# --- GitHub Schemas ---
class GitHubTokenRequest(BaseModel):
    token: str

class GitHubRepoResponse(BaseModel):
    id: int
    repo_name: str
    repo_full_name: str
    github_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class GitHubRepoListItem(BaseModel):
    id: int
    name: str
    full_name: str
    html_url: str
    private: bool
    created_at: datetime
    updated_at: datetime

class GitHubRepoImportRequest(BaseModel):
    repo_full_names: List[str]  # ["owner/repo1", "owner/repo2"]

class GitHubPR(BaseModel):
    number: int
    title: str
    url: str
    html_url: str
    state: str
    created_at: datetime
    updated_at: datetime
    user: Dict[str, str]
    head: Dict[str, Any]  # Contains ref, sha, repo
    base: Dict[str, Any]  # Contains ref, sha, repo

class GitHubPRResponse(BaseModel):
    number: int
    title: str
    url: str
    state: str
    head_ref: str
    base_ref: str
    created_at: datetime
    user: Dict[str, str]

# --- PR Management Schemas ---
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

# --- Response Wrappers ---
class MessageResponse(BaseModel):
    message: str
    success: bool = True
    data: Optional[Dict[str, Any]] = None

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int