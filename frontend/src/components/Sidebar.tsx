import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Folder, ChevronRight, ChevronDown, GitPullRequest,
  Github, RefreshCw, Plus, LogOut, Settings, User,
  AlertCircle, GitMerge, Clock, Loader2, KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GitHubImportModal } from './GitHubModal';
import { GitHubAccount, GitHubRepo, GitHubPR } from '@/types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 288;

// ── Token-expired re-auth modal ───────────────────────────────
function ReconnectModal({
  account,
  onClose,
  onSuccess,
}: {
  account: GitHubAccount;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { reconnectAccount, isLoading } = useStore();
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async () => {
    if (!token.trim()) { setLocalError('Token is required'); return; }
    setLocalError('');
    try {
      await reconnectAccount(account.id, token);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setLocalError(typeof detail === 'string' ? detail : 'Failed to reconnect. Check the token.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Token Expired</h3>
            <p className="text-xs text-text-muted">@{account.github_username}</p>
          </div>
        </div>

        <p className="text-sm text-text-muted mb-4">
          The access token for <span className="text-white font-medium">@{account.github_username}</span> has
          expired or been revoked. Enter a new Personal Access Token to reconnect this account.
        </p>

        {localError && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{localError}
          </div>
        )}

        <input
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={token}
          onChange={e => { setToken(e.target.value); setLocalError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2.5 bg-background/70 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 font-mono"
          autoFocus
        />

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={!token.trim() || isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reconnect
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main Sidebar ──────────────────────────────────────────────
export default function Sidebar() {
  const navigate = useNavigate();
  const {
    user,
    githubAccounts,
    importedRepos,
    selectedAccount,
    selectedRepo,
    selectedPR,
    expandedAccounts,
    expandedRepos,
    repoPRs,
    error,
    logout,
    selectAccount,
    selectRepo,
    openPRForReview,
    toggleAccount,
    toggleRepo,
    syncRepo,
    disconnectGitHubAccount,
    loadRepoPRs,
    loadGitHubAccounts,
    setError,
  } = useStore();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [syncingRepoId, setSyncingRepoId] = useState<number | null>(null);
  const [loadingPRsRepoId, setLoadingPRsRepoId] = useState<number | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<GitHubAccount | null>(null);

  // ── Resizable sidebar ──
  const [width, setWidth] = useState(() => {
    const s = localStorage.getItem('sidebar_width');
    return s ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(s))) : DEFAULT_WIDTH;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(DEFAULT_WIDTH);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + e.clientX - startX.current));
      setWidth(next);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(w => { localStorage.setItem('sidebar_width', String(w)); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const isNarrow = width < 220;

  // ── Handlers ──
  const handleAccountClick = (account: GitHubAccount) => {
    if (!account.is_token_valid) { setReconnectTarget(account); return; }
    toggleAccount(account.id);
    selectAccount(account);
  };

  const handleRepoClick = async (repo: GitHubRepo) => {
    const wasExpanded = expandedRepos.has(repo.id);
    toggleRepo(repo.id);
    selectRepo(repo);
    if (!wasExpanded) {
      setLoadingPRsRepoId(repo.id);
      try { await loadRepoPRs(repo.id, true); }
      finally { setLoadingPRsRepoId(null); }
    }
  };

  const handleSyncRepo = async (repoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingRepoId(repoId);
    setLoadingPRsRepoId(repoId);
    try {
      await syncRepo(repoId);
      await loadRepoPRs(repoId, false);
    } finally {
      setSyncingRepoId(null);
      setLoadingPRsRepoId(null);
    }
  };

  const handleDisconnect = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Disconnect this GitHub account? All imported repos will be removed.')) {
      await disconnectGitHubAccount(accountId);
    }
  };

  const getPRIcon = (pr: GitHubPR) => {
    if (pr.state === 'merged') return <GitMerge className="w-3 h-3 text-purple-400" />;
    if (pr.state === 'closed') return <GitPullRequest className="w-3 h-3 text-red-400" />;
    return <GitPullRequest className="w-3 h-3 text-emerald-400" />;
  };

  return (
    <>
      <div
        style={{ width }}
        className="relative bg-surface/90 backdrop-blur-xl border-r border-border flex flex-col h-full flex-shrink-0 overflow-hidden"
      >
        {/* Header */}
        <div className="h-16 border-b border-border flex items-center px-4 gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
            {/* <GitPullRequest className="w-5 h-5 text-white" /> */}
            <img src="/deepreview.svg" alt="Logo" className="w-8 h-8 rounded-lg" />
          </div>
          {!isNarrow && <span className="font-bold text-lg text-white truncate">AI Reviewer</span>}
        </div>

        {/* Import Button */}
        <div className="p-3 border-b border-border flex-shrink-0">
          <Button
            variant="primary" size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setIsImportModalOpen(true)}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            {!isNarrow && 'Import Repo'}
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2 flex-shrink-0">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {!isNarrow && <span className="flex-1 break-words">{error}</span>}
            <button onClick={() => setError(null)} className="ml-auto leading-none hover:text-white">×</button>
          </div>
        )}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {githubAccounts.length === 0 ? (
            <div className="text-center py-8 px-2">
              <Github className="w-8 h-8 text-text-muted mx-auto mb-3" />
              {!isNarrow && (
                <>
                  <p className="text-sm text-text-muted mb-3">No accounts connected</p>
                  <Button variant="outline" size="sm" onClick={() => setIsImportModalOpen(true)}>
                    Connect Account
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {githubAccounts.map(account => {
                const repos = importedRepos.filter(r => r.github_account_id === account.id && r.is_active);
                const expired = !account.is_token_valid;

                return (
                  <div key={account.id}>
                    {/* ── Account Row ── */}
                    <div
                      onClick={() => handleAccountClick(account)}
                      title={expired ? 'Token expired — click to reconnect' : `@${account.github_username}`}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${
                        expired
                          ? 'border border-yellow-500/30 bg-yellow-500/5'
                          : selectedAccount?.id === account.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-surface border border-transparent'
                      }`}
                    >
                      {/* Expand chevron or warning */}
                      {expired
                        ? <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                        : expandedAccounts.has(account.id)
                        ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                      }

                      {/* Avatar */}
                      {account.github_avatar_url
                        ? <img src={account.github_avatar_url} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                        : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-white font-semibold">
                              {account.github_username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )
                      }

                      {/* Name */}
                      {!isNarrow && (
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${expired ? 'text-yellow-300' : 'text-text'}`}>
                            @{account.github_username}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {expired ? 'Token expired' : account.account_label || ''}
                          </p>
                        </div>
                      )}

                      {/* Reconnect button (expired only) */}
                      {expired && (
                        <button
                          onClick={e => { e.stopPropagation(); setReconnectTarget(account); }}
                          className="p-1 hover:bg-yellow-500/20 rounded flex-shrink-0"
                          title="Reconnect account"
                        >
                          <KeyRound className="w-3 h-3 text-yellow-400" />
                        </button>
                      )}

                      {/* Disconnect */}
                      <button
                        onClick={e => handleDisconnect(account.id, e)}
                        className="p-1 hover:bg-red-500/20 rounded flex-shrink-0"
                        title="Disconnect"
                      >
                        <span className="text-text-muted/60 hover:text-red-400 text-xs leading-none">✕</span>
                      </button>
                    </div>

                    {/* ── Repos ── */}
                    {expandedAccounts.has(account.id) && !expired && (
                      <div className="ml-3 mt-0.5 border-l-2 border-border/50 pl-2 space-y-0.5">
                        {repos.length === 0 ? (
                          <p className="text-xs text-text-muted px-1 py-2">
                            No repos.{' '}
                            <button className="text-primary underline" onClick={() => setIsImportModalOpen(true)}>
                              Import
                            </button>
                          </p>
                        ) : repos.map(repo => {
                          const prsForRepo = selectedRepo?.id === repo.id ? repoPRs : [];
                          const isSyncing = syncingRepoId === repo.id;
                          const isLoadingPRs = loadingPRsRepoId === repo.id;
                          const isExpanded = expandedRepos.has(repo.id) && selectedRepo?.id === repo.id;

                          return (
                            <div key={repo.id}>
                              {/* Repo Row */}
                              <button
                                onClick={() => handleRepoClick(repo)}
                                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${
                                  selectedRepo?.id === repo.id
                                    ? 'bg-primary/10 border border-primary/20'
                                    : 'hover:bg-surface border border-transparent'
                                }`}
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
                                  : <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                                }
                                <Folder className="w-3 h-3 text-primary flex-shrink-0" />
                                {!isNarrow && (
                                  <span className="text-xs font-medium text-text flex-1 text-left truncate">
                                    {repo.repo_name}
                                  </span>
                                )}
                                {/* Per-repo sync button — the only refresh control */}
                                <button
                                  onClick={e => handleSyncRepo(repo.id, e)}
                                  className="p-0.5 hover:bg-primary/10 rounded flex-shrink-0 transition-colors"
                                  disabled={isSyncing}
                                  title="Sync PRs from GitHub"
                                >
                                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-primary' : 'text-text-muted hover:text-primary'}`} />
                                </button>
                              </button>

                              {/* PRs */}
                              {isExpanded && (
                                <div className="ml-3 mt-0.5 border-l border-border/30 pl-2 space-y-0.5 pb-1">
                                  {isLoadingPRs ? (
                                    <div className="flex items-center gap-2 px-2 py-2">
                                      <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                      <span className="text-xs text-text-muted">Loading PRs…</span>
                                    </div>
                                  ) : prsForRepo.length === 0 ? (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                                      <Clock className="w-3 h-3 text-text-muted" />
                                      <p className="text-xs text-text-muted">No open PRs</p>
                                    </div>
                                  ) : prsForRepo.map(pr => (
                                    <button
                                      key={pr.id}
                                      onClick={() => openPRForReview(pr, repo, account)}
                                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded transition-all text-left ${
                                        selectedPR?.id === pr.id
                                          ? 'bg-primary/10 border border-primary/20'
                                          : 'hover:bg-surface border border-transparent'
                                      }`}
                                    >
                                      {getPRIcon(pr)}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-text truncate">{pr.title}</p>
                                        {!isNarrow && (
                                          <p className="text-xs text-text-muted truncate">
                                            #{pr.pr_number} · {pr.head_ref} → {pr.base_ref}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-2 space-y-0.5 flex-shrink-0">
          {[
            { icon: <Settings className="w-4 h-4" />, label: 'Settings', action: () => navigate('/settings') },
            { icon: <User className="w-4 h-4" />, label: user?.full_name || user?.email || 'Profile', action: () => navigate('/profile') },
            { icon: <LogOut className="w-4 h-4" />, label: 'Sign out', action: async () => { await logout(); navigate('/login'); }, danger: true },
          ].map(({ icon, label, action, danger }) => (
            <button
              key={label}
              onClick={action}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all ${
                danger ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-surface'
              }`}
              title={label}
            >
              <span className="text-text-muted flex-shrink-0">{icon}</span>
              {!isNarrow && <span className="text-sm text-text-muted truncate">{label}</span>}
            </button>
          ))}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group z-20"
        >
          <div className="absolute right-0 top-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-primary/60 transition-all" />
          <div className="absolute right-0 top-0 h-full w-4 -translate-x-1.5" />
        </div>
      </div>

      {/* Portalled modals */}
      {isImportModalOpen && (
        <GitHubImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
      )}

      {reconnectTarget && (
        <ReconnectModal
          account={reconnectTarget}
          onClose={() => setReconnectTarget(null)}
          onSuccess={() => { loadGitHubAccounts(); setReconnectTarget(null); }}
        />
      )}
    </>
  );
}