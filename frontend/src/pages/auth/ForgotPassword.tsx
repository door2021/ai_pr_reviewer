import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 backdrop-blur-xl bg-surface/80">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
            <p className="text-text-muted mb-6">
              We've sent password reset instructions to <span className="text-text">{email}</span>
            </p>
            <Button onClick={() => setSubmitted(false)} variant="outline" className="w-full">
              Try another email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10" />
      
      <div className="w-full max-w-md relative z-10">
        <Link to="/login" className="inline-flex items-center text-text-muted hover:text-text mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to login
        </Link>

        <Card className="border-border/50 backdrop-blur-xl bg-surface/80">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-primary mb-4">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Forgot Password?</CardTitle>
            <CardDescription>
              No worries! Enter your email and we'll send you reset instructions.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                icon={<Mail className="w-5 h-5" />}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                error={error}
              />

              <Button type="submit" className="w-full" size="lg" loading={loading}>
                Send Reset Link
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}