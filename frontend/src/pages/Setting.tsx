import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Settings, ArrowLeft, Save, Loader2, Zap, Hand } from 'lucide-react';

export default function Setting() {
  const navigate = useNavigate();
  const { user, loadUserProfile } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState<'manual' | 'automatic'>('manual');
  const [threshold, setThreshold] = useState(85);

  useEffect(() => {
    if (user) {
      setReviewMode(user.review_mode as 'manual' | 'automatic');
      setThreshold(user.auto_merge_threshold);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Call API to update settings
      // For now, just update local state
      await loadUserProfile();
      alert('Settings saved successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to update settings:', error);
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
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Review Mode */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-text">Review Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewMode('manual')}
                    className={`p-4 rounded-lg border transition-all ${
                      reviewMode === 'manual'
                        ? 'bg-primary/10 border-primary/20'
                        : 'bg-background/50 border-border hover:bg-surface'
                    }`}
                  >
                    <Hand className="w-6 h-6 text-text mb-2" />
                    <p className="text-sm font-medium text-text">Manual</p>
                    <p className="text-xs text-text-muted mt-1">
                      You review and decide
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewMode('automatic')}
                    className={`p-4 rounded-lg border transition-all ${
                      reviewMode === 'automatic'
                        ? 'bg-primary/10 border-primary/20'
                        : 'bg-background/50 border-border hover:bg-surface'
                    }`}
                  >
                    <Zap className="w-6 h-6 text-text mb-2" />
                    <p className="text-sm font-medium text-text">Automatic</p>
                    <p className="text-xs text-text-muted mt-1">
                      AI auto-merges if safe
                    </p>
                  </button>
                </div>
              </div>

              {/* Auto-Merge Threshold */}
              {reviewMode === 'automatic' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-text">
                    Auto-Merge Safety Threshold: {threshold}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>0% (Lenient)</span>
                    <span>50%</span>
                    <span>100% (Strict)</span>
                  </div>
                  <p className="text-xs text-text-muted">
                    PRs with safety score above {threshold}% will be auto-merged
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" loading={isLoading}>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}