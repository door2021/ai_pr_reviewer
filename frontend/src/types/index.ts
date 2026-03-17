// ===========================================
// USER TYPES
// ===========================================

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  review_mode: 'manual' | 'automatic';
  auto_merge_threshold: number;
  is_active: boolean;
  created_at: string;
}

// ===========================================
// GITHUB ACCOUNT TYPES
// ===========================================

export interface GitHubAccount {
  id: number;
  github_username: string;
  github_avatar_url: string | null;
  account_label: string | null;
  is_active: boolean;
  is_token_valid: boolean;
  connected_at: string;
}

// ===========================================
// REPO TYPES
// ===========================================

export interface GitHubRepoListItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  description: string | null;
}

export interface GitHubRepo {
  id: number;
  repo_name: string;
  repo_full_name: string;
  default_branch: string | null;
  description: string | null;
  is_private: boolean;
  is_active: boolean;
  is_synced: boolean;
  imported_at: string;
  last_synced_at: string | null;
  github_account_id?: number;
}

// ===========================================
// PR TYPES
// ===========================================

export interface GitHubPR {
  id: number;
  pr_number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  head_ref: string;
  base_ref: string;
  author_login: string | null;
  author_avatar_url: string | null;
  created_at_github: string | null;
  updated_at_github: string | null;
  commits: number;
  additions: number;
  deletions: number;
  repo_id?: number;
}

// ===========================================
// REVIEW TYPES
// ===========================================

export interface FeedbackItem {
  severity: 'high' | 'medium' | 'low';
  message: string;
  line_number?: number;
  suggestion?: string;
}

export interface AIAnalysis {
  summary: string;
  issues: FeedbackItem[];
  suggestions: string[];
  safety_score: number;
  ready_for_merge: boolean;
}

export interface Review {
  id: number;
  pr_url: string;
  pr_number: number | null;
  repo_full_name: string | null;
  branch_name: string | null;
  target_branch: string | null;
  pr_title: string | null;
  original_code: string;
  reviewed_code: string | null;
  ai_feedback: AIAnalysis | null;
  user_comments: any[];
  safety_score: number;
  status: string;
  github_action_taken: string | null;
  created_at: string;
  updated_at: string;
  github_account_id?: number;
  imported_repo_id?: number;
  pr_id?: number;
}

// ===========================================
// COMMENT TYPES
// ===========================================

export interface UserComment {
  id: string;
  content: string;
  line_number?: number;
  created_at: string;
  author: string;
}

// ===========================================
// UI STATE TYPES
// ===========================================

export interface SidebarAccount {
  id: number;
  github_username: string;
  github_avatar_url: string | null;
  account_label: string | null;
  is_token_valid: boolean;
  repos: GitHubRepo[];
}

export interface SidebarRepo {
  id: number;
  repo_name: string;
  repo_full_name: string;
  is_synced: boolean;
  prs: GitHubPR[];
}