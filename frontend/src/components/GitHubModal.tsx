import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { X, Github, Loader2, CheckCircle, Folder, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { GitHubRepoListItem, GitHubAccount } from '@/types';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GitHubImportModal({ isOpen, onClose }: GitHubImportModalProps) {
  const {
    githubAccounts,
    connectGitHubAccount,
    importRepos,
    loadAccountRepos,
    isLoading,
    error,
  } = useStore();

  const [step, setStep] = useState<'account' | 'token' | 'repos' | 'importing'>('account');
  const [token, setToken] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoListItem[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<GitHubAccount | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (githubAccounts.length > 0) {
        setStep('account');
      } else {
        setStep('token');
      }
      setToken('');
      setAccountLabel('');
      setSelectedRepos([]);
      setLocalError('');
      setSelectedAccount(null);
    }
  }, [isOpen, githubAccounts.length]);

  const handleConnectAccount = async () => {
    if (!token.trim()) {
      setLocalError('Token is required');
      return;
    }
    try {
      await connectGitHubAccount(token, accountLabel || undefined);
      setToken('');
      setLocalError('');
      setStep('account');
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to connect GitHub account');
    }
  };

  const handleSelectAccount = async (account: GitHubAccount) => {
    setSelectedAccount(account);
    setStep('importing');
    try {
      const repos = await loadAccountRepos(account.id);
      setAvailableRepos(repos);
      setStep('repos');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setLocalError('GitHub token expired. Please reconnect account.');
        setStep('token');
      } else {
        setLocalError(err.response?.data?.detail || 'Failed to fetch repos');
        setStep('account');
      }
    }
  };

  const toggleRepoSelection = (repoFullName: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repoFullName)
        ? prev.filter((r) => r !== repoFullName)
        : [...prev, repoFullName]
    );
  };

  const handleImport = async () => {
    if (selectedRepos.length === 0) {
      setLocalError('Please select at least one repo');
      return;
    }
    if (!selectedAccount) return;

    setStep('importing');
    setLocalError('');

    try {
      await importRepos(selectedAccount.id, selectedRepos);
      onClose();
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to import repos');
      setStep('repos');
    }
  };

  const filteredRepos = availableRepos.filter(
    (repo) =>
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Modal Card */}
      <Card
        className="relative w-full max-w-2xl border-border/50 backdrop-blur-xl bg-surface/90 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <div className="absolute right-4 top-4 z-10">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
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
            {step === 'repos' && 'Select Repositories'}
            {step === 'importing' && 'Importing...'}
          </CardTitle>
          <CardDescription>
            {step === 'account' && 'Choose an account to import repositories from'}
            {step === 'token' && 'Enter your GitHub Personal Access Token'}
            {step === 'repos' && 'Choose which repos to import for code review'}
            {step === 'importing' && 'Please wait while we import your selected repos'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 overflow-y-auto flex-1">
          {/* Error Display */}
          {(error || localError) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error || localError}</span>
            </div>
          )}

          {/* STEP 1: Select Existing Account */}
          {step === 'account' && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200">
                  <strong>Choose an existing account</strong> or connect a new one below.
                </p>
              </div>

              {githubAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelectAccount(account)}
                  disabled={!account.is_token_valid}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    !account.is_token_valid
                      ? 'bg-surface/50 border-border opacity-50 cursor-not-allowed'
                      : 'bg-background/50 border-border hover:bg-surface'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {account.github_username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-text">@{account.github_username}</p>
                    {account.account_label && (
                      <p className="text-xs text-text-muted">{account.account_label}</p>
                    )}
                  </div>
                  {account.is_token_valid ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                </button>
              ))}

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface px-2 text-text-muted">Or connect new account</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedAccount(null);
                  setStep('token');
                }}
              >
                <Github className="w-4 h-4 mr-2" />
                Connect New GitHub Account
              </Button>
            </div>
          )}

          {/* STEP 2: Enter Token */}
          {step === 'token' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200">
                  <strong>How to get your token:</strong>
                  <br />
                  1. Go to{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    github.com/settings/tokens
                  </a>
                  <br />
                  2. Click "Generate new token (classic)"
                  <br />
                  3. Select scopes:{' '}
                  <code className="px-1 py-0.5 rounded bg-blue-500/20">repo</code>,{' '}
                  <code className="px-1 py-0.5 rounded bg-blue-500/20">read:org</code>
                  <br />
                  4. Copy the token and paste below
                  <br />
                  <br />
                  <strong className="text-emerald-400">
                    🔒 Your token is stored securely and used only for API calls.
                  </strong>
                </p>
              </div>

              <Input
                label="GitHub Personal Access Token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setLocalError('');
                }}
                error={localError}
              />

              <Input
                label="Account Label (Optional)"
                placeholder="e.g., work-account, personal, client-project"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                description="Helps you identify this account later"
              />

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    if (githubAccounts.length > 0) {
                      setStep('account');
                    } else {
                      onClose();
                    }
                  }}
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

          {/* STEP 3: Select Repos */}
          {step === 'repos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-text-muted">
                  Found {availableRepos.length} repositories
                </div>
                <div className="text-sm text-text-muted">Selected: {selectedRepos.length}</div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background/50 border border-border rounded-lg text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredRepos.map((repo) => {
                  const isSelected = selectedRepos.includes(repo.full_name);

                  return (
                    <button
                      key={repo.id}
                      onClick={() => toggleRepoSelection(repo.full_name)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-primary/10 border-primary/20'
                          : 'bg-background/50 border-border hover:bg-surface'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        }`}
                      >
                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <Folder className="w-4 h-4 text-primary" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-text">{repo.name}</p>
                        <p className="text-xs text-text-muted">{repo.full_name}</p>
                        {repo.description && (
                          <p className="text-xs text-text-muted mt-1 line-clamp-1">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      {repo.private && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted border border-border">
                          Private
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setStep('account')}>
                  Back
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleImport}
                  loading={isLoading}
                  disabled={selectedRepos.length === 0}
                >
                  <Folder className="w-4 h-4" />
                  Import {selectedRepos.length > 0 ? `(${selectedRepos.length})` : ''} Repos
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium text-text">Importing repositories...</p>
              <p className="text-sm text-text-muted mt-2">
                This may take a moment depending on the number of repos selected
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}