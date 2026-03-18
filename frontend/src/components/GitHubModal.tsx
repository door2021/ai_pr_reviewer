import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import {
  X, Github, Loader2, CheckCircle, Folder, Search, AlertCircle,
  Lock, Unlock, ChevronRight, Sparkles, Plus, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GitHubRepoListItem, GitHubAccount } from '@/types';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'account' | 'token' | 'repos' | 'importing';

const IMPORT_MESSAGES = [
  'Connecting to GitHub…',
  'Fetching repository details…',
  'Syncing open pull requests…',
  'Saving to database…',
  'Almost done…',
];

export function GitHubImportModal({ isOpen, onClose }: GitHubImportModalProps) {
  const {
    githubAccounts,
    connectGitHubAccount,
    importRepos,
    loadAccountRepos,
    loadGitHubAccounts,
    isLoading,
  } = useStore();

  const [step, setStep] = useState<Step>('token');
  const [token, setToken] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoListItem[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<GitHubAccount | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState(IMPORT_MESSAGES[0]);
  const [fetchingRepos, setFetchingRepos] = useState(false);

  // When modal opens, decide starting step based on existing accounts
  useEffect(() => {
    if (isOpen) {
      reset();
      if (githubAccounts.length > 0) setStep('account');
      else setStep('token');
    }
  }, [isOpen]);

  // When accounts list updates (after connecting new), refresh step if needed
  useEffect(() => {
    if (isOpen && step === 'token' && githubAccounts.length > 0 && !selectedAccount) {
      // Just connected a new account — go to account selection to pick it
      setStep('account');
    }
  }, [githubAccounts.length]);

  const reset = () => {
    setToken('');
    setAccountLabel('');
    setSelectedRepos([]);
    setLocalError('');
    setSelectedAccount(null);
    setAvailableRepos([]);
    setSearchQuery('');
    setImportProgress(0);
    setImportMessage(IMPORT_MESSAGES[0]);
    setFetchingRepos(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step: connect new account ──
  const handleConnectAccount = async () => {
    if (!token.trim()) { setLocalError('Token is required'); return; }
    setLocalError('');
    try {
      const newAccount = await connectGitHubAccount(token, accountLabel || undefined);
      setToken('');
      setAccountLabel('');
      // After connecting, immediately load repos for this new account
      // githubAccounts state has been updated by connectGitHubAccount
      // Get the freshly loaded accounts to find the new one
      const updatedAccounts = useStore.getState().githubAccounts;
      const justAdded = updatedAccounts[updatedAccounts.length - 1];
      if (justAdded) {
        await handleSelectAccount(justAdded);
      } else {
        setStep('account');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setLocalError(typeof msg === 'string' ? msg : 'Failed to connect account. Check your token.');
    }
  };

  // ── Step: pick account → fetch its GitHub repos ──
  const handleSelectAccount = async (account: GitHubAccount) => {
    setSelectedAccount(account);
    setLocalError('');
    setFetchingRepos(true);
    setStep('importing');
    setImportMessage('Fetching your repositories…');
    setImportProgress(15);
    try {
      const repos = await loadAccountRepos(account.id);
      setAvailableRepos(repos);
      setImportProgress(0);
      setStep('repos');
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        setLocalError('GitHub token for this account has expired. Please reconnect it with a new token.');
        setStep('account');
      } else {
        setLocalError(typeof detail === 'string' ? detail : 'Failed to fetch repositories from GitHub.');
        setStep('account');
      }
      setImportProgress(0);
    } finally {
      setFetchingRepos(false);
    }
  };

  const toggleRepo = (fullName: string) => {
    setSelectedRepos(prev =>
      prev.includes(fullName) ? prev.filter(r => r !== fullName) : [...prev, fullName]
    );
  };

  const selectAll = () => setSelectedRepos(filteredRepos.map(r => r.full_name));
  const selectNone = () => setSelectedRepos([]);

  // ── Step: import selected repos ──
  const handleImport = async () => {
    if (selectedRepos.length === 0) { setLocalError('Select at least one repo'); return; }
    if (!selectedAccount) return;

    setStep('importing');
    setLocalError('');

    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, IMPORT_MESSAGES.length - 1);
      setImportMessage(IMPORT_MESSAGES[msgIdx]);
      setImportProgress(p => Math.min(p + 18, 90));
    }, 600);

    try {
      await importRepos(selectedAccount.id, selectedRepos);
      clearInterval(interval);
      setImportProgress(100);
      setImportMessage(`✓ ${selectedRepos.length} repo${selectedRepos.length !== 1 ? 's' : ''} imported!`);
      setTimeout(handleClose, 1000);
    } catch (err: any) {
      clearInterval(interval);
      setImportProgress(0);
      const detail = err?.response?.data?.detail;
      setLocalError(typeof detail === 'string' ? detail : 'Import failed. Try again.');
      setStep('repos');
    }
  };

  const filteredRepos = availableRepos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Already-imported repo full names for this account
  const alreadyImported = useStore.getState().importedRepos
    .filter(r => r.github_account_id === selectedAccount?.id)
    .map(r => r.repo_full_name);

  if (!isOpen) return null;

  const stepTitle: Record<Step, string> = {
    account: 'Select Account',
    token: 'Connect GitHub Account',
    repos: `Select Repos — @${selectedAccount?.github_username}`,
    importing: fetchingRepos ? 'Loading repositories…' : 'Importing…',
  };

  const stepDesc: Record<Step, string> = {
    account: 'Choose an account to import repos from, or connect a new one',
    token: 'Enter a GitHub Personal Access Token with repo access',
    repos: `${availableRepos.length} repos available · ${selectedRepos.length} selected`,
    importing: '',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-base">{stepTitle[step]}</h2>
              {stepDesc[step] && <p className="text-xs text-text-muted mt-0.5">{stepDesc[step]}</p>}
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-surface/80 rounded-lg transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {/* Global error */}
          {localError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{localError}</span>
              <button className="ml-auto text-red-400/60 hover:text-red-400" onClick={() => setLocalError('')}>×</button>
            </div>
          )}

          {/* ─── STEP: account ─── */}
          {step === 'account' && (
            <div className="space-y-2">
              {githubAccounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => !account.is_token_valid ? null : handleSelectAccount(account)}
                  disabled={!account.is_token_valid || fetchingRepos}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    !account.is_token_valid
                      ? 'border-yellow-500/30 bg-yellow-500/5 opacity-70 cursor-not-allowed'
                      : 'border-border hover:border-primary/40 hover:bg-primary/5 bg-background/40 cursor-pointer'
                  }`}
                >
                  {account.github_avatar_url ? (
                    <img src={account.github_avatar_url} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm text-white font-semibold">
                        {account.github_username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">@{account.github_username}</p>
                    <p className="text-xs text-text-muted truncate">
                      {account.is_token_valid ? (account.account_label || 'Active') : '⚠ Token expired — reconnect first'}
                    </p>
                  </div>
                  {account.is_token_valid
                    ? <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                    : <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  }
                </button>
              ))}

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-surface px-3 text-xs text-text-muted uppercase tracking-wider">or</span>
                </div>
              </div>

              <button
                onClick={() => setStep('token')}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4 text-text-muted" />
                </div>
                <span className="text-sm text-text-muted">Connect new GitHub account</span>
              </button>
            </div>
          )}

          {/* ─── STEP: token ─── */}
          {step === 'token' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-500/8 border border-blue-500/20 text-sm text-blue-200 space-y-2">
                <p className="font-medium text-blue-100">How to get a Personal Access Token:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-200/80">
                  <li>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="underline text-blue-300">github.com/settings/tokens</a></li>
                  <li>Click <strong>Generate new token (classic)</strong></li>
                  <li>Select scopes: <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-xs">repo</code> and <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-xs">read:org</code></li>
                  <li>Copy and paste below</li>
                </ol>
                <p className="text-emerald-400 text-xs mt-2">🔒 Stored securely, only used for GitHub API calls.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Personal Access Token *</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={e => { setToken(e.target.value); setLocalError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleConnectAccount()}
                  className="w-full px-3 py-2.5 bg-background/60 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Label <span className="text-text-muted/50">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. work, personal, client-project"
                  value={accountLabel}
                  onChange={e => setAccountLabel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-background/60 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          )}

          {/* ─── STEP: repos ─── */}
          {step === 'repos' && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search repositories…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background/60 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>

              {/* Select controls */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">
                  {filteredRepos.length} repos shown · {selectedRepos.length} selected
                </span>
                <div className="flex gap-3">
                  <button onClick={selectAll} className="text-primary hover:underline">Select all</button>
                  {selectedRepos.length > 0 && (
                    <button onClick={selectNone} className="text-text-muted hover:text-text hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Repo list */}
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {filteredRepos.length === 0 ? (
                  <p className="text-center text-text-muted text-sm py-8">No repositories found</p>
                ) : (
                  filteredRepos.map(repo => {
                    const isSelected = selectedRepos.includes(repo.full_name);
                    const isAlready = alreadyImported.includes(repo.full_name);
                    return (
                      <button
                        key={repo.full_name}
                        onClick={() => !isAlready && toggleRepo(repo.full_name)}
                        disabled={isAlready}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          isAlready
                            ? 'border-border/50 bg-surface/30 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'border-primary/50 bg-primary/8'
                            : 'border-border hover:border-border/80 hover:bg-surface/60 bg-background/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isAlready
                            ? 'border-emerald-500 bg-emerald-500'
                            : isSelected
                            ? 'border-primary bg-primary'
                            : 'border-border/60'
                        }`}>
                          {(isSelected || isAlready) && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>

                        <Folder className="w-4 h-4 text-primary flex-shrink-0" />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text truncate">{repo.name}</p>
                          {repo.description && (
                            <p className="text-xs text-text-muted truncate">{repo.description}</p>
                          )}
                          {isAlready && (
                            <p className="text-xs text-emerald-400">Already imported</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {repo.private
                            ? <Lock className="w-3 h-3 text-text-muted" />
                            : <Unlock className="w-3 h-3 text-text-muted/40" />
                          }
                          <span className="text-xs text-text-muted hidden sm:block">{repo.default_branch}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ─── STEP: importing animation ─── */}
          {step === 'importing' && (
            <div className="py-10 flex flex-col items-center gap-6">
              {importProgress < 100 ? (
                <>
                  <div className="relative w-16 h-16">
                    <div className="w-16 h-16 rounded-full border-4 border-border" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Github className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <div className="w-full max-w-xs space-y-2 text-center">
                    <p className="text-sm text-text-muted">{importMessage}</p>
                    {importProgress > 0 && (
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-base font-medium text-white">{importMessage}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step !== 'importing' && (
          <div className="flex gap-3 px-6 py-4 border-t border-border flex-shrink-0">
            {step === 'account' && (
              <Button variant="secondary" className="flex-1" onClick={handleClose}>Cancel</Button>
            )}
            {step === 'token' && (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => githubAccounts.length > 0 ? setStep('account') : handleClose()}
                >
                  {githubAccounts.length > 0 ? (
                    <><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</>
                  ) : 'Cancel'}
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleConnectAccount}
                  disabled={!token.trim() || isLoading}
                >
                  {isLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Github className="w-4 h-4" />
                  }
                  Connect
                </Button>
              </>
            )}
            {step === 'repos' && (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => { setStep('account'); setSelectedAccount(null); setAvailableRepos([]); setSelectedRepos([]); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleImport}
                  disabled={selectedRepos.length === 0 || isLoading}
                >
                  {isLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Sparkles className="w-4 h-4" />
                  }
                  Import {selectedRepos.length > 0 ? selectedRepos.length : ''} Repo{selectedRepos.length !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}