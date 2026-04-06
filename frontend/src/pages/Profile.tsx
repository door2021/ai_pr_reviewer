import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { User, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { usersAPI } from '@/lib/api';

export default function Profile() {
  const navigate = useNavigate();
  const { user, loadUserProfile } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    avatar_url: '',
  });
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        email: user.email,
        avatar_url: user.avatar_url || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  try {
    await usersAPI.updateProfile({
      full_name: formData.full_name,
      avatar_url: formData.avatar_url || undefined,
    });
    await loadUserProfile(); // refresh store so sidebar name updates
    setSuccessMsg('Profile updated ✓');
    setTimeout(() => setSuccessMsg(''), 3000);
  } catch (error: any) {
    setError(error?.response?.data?.detail || 'Failed to update profile');
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
              <User className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Profile Settings</CardTitle>
            <CardDescription>Update your profile information</CardDescription>
          </CardHeader>

          <CardContent>
            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                ✓ {successMsg}
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
              />

              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />

              <Input
                label="Avatar URL (Optional)"
                placeholder="https://example.com/avatar.jpg"
                value={formData.avatar_url}
                onChange={(e) =>
                  setFormData({ ...formData, avatar_url: e.target.value })
                }
              />

              <Button type="submit" className="w-full" size="lg" loading={isLoading}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/settings')}
              >
                Go to Settings →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}