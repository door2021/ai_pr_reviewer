import { Link } from 'react-router-dom';
import { AuthLogo } from './AuthLogo';
import { Mail, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <AuthLogo />

        <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Password Reset</h1>
          <p className="text-sm text-text-muted mb-6 leading-relaxed">
            Password reset is not yet available in DeepReviewAI.
            If you need access to your account, contact us at{' '}
            <a href="mailto:support@deepreviewai.com"
               className="text-primary hover:underline">
              support@deepreviewai.com
            </a>
          </p>

          <Link to="/login"
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}