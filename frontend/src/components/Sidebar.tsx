import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { 
  Folder, ChevronRight, ChevronDown, GitPullRequest, 
  Github, RefreshCw, Plus, LogOut, Settings, User,
  AlertCircle, CheckCircle, X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GitHubImportModal } from './GitHubModal';
import { GitHubAccount, GitHubRepo, GitHubPR } from '@/types';

export default function Sidebar() {
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
    isLoading,
    error,
    logout,
    selectAccount,
    selectRepo,
    selectPR,
    loadPRReview,
    toggleAccount,
    toggleRepo,
    syncRepo,
    disconnectGitHubAccount,
    setError,
  } = useStore();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [syncingRepoId, setSyncingRepoId] = useState<number | null>(null);

  const handleAccountClick = (account: GitHubAccount) => {
    toggleAccount(account.id);
    selectAccount(account);
  };

  const handleRepoClick = async (repo: GitHubRepo) => {
    toggleRepo(repo.id);
    selectRepo(repo);
  };

  const handlePRClick = async (pr: GitHubPR, repo: GitHubRepo, account: GitHubAccount) => {
    selectPR(pr);
    await loadPRReview(pr, repo, account);
  };

  const handleSync = async (repoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingRepoId(repoId);
    await syncRepo(repoId);
    setSyncingRepoId(null);
  };

  const handleDisconnect = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Disconnect this GitHub account? All imported repos will be removed.')) {
      await disconnectGitHubAccount(accountId);
    }
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    const name = user.full_name || user.email || 'User';
    if (name.includes('@')) {
      return name.split('@')[0].charAt(0).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
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
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-white">×</button>
        </div>
      )}

      {/* Content */}
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
          <div className="space-y-3">
            {githubAccounts.map((account) => (
              <div key={account.id} className="space-y-1">
                {/* Account Header */}
                <button
                  onClick={() => handleAccountClick(account)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    selectedAccount?.id === account.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-surface border border-transparent'
                  }`}
                >
                  {expandedAccounts.has(account.id) ? (
                    <ChevronDown className="w-4 h-4 text-text-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  )}
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                    <span className="text-xs text-white font-semibold">
                      {account.github_username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      @{account.github_username}
                    </p>
                    {account.account_label && (
                      <p className="text-xs text-text-muted truncate">{account.account_label}</p>
                    )}
                  </div>
                  {!account.is_token_valid && (
                    <AlertCircle className="w-4 h-4 text-yellow-500" title="Token expired" />
                  )}
                  <button
                    onClick={(e) => handleDisconnect(account.id, e)}
                    className="p-1 hover:bg-red-500/20 rounded"
                    title="Disconnect"
                  >
                    <X className="w-3 h-3 text-text-muted hover:text-red-400" />
                  </button>
                </button>

                {/* Repos List */}
                {expandedAccounts.has(account.id) && (
                  <div className="ml-4 space-y-1 border-l-2 border-border pl-3">
                    {importedRepos
                      .filter((repo) => repo.github_account_id === account.id && repo.is_active)
                      .map((repo) => (
                        <div key={repo.id} className="space-y-1">
                          {/* Repo Header */}
                          <button
                            onClick={() => handleRepoClick(repo)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                              selectedRepo?.id === repo.id
                                ? 'bg-primary/10 border border-primary/20'
                                : 'hover:bg-surface border border-transparent'
                            }`}
                          >
                            {expandedRepos.has(repo.id) ? (
                              <ChevronDown className="w-3 h-3 text-text-muted" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-text-muted" />
                            )}
                            <Folder className="w-3 h-3 text-primary" />
                            <span className="text-xs font-medium text-text flex-1 text-left truncate">
                              {repo.repo_name}
                            </span>
                            <button
                              onClick={(e) => handleSync(repo.id, e)}
                              className="p-0.5 hover:bg-surface rounded"
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
                            <div className="ml-3 space-y-1 border-l-2 border-border pl-2">
                              {repoPRs.length > 0 ? (
                                repoPRs.map((pr) => (
                                  <button
                                    key={pr.id}
                                    onClick={() => handlePRClick(pr, repo, account)}
                                    className={`w-full flex items-center gap-2 px-2 py-1 rounded transition-all ${
                                      selectedPR?.id === pr.id
                                        ? 'bg-primary/10 border border-primary/20'
                                        : 'hover:bg-surface border border-transparent'
                                    }`}
                                  >
                                    <GitPullRequest className="w-3 h-3 text-text-muted" />
                                    <div className="flex-1 text-left min-w-0">
                                      <p className="text-xs font-medium text-text truncate">
                                        #{pr.pr_number} {pr.title}
                                      </p>
                                      <p className="text-xs text-text-muted truncate">
                                        {pr.head_ref} → {pr.base_ref}
                                      </p>
                                    </div>
                                    {pr.state === 'open' && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    )}
                                  </button>
                                ))
                              ) : (
                                <p className="text-xs text-text-muted px-2 py-1">No open PRs</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-border space-y-2">
        <button
          onClick={() => (window.location.href = '/profile')}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors"
        >
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-sm">
            {getUserInitials()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-xs text-text-muted truncate">{user?.email || ''}</p>
          </div>
          <Settings className="w-4 h-4 text-text-muted" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-text-muted"
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>

      {/* Import Modal */}
      <GitHubImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
}