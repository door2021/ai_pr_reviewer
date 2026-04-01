import { create } from 'zustand';
import { User, GitHubAccount, GitHubRepo, GitHubPR, Review } from '@/types';
import { authAPI, usersAPI, githubAPI, reviewsAPI } from '@/lib/api';

// Always returns a plain string — never an object that would crash React rendering
function extractError(error: any, fallback: string): string {
  if (!error) return fallback;
  // Axios error with response body
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  // FastAPI 422 returns detail as array of objects
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d?.msg || JSON.stringify(d)).join(', ');
  }
  if (typeof error?.message === 'string') return error.message;
  return fallback;
}

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
  syncingAccountId: number | null;

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

  // PR action state — persists across renders, resets on PR change
  prApproved: boolean;
  prMerged: boolean;

  // Actions - Auth
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  loadUserProfile: () => Promise<void>;

  // Actions - GitHub
  loadGitHubAccounts: () => Promise<void>;
  connectGitHubAccount: (token: string, label?: string) => Promise<any>;
  disconnectGitHubAccount: (accountId: number) => Promise<void>;
  reconnectAccount: (accountId: number, token: string) => Promise<void>;
  loadAccountRepos: (accountId: number) => Promise<any[]>;
  importRepos: (accountId: number, repoFullNames: string[]) => Promise<void>;
  loadImportedRepos: () => Promise<void>;
  syncRepo: (repoId: number) => Promise<void>;
  syncAccount: (accountId: number) => Promise<void>;
  loadRepoPRs: (repoId: number, forceSync?: boolean) => Promise<void>;

  // Actions - Review
  selectAccount: (account: GitHubAccount | null) => void;
  selectRepo: (repo: GitHubRepo | null) => void;
  selectPR: (pr: GitHubPR | null) => void;
  openPRForReview: (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => void;
  loadPRReview: (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => Promise<void>;
  startReview: () => Promise<void>;
  createReview: (data: any) => Promise<void>;
  setCode: (original: string, reviewed: string) => void;
  setCurrentReview: (review: Review | null) => void;
  submitComment: (content: string, lineNumber?: number) => Promise<void>;
  mergePR: (mergeMethod?: string) => Promise<void>;
  approvePR: (comment?: string) => Promise<void>;

  // Actions - UI
  toggleAccount: (accountId: number) => void;
  toggleRepo: (repoId: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
  updateReviewMode: (mode: 'manual' | 'automatic', threshold?: number) => Promise<void>;
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
  syncingAccountId: null,
  prApproved: false,
  prMerged: false,
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
      set({ error: extractError(error, 'Login failed'), isLoading: false });
      throw error;
    }
  },

  // Fixed: signup should NOT auto-login — navigates to login page instead
  signup: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      await authAPI.signup(email, password, name);
      set({ isLoading: false });
      // Caller (Signup page) handles redirect to /login
    } catch (error: any) {
      set({ error: extractError(error, 'Signup failed'), isLoading: false });
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
        githubAccounts: [],
        importedRepos: [],
        selectedAccount: null,
        selectedRepo: null,
        selectedPR: null,
        currentReview: null,
        originalCode: '',
        reviewedCode: '',
        repoPRs: [],
        expandedAccounts: new Set(),
        expandedRepos: new Set(),
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
      set({ user, reviewMode: user.review_mode as 'manual' | 'automatic' });
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
      const newAccount = await githubAPI.connectAccount(token, label);
      await get().loadGitHubAccounts();
      set({ isLoading: false });
      return newAccount; // Return so modal can immediately go to repos step
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to connect GitHub account'), isLoading: false });
      throw error;
    }
  },

  disconnectGitHubAccount: async (accountId: number) => {
    try {
      await githubAPI.disconnectAccount(accountId);
      const { selectedAccount } = get();
      if (selectedAccount?.id === accountId) {
        set({ selectedAccount: null, selectedRepo: null, selectedPR: null, currentReview: null, repoPRs: [] });
      }
      await get().loadGitHubAccounts();
      await get().loadImportedRepos();
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to disconnect account') });
    }
  },

  reconnectAccount: async (accountId: number, token: string) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.reconnectAccount(accountId, token);
      await get().loadGitHubAccounts();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to reconnect account'), isLoading: false });
      throw error;
    }
  },

  loadAccountRepos: async (accountId: number) => {
    try {
      const repos = await githubAPI.getAccountRepos(accountId);
      return repos;
    } catch (error: any) {
      throw error;
    }
  },

  importRepos: async (accountId: number, repoFullNames: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await githubAPI.importRepos(accountId, repoFullNames);
      await get().loadImportedRepos();
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to import repos'), isLoading: false });
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
      // Reload PRs for this repo if it's currently selected
      const { selectedRepo } = get();
      if (selectedRepo?.id === repoId) {
        await get().loadRepoPRs(repoId, true);
      }
      await get().loadImportedRepos();
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to sync repo') });
    }
  },

  // Sync ALL repos for a given account
  syncAccount: async (accountId: number) => {
    set({ syncingAccountId: accountId });
    try {
      const { importedRepos } = get();
      const accountRepos = importedRepos.filter(r => r.github_account_id === accountId && r.is_active);
      // Sync all repos in parallel
      await Promise.all(accountRepos.map(repo => githubAPI.syncRepo(repo.id)));
      await get().loadImportedRepos();
      // Reload PRs if selected repo belongs to this account
      const { selectedRepo } = get();
      if (selectedRepo && accountRepos.some(r => r.id === selectedRepo.id)) {
        await get().loadRepoPRs(selectedRepo.id, true);
      }
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to sync account') });
    } finally {
      set({ syncingAccountId: null });
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
    set({ selectedPR: pr, prApproved: false, prMerged: false });
  },

  // Used when user clicks a PR in the sidebar
  openPRForReview: (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => {
    const { selectedPR, prApproved, currentReview, originalCode, reviewedCode } = get();
    const samePR = selectedPR?.id === pr.id;

    // Try restore persisted review from localStorage (survives logout/refresh)
    let restoredReview = samePR ? currentReview : null;
    let restoredOriginal = samePR ? originalCode : '';
    let restoredReviewed = samePR ? reviewedCode : '';
    let restoredApproved = samePR ? prApproved : false;

    if (!samePR) {
      try {
        const stored = localStorage.getItem(`review_pr_${pr.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Only restore if less than 24 hours old
          if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
            restoredReview = parsed.review;
            restoredOriginal = parsed.review.original_code || '';
            restoredReviewed = parsed.review.reviewed_code || '';
          }
        }
        const approvedKey = `approved_pr_${pr.id}`;
        restoredApproved = localStorage.getItem(approvedKey) === 'true';
      } catch {}
    }

    set({
      selectedPR: pr,
      selectedRepo: repo,
      selectedAccount: account,
      error: null,
      prMerged: false,
      prApproved: restoredApproved,
      currentReview: restoredReview,
      originalCode: restoredOriginal,
      reviewedCode: restoredReviewed,
    });
  },

  // Kept for backward compat but now just calls openPRForReview
  loadPRReview: async (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => {
    get().openPRForReview(pr, repo, account);
  },

  // Called when user clicks "Review" button in manual mode
  startReview: async () => {
    const { selectedPR, selectedRepo, selectedAccount } = get();
    if (!selectedPR || !selectedRepo || !selectedAccount) {
      set({ error: 'No PR selected for review' });
      return;
    }

    set({ isReviewing: true, error: null });
    try {
      const review = await reviewsAPI.create({
        pr_url: `https://github.com/${selectedRepo.repo_full_name}/pull/${selectedPR.pr_number}`,
        code_diff: '',
        original_code: '',
        github_account_id: selectedAccount.id,
        imported_repo_id: selectedRepo.id,
        pr_id: selectedPR.id,
        pr_number: selectedPR.pr_number,
        repo_full_name: selectedRepo.repo_full_name,
        branch_name: selectedPR.head_ref,
        target_branch: selectedPR.base_ref,
        pr_title: selectedPR.title,
      });

      set({
        currentReview: review,
        originalCode: review.original_code || '',
        reviewedCode: review.reviewed_code || '',
        isReviewing: false,
      });

      // Poll until the background AI task completes
      // The review starts as 'processing' — we poll /reviews/{id}/status every 2s
      if (review.status === 'processing') {
        const prId = selectedPR.id;
        const maxAttempts = 30; // 60 seconds max
        let attempts = 0;

        const poll = async () => {
          try {
            const status = await reviewsAPI.pollStatus(review.id);
            if (status.status !== 'processing') {
              // Fetch the full review now that it's done
              const full = await reviewsAPI.getById(review.id);
              set({
                currentReview: full,
                originalCode: full.original_code || '',
                reviewedCode: full.reviewed_code || '',
              });
              // Persist to localStorage so it survives logout/refresh
              try {
                localStorage.setItem(
                  `review_pr_${prId}`,
                  JSON.stringify({ review: full, timestamp: Date.now() })
                );
              } catch {}
              return; // done
            }
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 2000);
            }
          } catch {
            // Silently stop polling on error
          }
        };

        setTimeout(poll, 2000);
      }
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to start review'), isReviewing: false });
      throw error;
    }
  },

  createReview: async (data: any) => {
    set({ isReviewing: true, error: null });
    try {
      const review = await reviewsAPI.create(data);
      set({
        currentReview: review,
        originalCode: review.original_code || '',
        reviewedCode: review.reviewed_code || '',
        isReviewing: false,
      });
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to create review'), isReviewing: false });
      throw error;
    }
  },

  setCode: (original: string, reviewed: string) => {
    set({ originalCode: original, reviewedCode: reviewed });
  },

  setCurrentReview: (review: Review | null) => {
    set({ currentReview: review });
  },

  // Post comment to GitHub PR
  submitComment: async (content: string, lineNumber?: number) => {
    const { currentReview, selectedPR } = get();
    if (!currentReview?.pr_id && !selectedPR) {
      set({ error: 'No PR selected to comment on' });
      return;
    }
    try {
      const prId = currentReview?.pr_id || selectedPR?.id;
      if (!prId) throw new Error('No PR ID');
      await githubAPI.addPRComment(prId, content, lineNumber);
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to post comment') });
      throw error;
    }
  },

  // Check PR is still open on GitHub, then merge into correct branch of correct repo
  mergePR: async (mergeMethod = 'squash') => {
    const { currentReview, selectedPR, selectedRepo, selectedAccount } = get();
    const prId = currentReview?.pr_id || selectedPR?.id;
    const repoFullName = currentReview?.repo_full_name || selectedRepo?.repo_full_name;
    const prNumber = currentReview?.pr_number || selectedPR?.pr_number;
    const targetBranch = currentReview?.target_branch || selectedPR?.base_ref;
    const headBranch = currentReview?.branch_name || selectedPR?.head_ref;

    if (!prId || !repoFullName || !prNumber) {
      set({ error: 'No PR selected for merge' });
      throw new Error('No PR selected');
    }

    try {
      const result = await githubAPI.mergePR(prId, mergeMethod, {
        commit_title: `Merged PR #${prNumber} (${headBranch} → ${targetBranch}) via AI PR Reviewer`,
        repo_full_name: repoFullName,
        pr_number: prNumber,
        account_id: selectedAccount?.id || currentReview?.github_account_id,
      });
      // Mark merged, clear the selected PR so dashboard goes to empty state
      set({ prMerged: true, selectedPR: null, currentReview: null });
      // Refresh sidebar PR list
      if (selectedRepo) {
        await get().loadRepoPRs(selectedRepo.id, true);
      }
      return result;
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to merge PR') });
      throw error;
    }
  },

  // Approve the PR on GitHub
  approvePR: async (comment = 'Approved via AI PR Reviewer') => {
    const { currentReview, selectedPR } = get();
    const prId = currentReview?.pr_id || selectedPR?.id;
    if (!prId) {
      set({ error: 'No PR selected to approve' });
      throw new Error('No PR selected');
    }
    try {
      await githubAPI.approvePR(prId, comment);
      // Mark approved in store — persists until a new PR is selected
      set({ prApproved: true });
      // Persist to localStorage so it survives logout/refresh
      try {
        localStorage.setItem(`approved_pr_${selectedPR?.id}`, 'true');
      } catch {}
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to approve PR') });
      throw error;
    }
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

  // Save review mode + threshold to backend
  updateReviewMode: async (mode: 'manual' | 'automatic', threshold?: number) => {
    try {
      await usersAPI.updateSettings({ review_mode: mode, auto_merge_threshold: threshold });
      set({ reviewMode: mode });
      await get().loadUserProfile();
    } catch (error: any) {
      set({ error: extractError(error, 'Failed to update settings') });
      throw error;
    }
  },
}));