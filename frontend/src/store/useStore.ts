import { create } from 'zustand';
import { User, GitHubAccount, GitHubRepo, GitHubPR, Review } from '@/types';
import { authAPI, usersAPI, githubAPI, reviewsAPI } from '@/lib/api';

interface AppState {
  // Auth State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // GitHub State
  githubAccounts: GitHubAccount[];
  importedRepos: GitHubRepo[];
  selectedAccount: GitHubAccount | null;
  selectedRepo: GitHubRepo | null;
  selectedPR: GitHubPR | null;
  repoPRs: GitHubPR[];

  // Review State
  currentReview: Review | null;
  originalCode: string;
  reviewedCode: string;
  isReviewing: boolean;
  reviewMode: 'manual' | 'automatic';

  // UI State
  sidebarOpen: boolean;
  expandedAccounts: Set<number>;
  expandedRepos: Set<number>;

  // Actions - Auth
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  loadUserProfile: () => Promise<void>;

  // Actions - GitHub
  loadGitHubAccounts: () => Promise<void>;
  connectGitHubAccount: (token: string, label?: string) => Promise<void>;
  disconnectGitHubAccount: (accountId: number) => Promise<void>;
  loadAccountRepos: (accountId: number) => Promise<GitHubRepo[]>;
  importRepos: (accountId: number, repoFullNames: string[]) => Promise<void>;
  loadImportedRepos: () => Promise<void>;
  syncRepo: (repoId: number) => Promise<void>;
  loadRepoPRs: (repoId: number, forceSync?: boolean) => Promise<void>;

  // Actions - Review
  selectAccount: (account: GitHubAccount | null) => void;
  selectRepo: (repo: GitHubRepo | null) => void;
  selectPR: (pr: GitHubPR | null) => void;
  loadPRReview: (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => Promise<void>;
  createReview: (data: any) => Promise<void>;
  setCode: (original: string, reviewed: string) => void;
  setCurrentReview: (review: Review | null) => void;

  // Actions - UI
  toggleAccount: (accountId: number) => void;
  toggleRepo: (repoId: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial State
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  githubAccounts: [],
  importedRepos: [],
  selectedAccount: null,
  selectedRepo: null,
  selectedPR: null,
  repoPRs: [],
  currentReview: null,
  originalCode: '',
  reviewedCode: '',
  isReviewing: false,
  reviewMode: 'manual',
  sidebarOpen: true,
  expandedAccounts: new Set(),
  expandedRepos: new Set(),

  // ===========================================
  // AUTH ACTIONS
  // ===========================================

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('access_token', data.access_token);
      await get().loadUserProfile();
      await get().loadGitHubAccounts();
      await get().loadImportedRepos();
      set({ isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Login failed', isLoading: false });
      throw error;
    }
  },

  signup: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      await authAPI.signup(email, password, name);
      await get().login(email, password);
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Signup failed', isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        githubAccounts: [],
        importedRepos: [],
        selectedAccount: null,
        selectedRepo: null,
        selectedPR: null,
        currentReview: null,
      });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        await get().loadUserProfile();
        await get().loadGitHubAccounts();
        await get().loadImportedRepos();
        set({ isAuthenticated: true });
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        set({ user: null, isAuthenticated: false });
      }
    }
  },

  loadUserProfile: async () => {
    try {
      const user = await usersAPI.getProfile();
      set({ user, reviewMode: user.review_mode });
      localStorage.setItem('user', JSON.stringify(user));
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  },

  // ===========================================
  // GITHUB ACTIONS
  // ===========================================

  loadGitHubAccounts: async () => {
    try {
      const accounts = await githubAPI.getAccounts();
      set({ githubAccounts: accounts });
    } catch (error) {
      console.error('Failed to load GitHub accounts:', error);
    }
  },

  connectGitHubAccount: async (token: string, label?: string) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.connectAccount(token, label);
      await get().loadGitHubAccounts();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to connect GitHub', isLoading: false });
      throw error;
    }
  },

  disconnectGitHubAccount: async (accountId: number) => {
    try {
      await githubAPI.disconnectAccount(accountId);
      await get().loadGitHubAccounts();
      await get().loadImportedRepos();
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
    }
  },

  loadAccountRepos: async (accountId: number) => {
    try {
      const repos = await githubAPI.getAccountRepos(accountId);
      return repos;
    } catch (error) {
      console.error('Failed to load account repos:', error);
      return [];
    }
  },

  importRepos: async (accountId: number, repoFullNames: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.importRepos(accountId, repoFullNames);
      await get().loadImportedRepos();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to import repos', isLoading: false });
      throw error;
    }
  },

  loadImportedRepos: async () => {
    try {
      const repos = await githubAPI.getImportedRepos();
      set({ importedRepos: repos });
    } catch (error) {
      console.error('Failed to load imported repos:', error);
    }
  },

  syncRepo: async (repoId: number) => {
    try {
      await githubAPI.syncRepo(repoId);
      await get().loadRepoPRs(repoId, true);
    } catch (error) {
      console.error('Failed to sync repo:', error);
    }
  },

  loadRepoPRs: async (repoId: number, forceSync = false) => {
    try {
      const prs = await githubAPI.getRepoPRs(repoId, forceSync);
      set({ repoPRs: prs });
    } catch (error) {
      console.error('Failed to load repo PRs:', error);
      set({ repoPRs: [] });
    }
  },

  // ===========================================
  // REVIEW ACTIONS
  // ===========================================

  selectAccount: (account: GitHubAccount | null) => {
    set({ selectedAccount: account });
  },

  selectRepo: (repo: GitHubRepo | null) => {
    set({ selectedRepo: repo });
    if (repo) {
      get().loadRepoPRs(repo.id);
    }
  },

  selectPR: (pr: GitHubPR | null) => {
    set({ selectedPR: pr });
  },

  loadPRReview: async (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => {
    set({ isReviewing: true, error: null });
    try {
      const review = await reviewsAPI.create({
        pr_url: `https://github.com/${repo.repo_full_name}/pull/${pr.pr_number}`,
        code_diff: '',
        original_code: '',
        github_account_id: account.id,
        imported_repo_id: repo.id,
        pr_id: pr.id,
        pr_number: pr.pr_number,
        repo_full_name: repo.repo_full_name,
        branch_name: pr.head_ref,
        target_branch: pr.base_ref,
        pr_title: pr.title,
      });

      set({
        currentReview: review,
        originalCode: review.original_code,
        reviewedCode: review.reviewed_code || '',
        isReviewing: false,
      });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to load PR review', isReviewing: false });
    }
  },

  createReview: async (data: any) => {
    set({ isReviewing: true, error: null });
    try {
      const review = await reviewsAPI.create(data);
      set({
        currentReview: review,
        originalCode: review.original_code,
        reviewedCode: review.reviewed_code || '',
        isReviewing: false,
      });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to create review', isReviewing: false });
      throw error;
    }
  },

  setCode: (original: string, reviewed: string) => {
    set({ originalCode: original, reviewedCode: reviewed });
  },

  setCurrentReview: (review: Review | null) => {
    set({ currentReview: review });
  },

  // ===========================================
  // UI ACTIONS
  // ===========================================

  toggleAccount: (accountId: number) => {
    const newExpanded = new Set(get().expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    set({ expandedAccounts: newExpanded });
  },

  toggleRepo: (repoId: number) => {
    const newExpanded = new Set(get().expandedRepos);
    if (newExpanded.has(repoId)) {
      newExpanded.delete(repoId);
    } else {
      newExpanded.add(repoId);
    }
    set({ expandedRepos: newExpanded });
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));