import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import CodePane from '@/components/CodePane';
import { Button } from '@/components/ui/Button';
import {
  GitPullRequest, Sparkles, Loader2, GitBranch,
  ArrowRight, CheckCircle, AlertCircle, MessageSquare,
  GitMerge, ChevronDown, Zap, Hand, Send, X, Info,
  RefreshCw,
} from 'lucide-react';
import { githubAPI, reviewsAPI } from '@/lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    user,
    selectedAccount,
    selectedRepo,
    selectedPR,
    currentReview,
    originalCode,
    reviewedCode,
    isReviewing,
    reviewMode,
    error,
    setError,
    setCode,
    setCurrentReview,
    startReview,
    mergePR,
    approvePR,
    submitComment,
  } = useStore();

  const [comment, setComment] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>('squash');
  const [showMergeOptions, setShowMergeOptions] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Derived state
  const hasPRSelected = !!selectedPR;
  const hasReview = !!currentReview;
  const reviewCompleted = currentReview?.status === 'completed' || currentReview?.status === 'auto_merged';
  const isAutoMode = reviewMode === 'automatic';

  // Poll for review completion when in processing state
  useEffect(() => {
    if (currentReview?.status === 'processing' && !pollingInterval) {
      const interval = setInterval(async () => {
        try {
          const updated = await reviewsAPI.getById(currentReview.id);
          if (updated.status !== 'processing') {
            setCurrentReview(updated);
            setCode(updated.original_code || '', updated.reviewed_code || '');
            clearInterval(interval);
            setPollingInterval(null);
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);
      setPollingInterval(interval);
    }
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [currentReview?.status]);

  const handleStartReview = async () => {
    try {
      await startReview();
    } catch {
      // error set in store
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      await approvePR('Approved via AI PR Reviewer');
      setActionSuccess('PR approved on GitHub ✓');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch {
      // error set in store
    } finally {
      setIsApproving(false);
    }
  };

  const handleMerge = async () => {
    // First check if PR is still open
    const prId = currentReview?.pr_id || selectedPR?.id;
    if (!prId) return;

    setIsMerging(true);
    setError(null);
    setShowMergeOptions(false);

    try {
      // Pre-merge check: is PR still open on GitHub?
      let prStatus: any = null;
      try {
        prStatus = await githubAPI.checkPRStatus(prId);
      } catch {
        // If check endpoint not available, proceed with merge
      }

      if (prStatus && !prStatus.is_open) {
        setError(`PR is already ${prStatus.state} — cannot merge.`);
        setIsMerging(false);
        return;
      }

      if (prStatus && !prStatus.mergeable) {
        setError('PR has conflicts and cannot be merged. Please resolve conflicts first.');
        setIsMerging(false);
        return;
      }

      await mergePR(mergeMethod);
      setActionSuccess(
        `PR #${currentReview?.pr_number || selectedPR?.pr_number} merged (${mergeMethod}) ✓`
      );
      setTimeout(() => setActionSuccess(''), 5000);
    } catch {
      // error set in store
    } finally {
      setIsMerging(false);
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    setIsCommenting(true);
    setError(null);
    try {
      await submitComment(comment.trim());
      setComment('');
      setCommentSuccess('Comment posted to GitHub ✓');
      setTimeout(() => setCommentSuccess(''), 3000);
    } catch {
      // error set in store
    } finally {
      setIsCommenting(false);
    }
  };

  const getStatusBadge = () => {
    if (!currentReview) return null;
    const map: Record<string, { label: string; className: string }> = {
      completed: { label: 'Reviewed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      processing: { label: 'Processing…', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
      auto_merged: { label: 'Auto-Merged', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
      merged: { label: 'Merged', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
      approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    };
    const s = map[currentReview.status] || { label: currentReview.status, className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${s.className}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Top Header ── */}
        <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 gap-4 flex-shrink-0">
          {/* Left: PR title + status */}
          <div className="flex items-center gap-3 min-w-0">
            <GitPullRequest className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="font-semibold text-white truncate">
              {selectedPR
                ? `${selectedRepo?.repo_full_name} / PR #${selectedPR.pr_number}`
                : 'Select a PR from the sidebar'}
            </h1>
            {getStatusBadge()}
          </div>

          {/* Right: Branch info + mode + actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Branch Dropdown */}
            {selectedPR && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 border border-border text-xs">
                <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-text font-mono">{selectedPR.head_ref}</span>
                <ArrowRight className="w-3 h-3 text-text-muted" />
                <span className="text-text font-mono">{selectedPR.base_ref}</span>
              </div>
            )}

            {/* Review Mode Badge */}
            <button
              onClick={() => navigate('/settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:opacity-80 ${
                isAutoMode
                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}
              title="Click to change mode in Settings"
            >
              {isAutoMode ? <Zap className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
              {isAutoMode ? 'Auto' : 'Manual'}
            </button>

            {/* Action buttons — only when PR selected */}
            {selectedPR && (
              <>
                {/* Review button (manual mode only, or if no review yet) */}
                {!isAutoMode && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-2"
                    onClick={handleStartReview}
                    disabled={isReviewing || !!currentReview}
                  >
                    {isReviewing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isReviewing ? 'Reviewing…' : currentReview ? 'Reviewed' : 'Review'}
                  </Button>
                )}

                {/* Approve */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleApprove}
                  disabled={isApproving || !selectedPR}
                >
                  {isApproving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  Approve
                </Button>

                {/* Merge with method picker */}
                <div className="relative">
                  <div className="flex">
                    <Button
                      variant="primary"
                      size="sm"
                      className="gap-2 rounded-r-none border-r border-primary/30"
                      onClick={handleMerge}
                      disabled={isMerging}
                    >
                      {isMerging ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GitMerge className="w-3.5 h-3.5" />
                      )}
                      {isMerging ? 'Merging…' : 'Merge'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="rounded-l-none px-2"
                      onClick={() => setShowMergeOptions(!showMergeOptions)}
                      disabled={isMerging}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {showMergeOptions && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                      {(['squash', 'merge', 'rebase'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setMergeMethod(m); setShowMergeOptions(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            mergeMethod === m
                              ? 'bg-primary/10 text-primary'
                              : 'text-text hover:bg-surface/80'
                          }`}
                        >
                          <span className="font-medium capitalize">{m}</span>
                          <span className="block text-xs text-text-muted">
                            {m === 'squash' && 'Combine all commits'}
                            {m === 'merge' && 'Preserve commit history'}
                            {m === 'rebase' && 'Rebase onto base branch'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── Error / Success Banners ── */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="hover:text-white ml-4">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2 flex-shrink-0">
            <CheckCircle className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* ── Auto mode info banner ── */}
        {isAutoMode && !selectedPR && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm flex items-center gap-2 flex-shrink-0">
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Auto mode active.</strong> Open PRs across all imported repos will be reviewed, commented and merged automatically based on your safety threshold.
            </span>
          </div>
        )}

        {/* ── Empty State ── */}
        {!selectedPR ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-2xl bg-surface/50 flex items-center justify-center mx-auto mb-6">
                <GitPullRequest className="w-10 h-10 text-text-muted" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">No PR Selected</h2>
              <p className="text-text-muted mb-6">
                Select a pull request from the sidebar to start reviewing.
                Import a GitHub repo first if you haven't already.
              </p>
              <Button variant="outline" onClick={() => {}}>
                <Info className="w-4 h-4 mr-2" />
                Use the sidebar to navigate
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── PR Info Bar ── */}
            <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-surface/50 border border-border flex items-center gap-4 text-xs text-text-muted flex-shrink-0">
              <span>
                <span className="text-text-muted">Repo:</span>{' '}
                <span className="text-text font-medium">{selectedRepo?.repo_full_name}</span>
              </span>
              <span>·</span>
              <span>
                <span className="text-text-muted">Author:</span>{' '}
                <span className="text-text">@{selectedPR.author_login || 'unknown'}</span>
              </span>
              <span>·</span>
              <span>
                <span className="text-text-muted">Account:</span>{' '}
                <span className="text-text">@{selectedAccount?.github_username}</span>
              </span>
              {selectedPR.additions > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400">+{selectedPR.additions}</span>
                  <span className="text-red-400">-{selectedPR.deletions}</span>
                </>
              )}
              {currentReview?.status === 'processing' && (
                <span className="ml-auto flex items-center gap-1.5 text-yellow-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI is reviewing…
                </span>
              )}
            </div>

            {/* ── Code Panes ── */}
            <div className="flex-1 flex overflow-hidden mt-3">
              <CodePane
                title="PR Code (from GitHub)"
                code={originalCode}
                language="diff"
                isEditable={false}
                showLineNumbers
              />
              <CodePane
                title={
                  isReviewing
                    ? 'Generating AI review…'
                    : currentReview?.status === 'processing'
                    ? 'Processing…'
                    : reviewCompleted
                    ? 'AI Suggestions'
                    : isAutoMode
                    ? 'Auto Review (pending)'
                    : 'AI Review (click Review to start)'
                }
                code={reviewedCode}
                language="diff"
                isReviewed={reviewCompleted}
                isEditable={false}
                showLineNumbers
                feedbackItems={currentReview?.ai_feedback?.issues}
                safetyScore={currentReview?.safety_score}
              />
            </div>

            {/* ── Comment Box (always at bottom when PR selected) ── */}
            <div className="border-t border-border bg-surface/50 px-6 py-3 flex-shrink-0">
              {commentSuccess && (
                <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {commentSuccess}
                </p>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-muted">
                      Comment on PR #{selectedPR.pr_number} → posts to GitHub
                    </span>
                  </div>
                  <textarea
                    ref={commentRef}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment();
                    }}
                    placeholder="Leave a comment on this PR… (⌘/Ctrl+Enter to send)"
                    className="w-full min-h-[60px] max-h-[120px] bg-background/70 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
                    rows={2}
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-2 mb-0.5"
                  onClick={handleComment}
                  disabled={isCommenting || !comment.trim()}
                >
                  {isCommenting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}