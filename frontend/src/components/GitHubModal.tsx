import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { X, Github, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GitHubModal({ isOpen, onClose }: GitHubModalProps) {
  const { githubConfigured, connectGitHub, disconnectGitHub, isLoading, error } = useStore();
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState('');

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!token.trim()) {
      setLocalError('Token is required');
      return;
    }
    try {
      await connectGitHub(token);
      setToken('');
      setLocalError('');
      onClose();
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGitHub();
      onClose();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full max-w-lg border-border/50 backdrop-blur-xl bg-surface/90 shadow-2xl">
        <div className="absolute right-4 top-4">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <CardHeader>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center mb-4">
            <Github className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl text-white">Connect GitHub</CardTitle>
          <CardDescription>
            Import pull requests and repositories from your GitHub account
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {(error || localError) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error || localError}
            </div>
          )}

          {!githubConfigured ? (
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
                  Connect Repository
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">Connected Successfully</p>
                  <p className="text-xs text-emerald-300/80">Your GitHub account is linked</p>
                </div>
              </div>

              <Button variant="danger" className="w-full" onClick={handleDisconnect}>
                Disconnect GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}