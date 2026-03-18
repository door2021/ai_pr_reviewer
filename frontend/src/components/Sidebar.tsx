import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Folder, ChevronRight, ChevronDown, GitPullRequest,
  Github, RefreshCw, Plus, LogOut, Settings, User,
  AlertCircle, Lock, Unlock, GitMerge, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GitHubImportModal } from './GitHubModal';
import { GitHubAccount, GitHubRepo, GitHubPR } from '@/types';

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
    syncingAccountId,
    error,
    logout,
    selectAccount,
    selectRepo,
    openPRForReview,
    toggleAccount,
    toggleRepo,
    syncRepo,
    syncAccount,
    disconnectGitHubAccount,
    setError,
  } = useStore();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [syncingRepoId, setSyncingRepoId] = useState<number | null>(null);

  const handleAccountClick = (account: GitHubAccount) => {
    toggleAccount(account.id);
    selectAccount(account);
  };

  const handleRepoClick = (repo: GitHubRepo) => {
    toggleRepo(repo.id);
    selectRepo(repo);
  };

  const handlePRClick = (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => {
    openPRForReview(pr, repo, account);
  };

  const handleSyncRepo = async (repoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingRepoId(repoId);
    await syncRepo(repoId);
    setSyncingRepoId(null);
  };

  const handleSyncAccount = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await syncAccount(accountId);
  };

  const handleDisconnect = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Disconnect this GitHub account? All imported repos will be removed.')) {
      await disconnectGitHubAccount(accountId);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    const name = user.full_name || user.email || 'User';
    return name.includes('@')
      ? name.split('@')[0].charAt(0).toUpperCase()
      : name.charAt(0).toUpperCase();
  };

  const getPRIcon = (pr: GitHubPR) => {
    if (pr.state === 'merged') return <GitMerge className="w-3 h-3 text-purple-400" />;
    if (pr.state === 'closed') return <GitPullRequest className="w-3 h-3 text-red-400" />;
    return <GitPullRequest className="w-3 h-3 text-emerald-400" />;
  };

  return (
    <div className="w-72 bg-surface/90 backdrop-blur-xl border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <GitPullRequest className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white">AI Reviewer</span>
        </div>
      </div>

      {/* Import Repo Button */}
      <div className="p-3 border-b border-border">
        <Button
          variant="primary"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => setIsImportModalOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Import Repo
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-white leading-none">×</button>
        </div>
      )}

      {/* Accounts + Repos Tree */}
      <div className="flex-1 overflow-y-auto p-3">
        {githubAccounts.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-surface/50 flex items-center justify-center mx-auto mb-3">
              <Github className="w-6 h-6 text-text-muted" />
            </div>
            <p className="text-sm text-text-muted mb-4">No GitHub accounts connected</p>
            <Button variant="outline" size="sm" onClick={() => setIsImportModalOpen(true)}>
              Connect GitHub Account
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {githubAccounts.map((account) => {
              const accountRepos = importedRepos.filter(
                (r) => r.github_account_id === account.id && r.is_active
              );
              const isSyncingThis = syncingAccountId === account.id;

              return (
                <div key={account.id} className="space-y-1">
                  {/* ── Account Row ── */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                      selectedAccount?.id === account.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-surface border border-transparent'
                    }`}
                    onClick={() => handleAccountClick(account)}
                  >
                    {expandedAccounts.has(account.id) ? (
                      <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                    )}

                    {/* Avatar */}
                    {account.github_avatar_url ? (
                      <img
                        src={account.github_avatar_url}
                        alt={account.github_username}
                        className="w-6 h-6 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-white font-semibold">
                          {account.github_username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        @{account.github_username}
                      </p>
                      {account.account_label && (
                        <p className="text-xs text-text-muted truncate">{account.account_label}</p>
                      )}
                    </div>

                    {/* Token status */}
                    {!account.is_token_valid && (
                      <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" title="Token expired" />
                    )}

                    {/* Sync all repos in this account */}
                    <button
                      onClick={(e) => handleSyncAccount(account.id, e)}
                      className="p-1 hover:bg-surface rounded flex-shrink-0"
                      title="Sync all repos"
                      disabled={isSyncingThis}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-text-muted hover:text-text ${
                          isSyncingThis ? 'animate-spin text-primary' : ''
                        }`}
                      />
                    </button>

                    {/* Disconnect */}
                    <button
                      onClick={(e) => handleDisconnect(account.id, e)}
                      className="p-1 hover:bg-red-500/20 rounded flex-shrink-0"
                      title="Disconnect account"
                    >
                      <span className="text-text-muted hover:text-red-400 text-xs leading-none">✕</span>
                    </button>
                  </div>

                  {/* ── Repos List (expanded) ── */}
                  {expandedAccounts.has(account.id) && (
                    <div className="ml-4 space-y-1 border-l-2 border-border/60 pl-3">
                      {accountRepos.length === 0 ? (
                        <p className="text-xs text-text-muted py-2 px-2">
                          No repos imported.{' '}
                          <button
                            className="text-primary underline"
                            onClick={() => setIsImportModalOpen(true)}
                          >
                            Import one
                          </button>
                        </p>
                      ) : (
                        accountRepos.map((repo) => {
                          const prsForRepo = selectedRepo?.id === repo.id ? repoPRs : [];

                          return (
                            <div key={repo.id} className="space-y-0.5">
                              {/* Repo Row */}
                              <button
                                onClick={() => handleRepoClick(repo)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                                  selectedRepo?.id === repo.id
                                    ? 'bg-primary/10 border border-primary/20'
                                    : 'hover:bg-surface border border-transparent'
                                }`}
                              >
                                {expandedRepos.has(repo.id) ? (
                                  <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                                )}
                                <Folder className="w-3 h-3 text-primary flex-shrink-0" />
                                <span className="text-xs font-medium text-text flex-1 text-left truncate">
                                  {repo.repo_name}
                                </span>
                                {repo.is_private ? (
                                  <Lock className="w-3 h-3 text-text-muted flex-shrink-0" title="Private" />
                                ) : (
                                  <Unlock className="w-3 h-3 text-text-muted/40 flex-shrink-0" title="Public" />
                                )}
                                {/* Per-repo sync */}
                                <button
                                  onClick={(e) => handleSyncRepo(repo.id, e)}
                                  className="p-0.5 hover:bg-surface rounded flex-shrink-0"
                                  title="Sync PRs"
                                  disabled={syncingRepoId === repo.id}
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 text-text-muted ${
                                      syncingRepoId === repo.id ? 'animate-spin' : ''
                                    }`}
                                  />
                                </button>
                              </button>

                              {/* PRs List */}
                              {expandedRepos.has(repo.id) && selectedRepo?.id === repo.id && (
                                <div className="ml-3 space-y-0.5 border-l border-border/40 pl-2">
                                  {prsForRepo.length === 0 ? (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                                      <Clock className="w-3 h-3 text-text-muted" />
                                      <p className="text-xs text-text-muted">No open PRs</p>
                                    </div>
                                  ) : (
                                    prsForRepo.map((pr) => (
                                      <button
                                        key={pr.id}
                                        onClick={() => handlePRClick(pr, repo, account)}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-left ${
                                          selectedPR?.id === pr.id
                                            ? 'bg-primary/10 border border-primary/20'
                                            : 'hover:bg-surface border border-transparent'
                                        }`}
                                      >
                                        {getPRIcon(pr)}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs text-text truncate">{pr.title}</p>
                                          <p className="text-xs text-text-muted">
                                            #{pr.pr_number} · {pr.head_ref} → {pr.base_ref}
                                          </p>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — User + Settings + Logout */}
      <div className="border-t border-border p-3 space-y-1">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface transition-all"
        >
          <Settings className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted">Settings</span>
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface transition-all"
        >
          <User className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted truncate">
            {user?.full_name || user?.email || 'Profile'}
          </span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all"
        >
          <LogOut className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted">Sign out</span>
        </button>
      </div>

      <GitHubImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
    </div>
  );
}