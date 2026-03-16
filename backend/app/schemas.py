from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

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

class MessageRole(str, Enum):
    USER = "user"
    AI = "ai"

class MergeMethod(str, Enum):
    MERGE = "merge"
    SQUASH = "squash"
    REBASE = "rebase"

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72, description="Password must be between 8 and 72 characters")

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

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None

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
    review_mode: ReviewMode = ReviewMode.MANUAL
    repo_name: Optional[str] = None
    pr_number: Optional[int] = None
    branch_name: Optional[str] = None

class ReviewUpdate(BaseModel):
    status: Optional[ReviewStatus] = None
    reviewed_code: Optional[str] = None
    ai_feedback: Optional[Dict[str, Any]] = None
    review_mode: Optional[ReviewMode] = None
    safety_score: Optional[int] = None

class ReviewResponse(BaseModel):
    id: int
    user_id: int
    pr_url: str
    pr_number: Optional[int]
    repo_name: Optional[str]
    branch_name: Optional[str]
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

class GitHubTokenRequest(BaseModel):
    token: str

class GitHubRepoResponse(BaseModel):
    id: int
    repo_name: str
    repo_full_name: str
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class GitHubPR(BaseModel):
    number: int
    title: str
    url: str
    state: str
    created_at: datetime
    user: Dict[str, str]

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

class MessageResponse(BaseModel):
    message: str
    success: bool = True
    data: Optional[Dict[str, Any]] = None

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int