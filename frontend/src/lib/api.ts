import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout ONLY for app authentication failures, NOT for GitHub token expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Only force-logout for core auth endpoints, not GitHub token operations
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/signup');
      const isGitHubTokenOp = url.includes('/github-import/');
      if (!isAuthEndpoint && !isGitHubTokenOp) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===========================================
// AUTH API
// ===========================================
export const authAPI = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },

  signup: async (email: string, password: string, name: string) => {
    const res = await api.post('/auth/signup', { email, password, full_name: name });
    return res.data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
  },
};

// ===========================================
// USERS API
// ===========================================
export const usersAPI = {
  getProfile: async () => {
    const res = await api.get('/users/me');
    return res.data;
  },

  updateProfile: async (data: { full_name?: string; avatar_url?: string }) => {
    const res = await api.put('/users/me', data);
    return res.data;
  },

  updateSettings: async (data: { review_mode?: string; auto_merge_threshold?: number }) => {
    const res = await api.put('/users/me/settings', data);
    return res.data;
  },

  changePassword: async (data: { current_password: string; new_password: string }) => {
    const res = await api.put('/users/me/password', data);
    return res.data;
  },
};

// ===========================================
// GITHUB API
// ===========================================
export const githubAPI = {
  // Accounts
  getAccounts: async () => {
    const res = await api.get('/github-import/accounts');
    return res.data;
  },

  connectAccount: async (token: string, label?: string) => {
    const res = await api.post('/github-import/connect-account', {
      access_token: token,
      account_label: label,
    });
    return res.data;
  },

  disconnectAccount: async (accountId: number) => {
    const res = await api.delete(`/github-import/accounts/${accountId}`);
    return res.data;
  },

  validateToken: async (accountId: number) => {
    const res = await api.post(`/github-import/accounts/${accountId}/validate-token`);
    return res.data;
  },

  reconnectAccount: async (accountId: number, token: string) => {
    const res = await api.post(`/github-import/accounts/${accountId}/reconnect`, { access_token: token });
    return res.data;
  },

  // Repos — list from GitHub API (for import modal)
  getAccountRepos: async (accountId: number) => {
    const res = await api.get(`/github-import/accounts/${accountId}/available-repos`);
    return res.data;
  },

  importRepos: async (accountId: number, repoFullNames: string[]) => {
    const res = await api.post('/github-import/import-repos', {
      github_account_id: accountId,
      repo_full_names: repoFullNames,
    });
    return res.data;
  },

  // Imported repos
  getImportedRepos: async () => {
    const res = await api.get('/github-import/repos');
    return res.data;
  },

  removeRepo: async (repoId: number) => {
    const res = await api.delete(`/github-import/repos/${repoId}`);
    return res.data;
  },

  // Sync
  syncRepo: async (repoId: number) => {
    const res = await api.post(`/github-import/repos/${repoId}/sync`);
    return res.data;
  },

  syncAccount: async (accountId: number) => {
    const res = await api.post(`/github-import/accounts/${accountId}/sync`);
    return res.data;
  },

  // PRs
  getRepoPRs: async (repoId: number, forceSync = false) => {
    const res = await api.get(`/github-import/repos/${repoId}/pulls`, {
      params: { force_sync: forceSync },
    });
    return res.data;
  },

  // Get changed files + diff for a PR
  getPRFiles: async (prId: number) => {
    const res = await api.get(`/github-import/prs/${prId}/files`);
    return res.data;
  },

  // Check if PR is still open before merging
  checkPRStatus: async (prId: number) => {
    const res = await api.get(`/github-import/prs/${prId}/status`);
    return res.data; // { is_open: bool, state: string, mergeable: bool }
  },

  // Comment on PR
  addPRComment: async (prId: number, content: string, lineNumber?: number) => {
    const res = await api.post(`/github-import/prs/${prId}/comment`, {
      content,
      line_number: lineNumber,
    });
    return res.data;
  },

  // Approve PR
  approvePR: async (prId: number, comment = '') => {
    const res = await api.post(`/github-import/prs/${prId}/approve`, null, {
      params: { comment },
    });
    return res.data;
  },

  // Merge PR — always checks PR is open first on backend
  mergePR: async (
    prId: number,
    mergeMethod = 'squash',
    meta?: { commit_title?: string; repo_full_name?: string; pr_number?: number; account_id?: number }
  ) => {
    const res = await api.post(`/github-import/prs/${prId}/merge`, null, {
      params: { merge_method: mergeMethod, commit_title: meta?.commit_title },
    });
    return res.data;
  },
};

// ===========================================
// REVIEWS API
// ===========================================
export const reviewsAPI = {
  create: async (data: {
    pr_url: string;
    code_diff: string;
    original_code: string;
    github_account_id?: number;
    imported_repo_id?: number;
    pr_id?: number;
    pr_number?: number;
    repo_full_name?: string;
    branch_name?: string;
    target_branch?: string;
    pr_title?: string;
  }) => {
    const res = await api.post('/reviews/', data);
    return res.data;
  },

  getAll: async (statusFilter?: string) => {
    const res = await api.get('/reviews/', {
      params: statusFilter ? { status_filter: statusFilter } : {},
    });
    return res.data;
  },

  getById: async (reviewId: number) => {
    const res = await api.get(`/reviews/${reviewId}`);
    return res.data;
  },

  // Poll review status (for polling while AI processes)
  pollStatus: async (reviewId: number) => {
    const res = await api.get(`/reviews/${reviewId}/status`);
    return res.data;
  },

  // Generate PR title + description from the diff
  generateDescription: async (codeDiff: string) => {
    const res = await api.post('/reviews/generate-description', { code_diff: codeDiff });
    return res.data as {
      title: string;
      summary: string;
      changes: string[];
      testing: string;
      notes: string;
    };
  },

  addComment: async (reviewId: number, content: string, lineNumber?: number) => {
    const res = await api.post(`/reviews/${reviewId}/comments`, {
      content,
      line_number: lineNumber,
    });
    return res.data;
  },

  // PR management via review
  approvePR: async (reviewId: number, comment?: string) => {
    const res = await api.post(`/pr/${reviewId}/approve`, { comment });
    return res.data;
  },

  mergePR: async (reviewId: number, mergeMethod = 'squash', commitTitle?: string) => {
    const res = await api.post(`/pr/${reviewId}/merge`, {
      merge_method: mergeMethod,
      commit_title: commitTitle,
    });
    return res.data;
  },
};

export default api;

// ===========================================
// BILLING API
// ===========================================
export const billingAPI = {
  getSubscription: async () => {
    const res = await api.get('/billing/subscription');
    return res.data;
  },

  getPlans: async () => {
    const res = await api.get('/billing/plans');
    return res.data;
  },

  createCheckout: async (data: { plan: string; success_url: string; cancel_url: string }) => {
    const res = await api.post('/billing/create-checkout', data);
    return res.data as { checkout_url: string; session_id: string };
  },

  createPortal: async (data: { return_url: string }) => {
    const res = await api.post('/billing/create-portal', data);
    return res.data as { portal_url: string };
  },
};

// ===========================================
// DEBT API
// ===========================================
export const debtAPI = {
  getSummary: async (repoId: number, days = 90) => {
    const res = await api.get(`/debt/repo/${repoId}/summary`, { params: { days } });
    return res.data;
  },
  resolveItem: async (repoId: number, itemId: number) => {
    const res = await api.post(`/debt/repo/${repoId}/items/${itemId}/resolve`);
    return res.data;
  },
};