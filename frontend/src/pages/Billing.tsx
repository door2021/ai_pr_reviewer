import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft, CheckCircle, Zap, Star, Crown, Loader2,
  CreditCard, AlertCircle, Shield, ExternalLink,
} from 'lucide-react';
import { billingAPI } from '@/lib/api';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Get started — no credit card needed',
    icon: <Shield className="w-5 h-5" />,
    color: 'border-border',
    highlight: false,
    features: [
      '10 PR reviews / month',
      '1 repository',
      'Basic AI code review',
      'Approve & merge from dashboard',
    ],
    cta: 'Current Plan',
    ctaDisabled: true,
  },
  {
    id: 'solo',
    name: 'Solo',
    price: '$9',
    period: '/month',
    description: 'For individual developers',
    icon: <Zap className="w-5 h-5" />,
    color: 'border-primary',
    highlight: false,
    features: [
      'Unlimited PR reviews',
      '5 repositories',
      'AI PR descriptions',
      'Review history (30 days)',
      'Comment on PRs',
    ],
    cta: 'Get Solo',
    ctaDisabled: false,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$29',
    period: '/month',
    description: 'For dev teams — most popular',
    icon: <Star className="w-5 h-5" />,
    color: 'border-purple-500',
    highlight: true,
    features: [
      'Everything in Solo',
      'Unlimited repositories',
      'Team rules engine (.yaml config)',
      'Slack / Teams notifications',
      'Code quality trends dashboard',
      '5 seats included',
    ],
    cta: 'Get Team',
    ctaDisabled: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$59',
    period: '/month',
    description: 'For security-focused teams',
    icon: <Crown className="w-5 h-5" />,
    color: 'border-yellow-500',
    highlight: false,
    features: [
      'Everything in Team',
      'Security review mode (OWASP)',
      'Multi-model consensus reviews',
      'Jira / Linear auto-issue creation',
      'Unlimited seats',
      'Priority support',
    ],
    cta: 'Get Pro',
    ctaDisabled: false,
  },
];

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useStore();

  const [subscription, setSubscription]     = useState<any>(null);
  const [loadingPlan, setLoadingPlan]       = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal]   = useState(false);
  const [loadingSub, setLoadingSub]         = useState(true);
  const [error, setError]                   = useState('');
  const [successMsg, setSuccessMsg]         = useState('');

  // Handle return from Stripe Checkout
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      setSuccessMsg('🎉 Subscription activated! Welcome to your new plan.');
    }
  }, [searchParams]);

  // Load current subscription
  useEffect(() => {
    billingAPI.getSubscription()
      .then(setSubscription)
      .catch(() => setSubscription({ plan: 'free', status: 'active' }))
      .finally(() => setLoadingSub(false));
  }, []);

  const currentPlan = subscription?.plan || 'free';

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return;
    setLoadingPlan(planId);
    setError('');
    try {
      const origin = window.location.origin;
      const { checkout_url } = await billingAPI.createCheckout({
        plan: planId,
        success_url: `${origin}/billing`,
        cancel_url: `${origin}/billing`,
      });
      window.location.href = checkout_url;
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to start checkout');
      setLoadingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    setError('');
    try {
      const origin = window.location.origin;
      const { portal_url } = await billingAPI.createPortal({
        return_url: `${origin}/billing`,
      });
      window.location.href = portal_url;
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to open billing portal');
      setLoadingPortal(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Back */}
        <button onClick={() => navigate('/dashboard')}
          className="inline-flex items-center text-text-muted hover:text-text mb-6 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-text-muted text-base max-w-xl mx-auto">
            Start free. Upgrade when your team needs more.
            No hidden fees, cancel anytime from the billing portal.
          </p>
        </div>

        {/* Banners */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Current subscription status bar */}
        {!loadingSub && subscription && currentPlan !== 'free' && (
          <div className="mb-6 p-4 rounded-xl bg-surface/80 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-text">
                <span className="text-white font-medium capitalize">{currentPlan}</span> plan
                {subscription.status === 'trialing' && <span className="text-yellow-400 ml-2">(trial)</span>}
                {subscription.cancel_at_period_end && (
                  <span className="text-yellow-400 ml-2">· Cancels at period end</span>
                )}
              </span>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleManageBilling} disabled={loadingPortal}>
              {loadingPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Manage Billing
            </Button>
          </div>
        )}

        {/* Plans grid */}
        {loadingSub ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map(plan => {
              const isCurrentPlan = plan.id === currentPlan;
              const isLoading = loadingPlan === plan.id;

              return (
                <div key={plan.id} className={`relative flex flex-col rounded-2xl border p-5 bg-surface/80 transition-all ${
                  plan.highlight
                    ? 'border-purple-500 shadow-lg shadow-purple-500/10'
                    : plan.color
                }`}>
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-500 text-white text-xs font-semibold">
                      Most Popular
                    </div>
                  )}

                  {/* Plan header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      plan.id === 'free' ? 'bg-border/50 text-text-muted'
                      : plan.id === 'solo' ? 'bg-primary/10 text-primary'
                      : plan.id === 'team' ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {plan.icon}
                    </div>
                    <span className="font-semibold text-white">{plan.name}</span>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-text-muted text-sm">{plan.period}</span>
                  </div>
                  <p className="text-xs text-text-muted mb-4">{plan.description}</p>

                  {/* Features */}
                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-text">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Button
                    variant={isCurrentPlan ? 'outline' : plan.highlight ? 'primary' : 'outline'}
                    size="sm"
                    className="w-full gap-2"
                    disabled={isCurrentPlan || isLoading || plan.ctaDisabled}
                    onClick={() => !isCurrentPlan && handleUpgrade(plan.id)}
                  >
                    {isLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                      : isCurrentPlan
                      ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Current Plan</>
                      : <><CreditCard className="w-3.5 h-3.5" /> {plan.cta}</>
                    }
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* FAQ / trust section */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Cancel anytime', body: 'No contracts, no lock-in. Cancel from the billing portal in seconds.' },
            { title: 'Test cards welcome', body: 'Use 4242 4242 4242 4242 with any future date to test the checkout flow.' },
            { title: 'Secure payments', body: 'Powered by Stripe. We never see or store your card details.' },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-xl bg-surface/40 border border-border/50">
              <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
              <p className="text-xs text-text-muted leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}