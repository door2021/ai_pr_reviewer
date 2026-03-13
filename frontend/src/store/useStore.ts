import { create } from 'zustand';
import { User, Chat, ReviewMode, SidebarMode } from '@/types';
import { authAPI, reviewsAPI, githubAPI, prAPI } from '@/lib/api';

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  sidebarMode: SidebarMode;
  chats: Chat[];
  activeChatId: number | null;
  
  reviewMode: ReviewMode;
  originalCode: string;
  reviewedCode: string;
  currentReview: any | null;
  
  githubConfigured: boolean;
  githubRepos: any[];
  
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  toggleMode: () => void;
  setCode: (original: string, reviewed: string) => void;
  setCurrentReview: (review: any) => void;
  loadReviews: () => Promise<void>;
  connectGitHub: (token: string) => Promise<void>;
  disconnectGitHub: () => Promise<void>;
  approvePR: (reviewId: number, comment?: string) => Promise<void>;
  requestChanges: (reviewId: number, comment: string) => Promise<void>;
  mergePR: (reviewId: number, method?: string) => Promise<void>;
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
  reviewMode: 'manual',
  originalCode: '',
  reviewedCode: '',
  currentReview: null,
  githubConfigured: false,
  githubRepos: [],

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('access_token', data.access_token);
      const user = await authAPI.getMe();
      localStorage.setItem('user', JSON.stringify(user));
      set({ 
        user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      await get().loadReviews();
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Login failed', 
        isLoading: false 
      });
      throw error;
    }
  },

  signup: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      await authAPI.signup(email, password, name);
      await get().login(email, password);
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Signup failed', 
        isLoading: false 
      });
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
        currentReview: null 
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
        await get().loadReviews();
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        set({ user: null, isAuthenticated: false });
      }
    }
  },

  setError: (error: string | null) => set({ error }),

  toggleMode: () => set((state) => ({ 
    reviewMode: state.reviewMode === 'manual' ? 'automatic' : 'manual' 
  })),

  setCode: (original: string, reviewed: string) => 
    set({ originalCode: original, reviewedCode: reviewed }),

  setCurrentReview: (review: any) => set({ currentReview: review }),

  setActiveChat: (id: number) => set({ activeChatId: id }),

  loadReviews: async () => {
    try {
      const reviews = await reviewsAPI.getAll();
      const chats = reviews.map((r: any) => ({
        id: r.id,
        title: r.pr_url.split('/').pop() || `PR #${r.pr_number}`,
        date: new Date(r.created_at).toLocaleDateString(),
      }));
      set({ chats });
    } catch (error) {
      console.error('Failed to load reviews:', error);
    }
  },

  connectGitHub: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.connect(token);
      const repos = await githubAPI.getRepos();
      set({ githubConfigured: true, githubRepos: repos, isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to connect GitHub', 
        isLoading: false 
      });
      throw error;
    }
  },

  disconnectGitHub: async () => {
    try {
      await githubAPI.disconnect();
      set({ githubConfigured: false, githubRepos: [] });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  },

  approvePR: async (reviewId: number, comment?: string) => {
    set({ isLoading: true, error: null });
    try {
      await prAPI.approve(reviewId, comment);
      await get().loadReviews();
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to approve PR', 
        isLoading: false 
      });
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
      set({ 
        error: error.response?.data?.detail || 'Failed to request changes', 
        isLoading: false 
      });
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
      set({ 
        error: error.response?.data?.detail || 'Failed to merge PR', 
        isLoading: false 
      });
      throw error;
    }
  },
}));