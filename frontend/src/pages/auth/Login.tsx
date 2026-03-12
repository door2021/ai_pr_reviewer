import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Mail, Lock, Github, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    login({ id: '1', name: 'Developer', email: formData.email });
    setLoading(false);
    navigate('/dashboard');
  };

  const handleGitHubLogin = () => {
    // Implement GitHub OAuth
    console.log('GitHub login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4 shadow-2xl shadow-blue-500/25">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-text-muted">Sign in to your account to continue</p>
        </div>

        <Card className="border-border/50 backdrop-blur-xl bg-surface/80">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                icon={<Mail className="w-5 h-5" />}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={errors.email}
              />

              <div className="space-y-2">
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-5 h-5" />}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={errors.password}
                />
                <div className="flex justify-end">
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={loading}>
                Sign In
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-text-muted">Or continue with</span>
              </div>
            </div>

            <Button 
              variant="secondary" 
              className="w-full" 
              onClick={handleGitHubLogin}
            >
              <Github className="mr-2 h-5 w-5" />
              Sign in with GitHub
            </Button>
          </CardContent>
        </Card>

        <p className="text-center mt-6 text-text-muted">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}