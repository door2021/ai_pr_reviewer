export interface User {
  id: string;
  name?: string;
  full_name?: string;
  email: string;
  github_username?: string | null;
}

export interface Chat {
  id: number;
  title: string;
  date: string;
  review_type?: 'pasted' | 'imported';
}

export interface ReviewState {
  originalCode: string;
  reviewedCode: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export type ReviewMode = 'manual' | 'automatic';
export type ReviewType = 'pasted' | 'imported';
export type SidebarMode = 'chats' | 'files';

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  is_active?: boolean;
}

export interface PR {
  number: number;
  title: string;
  url: string;
  html_url?: string;
  state: 'open' | 'closed' | 'merged';
  head_ref: string;
  base_ref: string;
  created_at: string;
  user: { login: string; avatar_url?: string };
}

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
  user_id: number;
  review_type: ReviewType;
  pr_url: string;
  pr_number?: number;
  repo_name?: string;
  repo_full_name?: string;
  branch_name?: string;
  target_branch?: string;
  code_diff: string;
  original_code: string;
  reviewed_code?: string;
  ai_feedback?: AIAnalysis;
  status: string;
  review_mode: ReviewMode;
  safety_score: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  review_id: number;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
}