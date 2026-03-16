import { create } from 'zustand';
import { User, Chat, ReviewMode, SidebarMode, ReviewType } from '@/types';
import { authAPI, reviewsAPI, githubAPI, prAPI } from '@/lib/api';

interface Repo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
}

interface PR {
  number: number;
  title: string;
  url: string;
  state: string;
  head_ref: string;
  base_ref: string;
  created_at: string;
  user: { login: string };
}

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  sidebarMode: SidebarMode;
  chats: Chat[];
  activeChatId: number | null;

  githubConnected: boolean;
  githubUsername: string | null;
  availableRepos: Repo[];
  importedRepos: Repo[];
  selectedRepo: string | null;
  repoPRs: PR[];
  selectedPR: PR | null;

  reviewMode: ReviewMode;
  reviewType: ReviewType;
  originalCode: string;
  reviewedCode: string;
  currentReview: any | null;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  checkGitHubConnection: () => Promise<void>;
  connectGitHub: (token: string) => Promise<void>;
  disconnectGitHub: () => Promise<void>;
  fetchAvailableRepos: () => Promise<void>;
  importRepos: (repoFullNames: string[]) => Promise<void>;
  fetchImportedRepos: () => Promise<void>;
  fetchRepoPRs: (repoFullName: string) => Promise<void>;
  selectRepo: (repoFullName: string | null) => void;
  selectPR: (pr: PR | null) => void;
  createReview: (data: any) => Promise<void>;
  loadReviews: () => Promise<void>;
  approvePR: (reviewId: number, comment?: string) => Promise<void>;
  requestChanges: (reviewId: number, comment: string) => Promise<void>;
  mergePR: (reviewId: number, method?: string) => Promise<void>;
  toggleMode: () => void;
  setCode: (original: string, reviewed: string) => void;
  setCurrentReview: (review: any) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setError: (error: string | null) => void;
  setActiveChat: (id: number) => void;
}

export const useStore = create<AppState>((set, get) => ({

  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  sidebarMode: 'chats',
  chats: [],
  activeChatId: null,
  githubConnected: false,
  githubUsername: null,
  availableRepos: [],
  importedRepos: [],
  selectedRepo: null,
  repoPRs: [],
  selectedPR: null,
  reviewMode: 'manual',
  reviewType: 'pasted',
  originalCode: '',
  reviewedCode: '',
  currentReview: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('access_token', data.access_token);
      const user = await authAPI.getMe();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      await get().checkGitHubConnection();
      await get().loadReviews();
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
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      set({
        user: null,
        isAuthenticated: false,
        chats: [],
        currentReview: null,
        githubConnected: false,
        githubUsername: null,
      });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, isAuthenticated: true });
        await get().checkGitHubConnection();
        await get().loadReviews();
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        set({ user: null, isAuthenticated: false });
      }
    }
  },

  checkGitHubConnection: async () => {
    try {
      const status = await githubAPI.checkConnection();
      set({
        githubConnected: status.connected,
        githubUsername: status.username
      });
      if (status.connected && status.has_imported_repos) {
        await get().fetchImportedRepos();
      }
    } catch (error) {
      console.error('GitHub connection check failed:', error);
    }
  },

  connectGitHub: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.connect(token);
      await get().checkGitHubConnection();
      await get().fetchAvailableRepos();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to connect GitHub', isLoading: false });
      throw error;
    }
  },

  disconnectGitHub: async () => {
    try {
      await githubAPI.disconnect();
      set({
        githubConnected: false,
        githubUsername: null,
        availableRepos: [],
        importedRepos: [],
        selectedRepo: null,
        repoPRs: [],
        selectedPR: null,
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  },

  fetchAvailableRepos: async () => {
    try {
      const repos = await githubAPI.getAvailableRepos();
      set({ availableRepos: repos });
    } catch (error) {
      console.error('Failed to fetch repos:', error);
    }
  },

  importRepos: async (repoFullNames: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.importRepos(repoFullNames);
      await get().fetchImportedRepos();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to import repos', isLoading: false });
      throw error;
    }
  },

  fetchImportedRepos: async () => {
    try {
      const repos = await githubAPI.getImportedRepos();
      set({ importedRepos: repos });
    } catch (error) {
      console.error('Failed to fetch imported repos:', error);
    }
  },

  fetchRepoPRs: async (repoFullName: string) => {
    try {
      const prs = await githubAPI.getRepoPRs(repoFullName);
      set({ repoPRs: prs, selectedRepo: repoFullName });
    } catch (error) {
      console.error('Failed to fetch PRs:', error);
    }
  },

  selectRepo: (repoFullName: string | null) => {
    set({ selectedRepo: repoFullName });
    if (repoFullName) {
      get().fetchRepoPRs(repoFullName);
    }
  },

  selectPR: (pr: PR | null) => {
    set({ selectedPR: pr });
  },

  createReview: async (data: any) => {
    set({ isLoading: true, error: null });
    try {
      const review = await reviewsAPI.create(data);
      set({ currentReview: review, isLoading: false });
      await get().loadReviews();
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to create review', isLoading: false });
      throw error;
    }
  },

  loadReviews: async () => {
    try {
      const reviews = await reviewsAPI.getAll();
      const chats = reviews.map((r: any) => ({
        id: r.id,
        title: r.review_type === 'imported'
          ? `${r.repo_full_name}/PR #${r.pr_number}`
          : `Review #${r.id}`,
        date: new Date(r.created_at).toLocaleDateString(),
        review_type: r.review_type,
      }));
      set({ chats });
    } catch (error) {
      console.error('Failed to load reviews:', error);
    }
  },

  approvePR: async (reviewId: number, comment?: string) => {
    set({ isLoading: true, error: null });
    try {
      await prAPI.approve(reviewId, comment);
      await get().loadReviews();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to approve PR', isLoading: false });
      throw error;
    }
  },

  requestChanges: async (reviewId: number, comment: string) => {
    set({ isLoading: true, error: null });
    try {
      await prAPI.requestChanges(reviewId, comment);
      await get().loadReviews();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to request changes', isLoading: false });
      throw error;
    }
  },

  mergePR: async (reviewId: number, method: string = 'squash') => {
    set({ isLoading: true, error: null });
    try {
      await prAPI.merge(reviewId, method as any);
      await get().loadReviews();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to merge PR', isLoading: false });
      throw error;
    }
  },

  toggleMode: () => set((state) => ({
    reviewMode: state.reviewMode === 'manual' ? 'automatic' : 'manual'
  })),

  setCode: (original: string, reviewed: string) =>
    set({ originalCode: original, reviewedCode: reviewed }),

  setCurrentReview: (review: any) => set({ currentReview: review }),

  setSidebarMode: (mode: SidebarMode) => set({ sidebarMode: mode }),

  setActiveChat: (id: number) => set({ activeChatId: id }),

  setError: (error: string | null) => set({ error }),
}));