import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import {
  X, Github, Loader2, CheckCircle, Folder, Search, AlertCircle,
  Lock, Unlock, ChevronRight, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
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
    isLoading,
    error,
    setError,
  } = useStore();

  const [step, setStep] = useState<Step>('account');
  const [token, setToken] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoListItem[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<GitHubAccount | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState(IMPORT_MESSAGES[0]);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      resetState();
      if (githubAccounts.length > 0) setStep('account');
      else setStep('token');
    }
  }, [isOpen]);

  const resetState = () => {
    setStep('account');
    setToken('');
    setAccountLabel('');
    setSelectedRepos([]);
    setLocalError('');
    setSelectedAccount(null);
    setAvailableRepos([]);
    setSearchQuery('');
    setImportProgress(0);
    setImportMessage(IMPORT_MESSAGES[0]);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleConnectAccount = async () => {
    if (!token.trim()) { setLocalError('Token is required'); return; }
    setLocalError('');
    try {
      await connectGitHubAccount(token, accountLabel || undefined);
      setToken('');
      setAccountLabel('');
      setStep('account');
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to connect account');
    }
  };

  const handleSelectAccount = async (account: GitHubAccount) => {
    setSelectedAccount(account);
    setStep('importing');
    setLocalError('');
    setImportProgress(10);
    setImportMessage('Fetching your repositories…');
    try {
      const repos = await loadAccountRepos(account.id);
      setAvailableRepos(repos);
      setImportProgress(0);
      setStep('repos');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setLocalError('GitHub token expired. Please reconnect this account.');
        setStep('token');
      } else {
        setLocalError(err.response?.data?.detail || 'Failed to fetch repos');
        setStep('account');
      }
      setImportProgress(0);
    }
  };

  const toggleRepo = (fullName: string) => {
    setSelectedRepos((prev) =>
      prev.includes(fullName) ? prev.filter((r) => r !== fullName) : [...prev, fullName]
    );
  };

  const selectAll = () => {
    const allFiltered = filteredRepos.map((r) => r.full_name);
    setSelectedRepos(allFiltered);
  };

  const handleImport = async () => {
    if (selectedRepos.length === 0) { setLocalError('Select at least one repo'); return; }
    if (!selectedAccount) return;

    setStep('importing');
    setLocalError('');
    setImportedCount(selectedRepos.length);

    // Animated progress
    let msgIndex = 0;
    const progressInterval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, IMPORT_MESSAGES.length - 1);
      setImportMessage(IMPORT_MESSAGES[msgIndex]);
      setImportProgress((prev) => Math.min(prev + 18, 90));
    }, 600);

    try {
      await importRepos(selectedAccount.id, selectedRepos);
      clearInterval(progressInterval);
      setImportProgress(100);
      setImportMessage(`✓ Imported ${selectedRepos.length} repo${selectedRepos.length > 1 ? 's' : ''} successfully!`);
      setTimeout(() => handleClose(), 1000);
    } catch (err: any) {
      clearInterval(progressInterval);
      setImportProgress(0);
      setLocalError(err.response?.data?.detail || 'Failed to import repos');
      setStep('repos');
    }
  };

  const filteredRepos = availableRepos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <Card
        className="relative w-full max-w-2xl border-border/50 backdrop-blur-xl bg-surface/95 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="absolute right-4 top-4 z-10">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <CardHeader className="flex-shrink-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center mb-4">
            <Github className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl text-white">
            {step === 'account' && 'Select GitHub Account'}
            {step === 'token' && 'Connect GitHub Account'}
            {step === 'repos' && `Select Repositories — @${selectedAccount?.github_username}`}
            {step === 'importing' && 'Importing…'}
          </CardTitle>
          <CardDescription>
            {step === 'account' && 'Choose an account to import repositories from'}
            {step === 'token' && 'Enter your GitHub Personal Access Token'}
            {step === 'repos' && `${availableRepos.length} repositories available`}
            {step === 'importing' && 'Please wait while we set up your repositories'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 overflow-y-auto flex-1">
          {/* Error */}
          {(error || localError) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error || localError}</span>
            </div>
          )}

          {/* ── STEP 1: Select Account ── */}
          {step === 'account' && (
            <div className="space-y-3">
              {githubAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelectAccount(account)}
                  disabled={!account.is_token_valid}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    !account.is_token_valid
                      ? 'opacity-50 cursor-not-allowed border-border bg-surface/50'
                      : 'border-border hover:bg-surface hover:border-primary/30 bg-background/50'
                  }`}
                >
                  {account.github_avatar_url ? (
                    <img src={account.github_avatar_url} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                      <span className="text-white font-semibold">
                        {account.github_username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-text">@{account.github_username}</p>
                    {account.account_label && (
                      <p className="text-xs text-text-muted">{account.account_label}</p>
                    )}
                  </div>
                  {account.is_token_valid ? (
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  ) : (
                    <span className="text-xs text-yellow-500">Token expired</span>
                  )}
                </button>
              ))}

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface px-2 text-text-muted">Or connect new account</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setStep('token')}>
                <Github className="w-4 h-4 mr-2" />
                Connect New GitHub Account
              </Button>
            </div>
          )}

          {/* ── STEP 2: Token Input ── */}
          {step === 'token' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200">
                <p className="font-semibold mb-2">How to get a Personal Access Token:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="underline">github.com/settings/tokens</a></li>
                  <li>Click "Generate new token (classic)"</li>
                  <li>Select scopes: <code className="px-1 bg-blue-500/20 rounded">repo</code>, <code className="px-1 bg-blue-500/20 rounded">read:org</code></li>
                  <li>Copy and paste the token below</li>
                </ol>
                <p className="mt-2 text-emerald-400 font-medium">🔒 Token is stored securely and only used for GitHub API calls.</p>
              </div>

              <Input
                label="GitHub Personal Access Token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => { setToken(e.target.value); setLocalError(''); }}
                error={localError}
              />

              <Input
                label="Label (optional)"
                placeholder="e.g. work-account, personal, client"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                description="Helps you identify this account"
              />

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => githubAccounts.length > 0 ? setStep('account') : handleClose()}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleConnectAccount}
                  disabled={!token.trim()}
                  loading={isLoading}
                >
                  <Github className="w-4 h-4" />
                  Connect
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Select Repos ── */}
          {step === 'repos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">{selectedRepos.length} selected</span>
                <button
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                >
                  Select all ({filteredRepos.length})
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search repositories…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background/50 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredRepos.length === 0 ? (
                  <p className="text-center text-text-muted text-sm py-4">No repositories found</p>
                ) : (
                  filteredRepos.map((repo) => {
                    const isSelected = selectedRepos.includes(repo.full_name);
                    return (
                      <button
                        key={repo.full_name}
                        onClick={() => toggleRepo(repo.full_name)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-surface bg-background/50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? 'border-primary bg-primary' : 'border-border'
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <Folder className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-text truncate">{repo.name}</p>
                          {repo.description && (
                            <p className="text-xs text-text-muted truncate">{repo.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {repo.private ? (
                            <Lock className="w-3 h-3 text-text-muted" />
                          ) : (
                            <Unlock className="w-3 h-3 text-text-muted/40" />
                          )}
                          <span className="text-xs text-text-muted">{repo.default_branch}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex gap-3 pt-2 border-t border-border">
                <Button variant="secondary" className="flex-1" onClick={() => setStep('account')}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleImport}
                  disabled={selectedRepos.length === 0}
                >
                  <Sparkles className="w-4 h-4" />
                  Import {selectedRepos.length > 0 ? `${selectedRepos.length} ` : ''}Repo{selectedRepos.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Importing Animation ── */}
          {step === 'importing' && (
            <div className="py-8 flex flex-col items-center justify-center gap-6">
              {importProgress < 100 ? (
                <>
                  <div className="relative w-20 h-20">
                    <div className="w-20 h-20 rounded-full border-4 border-border" />
                    <div
                      className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Github className="w-8 h-8 text-primary" />
                    </div>
                  </div>

                  <div className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>{importMessage}</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                  </div>

                  {importedCount > 0 && (
                    <p className="text-sm text-text-muted">
                      Importing {importedCount} repo{importedCount !== 1 ? 's' : ''}…
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                  </div>
                  <p className="text-lg font-semibold text-white">{importMessage}</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}