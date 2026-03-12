import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { X, Github, Loader2, CheckCircle, GitPullRequest } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GitHubModal({ isOpen, onClose }: GitHubModalProps) {
  const { githubConfigured, toggleGitHub } = useStore();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    toggleGitHub();
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
          {!githubConfigured ? (
            <>
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200">
                  <strong>Tip:</strong> Create a personal access token with <code className="px-1 py-0.5 rounded bg-blue-500/20">repo</code> and <code className="px-1 py-0.5 rounded bg-blue-500/20">read:org</code> scopes.
                </p>
              </div>

              <Input
                label="GitHub Personal Access Token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-2" onClick={handleConnect} loading={loading}>
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

              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Connected Repositories:</p>
                <div className="space-y-2">
                  {['ai-pr-reviewer', 'frontend-app', 'backend-api'].map((repo) => (
                    <div key={repo} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                      <GitPullRequest className="w-4 h-4 text-text-muted" />
                      <span className="text-sm text-text">{repo}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button variant="danger" className="w-full" onClick={() => { toggleGitHub(); onClose(); }}>
                Disconnect GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}