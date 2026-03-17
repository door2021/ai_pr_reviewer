import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import CodePane from '@/components/CodePane';
import CommentSection from '@/components/CommentSection';
import { Button } from '@/components/ui/Button';
import {
  GitPullRequest,
  Sparkles,
  Loader2,
  GitBranch,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { reviewsAPI, githubAPI } from '@/lib/api';

export default function Dashboard() {
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
    repoPRs,
  } = useStore();

  // Determine if this is an imported PR review
  const isImportedPR = !!currentReview?.github_account_id;
  const isReadOnly = isImportedPR;

  const handleReview = async () => {
    if (!originalCode.trim()) {
      setError('Please enter code to review');
      return;
    }

    try {
      const review = await reviewsAPI.create({
        pr_url: isImportedPR
          ? currentReview.pr_url
          : 'https://github.com/demo/pr/1',
        code_diff: originalCode,
        original_code: originalCode,
        github_account_id: isImportedPR ? currentReview.github_account_id : undefined,
        imported_repo_id: isImportedPR ? currentReview.imported_repo_id : undefined,
        pr_id: isImportedPR ? currentReview.pr_id : undefined,
        pr_number: isImportedPR ? currentReview.pr_number : undefined,
        repo_full_name: isImportedPR ? currentReview.repo_full_name : undefined,
        branch_name: isImportedPR ? currentReview.branch_name : undefined,
        target_branch: isImportedPR ? currentReview.target_branch : undefined,
        pr_title: isImportedPR ? currentReview.pr_title : undefined,
      });

      setCurrentReview(review);
      setCode(originalCode, review.reviewed_code || originalCode);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to analyze code');
    }
  };

  const handleApprove = async () => {
    if (!currentReview?.pr_id) return;
    try {
      await githubAPI.approvePR(currentReview.pr_id, 'Approved via AI PR Reviewer');
      alert('PR approved successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to approve PR');
    }
  };

  const handleMerge = async () => {
    if (!currentReview?.pr_id) return;
    if (!confirm('Are you sure you want to merge this PR?')) return;
    try {
      await githubAPI.mergePR(currentReview.pr_id, 'squash');
      alert('PR merged successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to merge PR');
    }
  };

  const handleAddComment = async (content: string, lineNumber?: number) => {
    if (!currentReview?.pr_id) return;
    try {
      await githubAPI.addPRComment(currentReview.pr_id, content, lineNumber);
      alert('Comment posted to GitHub PR!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to post comment');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              <h1 className="font-semibold text-white">
                {currentReview
                  ? isImportedPR
                    ? `${currentReview.repo_full_name}/PR #${currentReview.pr_number}`
                    : `Review #${currentReview.id}`
                  : selectedPR
                  ? `${selectedRepo?.repo_full_name}/PR #${selectedPR.number}`
                  : 'New Review'}
              </h1>
            </div>
            {currentReview && (
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  currentReview.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : currentReview.status === 'processing'
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}
              >
                {currentReview.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Branch Info (Imported PRs Only) */}
            {isImportedPR && currentReview?.branch_name && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 border border-border">
                <GitBranch className="w-4 h-4 text-text-muted" />
                <span className="text-xs text-text">{currentReview.branch_name}</span>
                <ArrowRight className="w-3 h-3 text-text-muted" />
                <span className="text-xs text-text">{currentReview.target_branch || 'main'}</span>
              </div>
            )}

            {/* Review Mode Badge */}
            <div className="px-3 py-1.5 rounded-lg bg-background/50 border border-border">
              <span className="text-xs font-medium text-text-muted">
                Mode: {reviewMode === 'manual' ? 'Manual' : 'Automatic'}
              </span>
            </div>

            {/* Action Buttons (Imported PRs Only) */}
            {isImportedPR && currentReview && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => alert('Comment feature - see below code panes')}
                >
                  <MessageSquare className="w-4 h-4" />
                  Add Comment
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  className="gap-2"
                  onClick={handleApprove}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-2"
                  onClick={handleMerge}
                >
                  <GitPullRequest className="w-4 h-4" />
                  Merge
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:text-white">×</button>
          </div>
        )}

        {/* Code Review Area */}
        <div className="flex-1 flex overflow-hidden">
          <CodePane
            title={isImportedPR ? 'PR Code (Read-Only)' : 'Original Code (Edit Here)'}
            code={originalCode}
            language="typescript"
            isEditable={!isReadOnly}
            onCodeChange={(code) => setCode(code, reviewedCode)}
            onReview={handleReview}
            isReviewing={isReviewing}
          />
          <CodePane
            title="AI Suggestions"
            code={reviewedCode}
            language="typescript"
            isReviewed={true}
            isEditable={false}
          />
        </div>

        {/* Comment Section (Imported PRs Only) */}
        {isImportedPR && (
          <CommentSection
            reviewId={currentReview?.id}
            onAddComment={handleAddComment}
          />
        )}
      </div>
    </div>
  );
}