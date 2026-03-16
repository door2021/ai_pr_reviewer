import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { X, Github, Loader2, CheckCircle, Folder, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Repo } from '@/types';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GitHubModal({ isOpen, onClose }: GitHubModalProps) {
  const { 
    githubConnected, 
    connectGitHub, 
    disconnectGitHub, 
    isLoading, 
    error,
    availableRepos,
    importedRepos,
    importRepos,
    fetchAvailableRepos,
    fetchImportedRepos
  } = useStore();
  
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [step, setStep] = useState<'connect' | 'select' | 'done'>('connect');

  useEffect(() => {
    if (isOpen && githubConnected) {
      setStep('done');
      fetchImportedRepos();
    } else if (isOpen) {
      setStep('connect');
    }
  }, [isOpen, githubConnected]);

  useEffect(() => {
    if (step === 'select' && githubConnected) {
      fetchAvailableRepos();
    }
  }, [step]);

  const handleConnect = async () => {
    if (!token.trim()) {
      setLocalError('Token is required');
      return;
    }
    try {
      await connectGitHub(token);
      setToken('');
      setLocalError('');
      setStep('select');
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGitHub();
      setStep('connect');
      onClose();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  const toggleRepoSelection = (repoFullName: string) => {
    setSelectedRepos(prev => 
      prev.includes(repoFullName)
        ? prev.filter(r => r !== repoFullName)
        : [...prev, repoFullName]
    );
  };

  const handleImport = async () => {
    if (selectedRepos.length === 0) {
      setLocalError('Please select at least one repo');
      return;
    }
    try {
      await importRepos(selectedRepos);
      setStep('done');
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to import repos');
    }
  };

  const filteredRepos = availableRepos.filter((repo: Repo) =>
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isRepoAlreadyImported = (repoFullName: string) => {
    return importedRepos.some((r: Repo) => r.repo_full_name === repoFullName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <Card className="relative w-full max-w-2xl border-border/50 backdrop-blur-xl bg-surface/90 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
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
            {step === 'connect' && 'Connect GitHub'}
            {step === 'select' && 'Select Repositories'}
            {step === 'done' && 'GitHub Connected'}
          </CardTitle>
          <CardDescription>
            {step === 'connect' && 'Import pull requests and repositories from your GitHub account'}
            {step === 'select' && 'Choose which repos to import for code review'}
            {step === 'done' && 'Manage your connected GitHub account'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 overflow-y-auto flex-1">
          {(error || localError) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error || localError}
            </div>
          )}

          {/* STEP 1: Connect */}
          {step === 'connect' && (
            <>
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200">
                  <strong>How to get your token:</strong>
                  <br />
                  1. Go to{' '}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline">
                    github.com/settings/tokens
                  </a>
                  <br />
                  2. Click "Generate new token (classic)"
                  <br />
                  3. Select scopes: <code className="px-1 py-0.5 rounded bg-blue-500/20">repo</code>, <code className="px-1 py-0.5 rounded bg-blue-500/20">read:org</code>
                  <br />
                  4. Copy the token and paste below
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

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-2" onClick={handleConnect} loading={isLoading}>
                  <Github className="w-4 h-4" />
                  Connect
                </Button>
              </div>
            </>
          )}

          {/* STEP 2: Select Repos */}
          {step === 'select' && (
            <>
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

              <div className="text-xs text-text-muted mb-2">
                Selected: {selectedRepos.length} repos
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredRepos.map((repo: Repo) => {
                  const alreadyImported = isRepoAlreadyImported(repo.full_name);
                  const isSelected = selectedRepos.includes(repo.full_name);
                  
                  return (
                    <button
                      key={repo.id}
                      onClick={() => !alreadyImported && toggleRepoSelection(repo.full_name)}
                      disabled={alreadyImported}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        alreadyImported
                          ? 'bg-surface/50 border-border opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'bg-primary/10 border-primary/20'
                            : 'bg-background/50 border-border hover:bg-surface'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <Folder className="w-4 h-4 text-primary" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-text">
                          {repo.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {repo.full_name}
                        </p>
                      </div>
                      {alreadyImported && (
                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Imported
                        </span>
                      )}
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
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1 gap-2" 
                  onClick={handleImport} 
                  loading={isLoading}
                  disabled={selectedRepos.length === 0}
                >
                  <Folder className="w-4 h-4" />
                  Import {selectedRepos.length > 0 ? `(${selectedRepos.length})` : ''}
                </Button>
              </div>
            </>
          )}

          {/* STEP 3: Done */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">Connected Successfully</p>
                  <p className="text-xs text-emerald-300/80">
                    {githubUsername ? `@${githubUsername}` : 'Your GitHub account is linked'}
                  </p>
                </div>
              </div>

              {importedRepos && importedRepos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text">Imported Repositories:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importedRepos.map((repo: Repo) => (
                      <div key={repo.id} className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-border">
                        <Folder className="w-4 h-4 text-primary" />
                        <span className="text-sm text-text">{repo.repo_name || repo.repo_full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Close
                </Button>
                <Button variant="danger" className="flex-1" onClick={handleDisconnect}>
                  Disconnect GitHub
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}