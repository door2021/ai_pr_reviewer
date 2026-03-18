import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Settings, ArrowLeft, Save, Loader2, Zap, Hand, CheckCircle, AlertCircle,
} from 'lucide-react';

export default function Setting() {
  const navigate = useNavigate();
  const { user, updateReviewMode, setError } = useStore();

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [localError, setLocalError] = useState('');
  const [reviewMode, setReviewMode] = useState<'manual' | 'automatic'>('manual');
  const [threshold, setThreshold] = useState(85);

  useEffect(() => {
    if (user) {
      setReviewMode(user.review_mode as 'manual' | 'automatic');
      setThreshold(user.auto_merge_threshold ?? 85);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError('');
    setSuccess('');

    try {
      await updateReviewMode(reviewMode, threshold);
      setSuccess('Settings saved successfully!');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1200);
    } catch (err: any) {
      setLocalError(err.response?.data?.detail || 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center text-text-muted hover:text-text mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        <Card className="border-border/50 backdrop-blur-xl bg-surface/80">
          <CardHeader>
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Review Settings</CardTitle>
            <CardDescription>
              Configure how AI reviews and merges your PRs
            </CardDescription>
          </CardHeader>

          <CardContent>
            {localError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {localError}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Review Mode */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-text">Review Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Manual */}
                  <button
                    type="button"
                    onClick={() => setReviewMode('manual')}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      reviewMode === 'manual'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-border/80 bg-background/30'
                    }`}
                  >
                    <Hand className={`w-6 h-6 mb-2 ${reviewMode === 'manual' ? 'text-primary' : 'text-text-muted'}`} />
                    <p className="font-medium text-sm text-white">Manual</p>
                    <p className="text-xs text-text-muted mt-1">
                      You click Review, then decide to approve or merge.
                    </p>
                  </button>

                  {/* Auto */}
                  <button
                    type="button"
                    onClick={() => setReviewMode('automatic')}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      reviewMode === 'automatic'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-border hover:border-border/80 bg-background/30'
                    }`}
                  >
                    <Zap className={`w-6 h-6 mb-2 ${reviewMode === 'automatic' ? 'text-purple-400' : 'text-text-muted'}`} />
                    <p className="font-medium text-sm text-white">Automatic</p>
                    <p className="text-xs text-text-muted mt-1">
                      AI reviews, comments and merges open PRs automatically.
                    </p>
                  </button>
                </div>
              </div>

              {/* Auto-merge Threshold (only shown for auto mode) */}
              {reviewMode === 'automatic' && (
                <div className="space-y-3 p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text">
                      Auto-merge Safety Threshold
                    </label>
                    <span className={`text-sm font-bold ${
                      threshold >= 85 ? 'text-emerald-400' : threshold >= 70 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {threshold}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>Permissive (0%)</span>
                    <span>Strict (100%)</span>
                  </div>
                  <p className="text-xs text-purple-300">
                    PRs with AI safety score ≥ {threshold}% will be auto-merged.
                    {threshold < 70 && (
                      <span className="text-yellow-400 ml-1">⚠ Low threshold — review carefully.</span>
                    )}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isLoading ? 'Saving…' : 'Save Settings'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}