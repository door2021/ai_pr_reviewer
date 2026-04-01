import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Settings, ArrowLeft, Save, Loader2, Zap, Hand,
  CheckCircle, AlertCircle, User, Mail, Lock, Eye, EyeOff,
  Shield, Bell, Palette,
} from 'lucide-react';
import { usersAPI } from '@/lib/api';

type Tab = 'review' | 'profile' | 'security';

export default function Setting() {
  const navigate = useNavigate();
  const { user, updateReviewMode, loadUserProfile } = useStore();

  // ── Tab ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('review');

  // ── Review settings ──────────────────────────────────────────
  const [reviewMode, setReviewMode]   = useState<'manual' | 'automatic'>('manual');
  const [threshold, setThreshold]     = useState(85);
  const [savingReview, setSavingReview]       = useState(false);
  const [reviewSuccess, setReviewSuccess]     = useState('');
  const [reviewError, setReviewError]         = useState('');

  // ── Profile settings ─────────────────────────────────────────
  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState('');
  const [savingProfile, setSavingProfile]     = useState(false);
  const [profileSuccess, setProfileSuccess]   = useState('');
  const [profileError, setProfileError]       = useState('');

  // ── Security (password) ──────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [savingPassword, setSavingPassword]   = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError]     = useState('');

  // Populate from user on load
  useEffect(() => {
    if (user) {
      setReviewMode(user.review_mode as 'manual' | 'automatic');
      setThreshold(user.auto_merge_threshold ?? 85);
      setFullName(user.full_name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReview(true); setReviewError(''); setReviewSuccess('');
    try {
      await updateReviewMode(reviewMode, threshold);
      setReviewSuccess('Review settings saved ✓');
      setTimeout(() => setReviewSuccess(''), 3000);
    } catch (err: any) {
      setReviewError(err?.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSavingReview(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true); setProfileError(''); setProfileSuccess('');
    try {
      await usersAPI.updateProfile({ full_name: fullName });
      await loadUserProfile();
      setProfileSuccess('Profile updated ✓');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err?.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(''); setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setSavingPassword(true);
    try {
      await usersAPI.changePassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordSuccess('Password changed ✓');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.detail || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'review',   label: 'Review Mode', icon: <Shield className="w-4 h-4" /> },
    { id: 'profile',  label: 'Profile',     icon: <User   className="w-4 h-4" /> },
    { id: 'security', label: 'Security',    icon: <Lock   className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center text-text-muted hover:text-text mb-6 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-sm text-text-muted">Manage your account and review preferences</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-surface/50 border border-border rounded-xl mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Review Mode Tab ── */}
        {activeTab === 'review' && (
          <Card className="border-border/50 bg-surface/80">
            <CardHeader>
              <CardTitle className="text-white text-base">Review Mode</CardTitle>
              <CardDescription>Control how AI reviews and merges your pull requests</CardDescription>
            </CardHeader>
            <CardContent>
              {reviewError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{reviewError}
                </div>
              )}
              {reviewSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />{reviewSuccess}
                </div>
              )}

              <form onSubmit={handleSaveReview} className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {/* Manual */}
                  <button type="button" onClick={() => setReviewMode('manual')}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      reviewMode === 'manual'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-border/80 bg-background/30'
                    }`}>
                    <Hand className={`w-6 h-6 mb-2 ${reviewMode === 'manual' ? 'text-primary' : 'text-text-muted'}`} />
                    <p className="font-medium text-sm text-white">Manual</p>
                    <p className="text-xs text-text-muted mt-1">You review and decide when to merge.</p>
                  </button>

                  {/* Auto */}
                  <button type="button" onClick={() => setReviewMode('automatic')}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      reviewMode === 'automatic'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-border hover:border-border/80 bg-background/30'
                    }`}>
                    <Zap className={`w-6 h-6 mb-2 ${reviewMode === 'automatic' ? 'text-purple-400' : 'text-text-muted'}`} />
                    <p className="font-medium text-sm text-white">Automatic</p>
                    <p className="text-xs text-text-muted mt-1">AI reviews and merges PRs automatically.</p>
                  </button>
                </div>

                {reviewMode === 'automatic' && (
                  <div className="space-y-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-text">Auto-merge Safety Threshold</label>
                      <span className={`text-sm font-bold ${
                        threshold >= 85 ? 'text-emerald-400' : threshold >= 70 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{threshold}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={threshold}
                      onChange={e => setThreshold(Number(e.target.value))}
                      className="w-full accent-purple-500" />
                    <div className="flex justify-between text-xs text-text-muted">
                      <span>Permissive (0%)</span>
                      <span>Strict (100%)</span>
                    </div>
                    <p className="text-xs text-purple-300">
                      PRs with AI safety score ≥ {threshold}% will be auto-merged.
                      {threshold < 70 && <span className="text-yellow-400 ml-1">⚠ Low threshold — use carefully.</span>}
                    </p>
                  </div>
                )}

                <Button type="submit" className="w-full gap-2" disabled={savingReview}>
                  {savingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingReview ? 'Saving…' : 'Save Review Settings'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          <Card className="border-border/50 bg-surface/80">
            <CardHeader>
              <CardTitle className="text-white text-base">Profile</CardTitle>
              <CardDescription>Update your display name and account info</CardDescription>
            </CardHeader>
            <CardContent>
              {profileError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />{profileSuccess}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Avatar preview */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-background/50 border border-border">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
                    {(fullName || user?.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{fullName || 'No name set'}</p>
                    <p className="text-xs text-text-muted">{user?.email}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>

                {/* Full name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-text-muted" /> Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-background/70 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>

                {/* Email — read-only, shown for reference */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted" /> Email
                    <span className="text-xs text-text-muted font-normal">(cannot be changed here)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full bg-background/30 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-text-muted cursor-not-allowed"
                  />
                </div>

                <Button type="submit" className="w-full gap-2" disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingProfile ? 'Saving…' : 'Save Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Security Tab ── */}
        {activeTab === 'security' && (
          <Card className="border-border/50 bg-surface/80">
            <CardHeader>
              <CardTitle className="text-white text-base">Security</CardTitle>
              <CardDescription>Change your password</CardDescription>
            </CardHeader>
            <CardContent>
              {passwordError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />{passwordSuccess}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                {/* Current password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      className="w-full bg-background/70 border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button type="button" onClick={() => setShowCurrent(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">New Password</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      className="w-full bg-background/70 border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button type="button" onClick={() => setShowNew(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Strength indicator */}
                  {newPassword && (
                    <div className="flex gap-1 mt-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                          newPassword.length >= i * 3
                            ? newPassword.length >= 12 ? 'bg-emerald-400'
                              : newPassword.length >= 8 ? 'bg-yellow-400'
                              : 'bg-red-400'
                            : 'bg-border'
                        }`} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    className={`w-full bg-background/70 border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-500/50'
                        : 'border-border'
                    }`}
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-xs text-red-400">Passwords do not match</p>
                  )}
                </div>

                <Button type="submit" className="w-full gap-2" disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {savingPassword ? 'Changing…' : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}