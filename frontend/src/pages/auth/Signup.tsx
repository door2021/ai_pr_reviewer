import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import { AuthLogo } from './AuthLogo';

export default function Signup() {
  const navigate = useNavigate();
  const { signup, isLoading, error, setError } = useStore();

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!name.trim())                   { setLocalError('Name is required'); return; }
    if (!email)                          { setLocalError('Email is required'); return; }
    if (password.length < 8)            { setLocalError('Password must be at least 8 characters'); return; }
    if (password !== confirm)            { setLocalError('Passwords do not match'); return; }

    try {
      await signup(email, password, name);
      navigate('/login', { state: { message: 'Account created! Please sign in.' } });
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || 'Signup failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <AuthLogo />

        <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl">
          <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
          <p className="text-sm text-text-muted mb-6">Start reviewing PRs with AI — free to start</p>

          {localError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {localError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="John Doe" required
                  className="w-full pl-10 pr-4 py-2.5 bg-background/70 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com" required
                  className="w-full pl-10 pr-4 py-2.5 bg-background/70 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters" required minLength={8}
                  className="w-full pl-10 pr-4 py-2.5 bg-background/70 border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
            </div>

            {/* Confirm */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" required
                  className={`w-full pl-10 pr-4 py-2.5 bg-background/70 border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50 ${
                    confirm && confirm !== password ? 'border-red-500/50' : 'border-border'
                  }`} />
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-400">Passwords do not match</p>
              )}
            </div>

            <button type="submit" disabled={isLoading || (!!confirm && confirm !== password)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg gradient-primary text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}