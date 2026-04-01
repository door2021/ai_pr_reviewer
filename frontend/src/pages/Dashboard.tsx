import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import { Button } from '@/components/ui/Button';
import {
  GitPullRequest, Sparkles, Loader2, GitBranch, ArrowRight,
  CheckCircle, AlertCircle, GitMerge, ChevronDown, ChevronRight,
  Zap, Hand, Send, X, MessageSquare, FileCode, FilePlus,
  FileMinus, FileEdit,
} from 'lucide-react';
import { githubAPI } from '@/lib/api';

// ── Diff renderer ─────────────────────────────────────────────
function DiffContent({ patch }: { patch: string }) {
  if (!patch) return <p className="text-xs text-text-muted px-4 py-3 italic">No diff available for this file</p>;
  const lines = patch.split('\n');
  return (
    <div className="font-mono text-xs overflow-x-auto">
      {lines.map((line, i) => {
        let bg = '', color = 'text-text-muted';
        if (line.startsWith('+') && !line.startsWith('+++')) { bg = 'bg-emerald-500/10'; color = 'text-emerald-400'; }
        else if (line.startsWith('-') && !line.startsWith('---')) { bg = 'bg-red-500/10'; color = 'text-red-400'; }
        else if (line.startsWith('@@')) { bg = 'bg-blue-500/8'; color = 'text-blue-400'; }
        return (
          <div key={i} className={`flex ${bg} px-4 py-0.5`}>
            <span className="w-6 text-text-muted/40 select-none flex-shrink-0">{i + 1}</span>
            <span className={`${color} whitespace-pre flex-1`}>{line || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

function FileRow({ file }: { file: any }) {
  const [open, setOpen] = useState(true);
  const icon = () => {
    if (file.status === 'added')   return <FilePlus  className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    if (file.status === 'removed') return <FileMinus className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    if (file.status === 'renamed') return <FileEdit  className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
    return <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  };
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-surface/80 hover:bg-surface transition-colors text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
               : <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
        {icon()}
        <span className="text-xs font-mono text-text flex-1 truncate">{file.filename}</span>
        {file.status === 'renamed' && file.previous_filename && (
          <span className="text-xs text-text-muted hidden sm:block truncate max-w-[180px]">← {file.previous_filename}</span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {file.additions > 0 && <span className="text-xs text-emerald-400 font-mono">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-xs text-red-400 font-mono">-{file.deletions}</span>}
        </div>
      </button>
      {open && <div className="border-t border-border bg-background/40"><DiffContent patch={file.patch} /></div>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    selectedAccount, selectedRepo, selectedPR,
    currentReview, reviewMode, error,
    setError, startReview, mergePR, approvePR, submitComment,
    isReviewing, prApproved, prMerged, selectPR,
  } = useStore();

  const [comment, setComment]             = useState('');
  const [isCommenting, setIsCommenting]   = useState(false);
  const [isMerging, setIsMerging]         = useState(false);
  const [isApproving, setIsApproving]     = useState(false);
  const [mergeMethod, setMergeMethod]     = useState<'squash'|'merge'|'rebase'>('squash');
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [successMsg, setSuccessMsg]       = useState('');
  const [prFiles, setPRFiles]             = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles]   = useState(false);
  const [filesError, setFilesError]       = useState('');
  const [expandKey, setExpandKey]         = useState(0);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const isAutoMode   = reviewMode === 'automatic';
  // After approve OR merge — lock comments and review
  const actionsLocked = prApproved || prMerged;

  // Load files when PR changes
  useEffect(() => {
    if (!selectedPR) { setPRFiles([]); return; }
    setLoadingFiles(true);
    setFilesError('');
    githubAPI.getPRFiles(selectedPR.id)
      .then(d => setPRFiles(d.files || []))
      .catch(err => {
        const msg = err?.response?.data?.detail || 'Failed to load PR files';
        setFilesError(typeof msg === 'string' ? msg : 'Failed to load PR files');
      })
      .finally(() => setLoadingFiles(false));
  }, [selectedPR?.id]);

  // Clear success message when PR changes
  useEffect(() => { setSuccessMsg(''); setComment(''); }, [selectedPR?.id]);

  const closePR = () => {
    selectPR(null);
    setPRFiles([]);
  };

  const handleApprove = async () => {
    setIsApproving(true); setError(null);
    try {
      await approvePR('Approved via AI PR Reviewer');
      setSuccessMsg('PR approved on GitHub ✓');
    } catch {}
    finally { setIsApproving(false); }
  };

  const handleMerge = async () => {
    const prId = currentReview?.pr_id || selectedPR?.id;
    if (!prId) return;
    setIsMerging(true); setError(null); setShowMergeMenu(false);
    try {
      let prStatus: any = null;
      try { prStatus = await githubAPI.checkPRStatus(prId); } catch {}
      if (prStatus && !prStatus.is_open) { setError(`PR is already ${prStatus.state}.`); return; }
      if (prStatus?.mergeable === false) { setError('PR has merge conflicts.'); return; }
      await mergePR(mergeMethod);
      // Store clears selectedPR after merge — dashboard goes to empty state automatically
    } catch {}
    finally { setIsMerging(false); }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    setIsCommenting(true); setError(null);
    try {
      await submitComment(comment.trim());
      setComment('');
      setSuccessMsg('Comment posted to GitHub ✓');
      setTimeout(() => setSuccessMsg(s => s === 'Comment posted to GitHub ✓' ? '' : s), 3000);
    } catch {}
    finally { setIsCommenting(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ── */}
        <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <GitPullRequest className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="font-semibold text-white truncate">
              {selectedPR
                ? `${selectedRepo?.repo_full_name} / PR #${selectedPR.pr_number} — ${selectedPR.title}`
                : 'AI PR Reviewer'}
            </h1>
            {selectedPR && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${
                prApproved && !prMerged
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                open
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {selectedPR && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 border border-border text-xs">
                <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                <span className="font-mono text-text">{selectedPR.head_ref}</span>
                <ArrowRight className="w-3 h-3 text-text-muted" />
                <span className="font-mono text-text">{selectedPR.base_ref}</span>
              </div>
            )}

            <button onClick={() => navigate('/settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:opacity-80 ${
                isAutoMode ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                           : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}>
              {isAutoMode ? <Zap className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
              {isAutoMode ? 'Auto' : 'Manual'}
            </button>

            {selectedPR && (
              <>
                {/* Review */}
                {!isAutoMode && (
                  <Button variant="primary" size="sm" className="gap-2"
                    onClick={() => startReview()}
                    disabled={isReviewing || !!currentReview || actionsLocked}>
                    {(isReviewing || currentReview?.status === 'processing')
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : currentReview?.status === 'completed'
                      ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                      : <Sparkles className="w-4 h-4" />
                    }
                    {isReviewing ? 'Submitting…'
                      : currentReview?.status === 'processing' ? 'AI Running…'
                      : currentReview?.status === 'completed' ? 'Reviewed ✓'
                      : 'Review'
                    }
                  </Button>
                )}

                {/* Approve — becomes a static badge once clicked */}
                {prApproved ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium select-none">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approved ✓
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={handleApprove} disabled={isApproving}>
                    {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                    Approve
                  </Button>
                )}

                {/* Merge */}
                <div className="relative">
                  <div className="flex">
                    <Button variant="primary" size="sm" className="gap-2 rounded-r-none border-r border-primary/30"
                      onClick={handleMerge} disabled={isMerging}>
                      {isMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                      {isMerging ? 'Merging…' : 'Merge'}
                    </Button>
                    <Button variant="primary" size="sm" className="rounded-l-none px-2"
                      onClick={() => setShowMergeMenu(m => !m)} disabled={isMerging}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {showMergeMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                      {(['squash','merge','rebase'] as const).map(m => (
                        <button key={m} onClick={() => { setMergeMethod(m); setShowMergeMenu(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            mergeMethod === m ? 'bg-primary/10 text-primary' : 'text-text hover:bg-surface/80'
                          }`}>
                          <span className="font-medium capitalize">{m}</span>
                          <span className="block text-xs text-text-muted">
                            {m === 'squash' && 'Combine all commits'}
                            {m === 'merge'  && 'Preserve commit history'}
                            {m === 'rebase' && 'Rebase onto base branch'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Close PR view */}
                <button onClick={closePR}
                  title="Close PR view"
                  className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-surface transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Banners ── */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2 flex-shrink-0">
            <CheckCircle className="w-4 h-4" />{successMsg}
          </div>
        )}

        {/* ── Empty state — no PR selected ── */}
        {!selectedPR ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="w-20 h-20 rounded-2xl bg-surface/50 border border-border flex items-center justify-center mx-auto mb-6">
                <GitPullRequest className="w-10 h-10 text-text-muted" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">No PR Selected</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                Select a pull request from the sidebar to view its changed files and start reviewing.
                Import a GitHub repo first if you haven't already.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── PR meta bar ── */}
            <div className="mx-6 mt-3 px-4 py-2 rounded-lg bg-surface/50 border border-border flex items-center gap-4 text-xs text-text-muted flex-shrink-0 flex-wrap">
              <span><span className="text-text-muted">Author:</span> <span className="text-text">@{selectedPR.author_login || 'unknown'}</span></span>
              <span>·</span>
              <span><span className="text-text-muted">Account:</span> <span className="text-text">@{selectedAccount?.github_username}</span></span>
              {prFiles.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-text">{prFiles.length} file{prFiles.length !== 1 ? 's' : ''} changed</span>
                  <span className="text-emerald-400">+{prFiles.reduce((s,f) => s+f.additions,0)}</span>
                  <span className="text-red-400">-{prFiles.reduce((s,f) => s+f.deletions,0)}</span>
                </>
              )}
              {/* Approved indicator in meta bar */}
              {prApproved && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400 font-medium">✓ Approved</span>
                </>
              )}
              <span className="ml-auto">
                {prFiles.length > 0 && (
                  <button onClick={() => setExpandKey(k => k+1)} className="text-primary hover:underline text-xs">
                    Expand all
                  </button>
                )}
              </span>
            </div>

            {/* ── Changed files ── */}
            <div className="flex-1 overflow-y-auto px-6 pt-3 pb-2 min-h-0">

              {/* AI Review Results panel — shown when review exists */}
              {currentReview && (
                <div className={`mb-4 rounded-xl border overflow-hidden ${
                  currentReview.status === 'processing'
                    ? 'border-yellow-500/20 bg-yellow-500/5'
                    : currentReview.status === 'failed'
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-primary/20 bg-primary/5'
                }`}>
                  {/* Panel header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                    {currentReview.status === 'processing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-yellow-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-yellow-400">AI is reviewing your code…</span>
                        <span className="text-xs text-text-muted ml-auto">This takes ~15 seconds</span>
                      </>
                    ) : currentReview.status === 'failed' ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-red-400">AI Review Failed</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-white">AI Review Complete</span>
                        {/* Safety score badge */}
                        {currentReview.safety_score !== null && currentReview.safety_score !== undefined && (
                          <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            (currentReview.safety_score ?? 0) >= 80
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : (currentReview.safety_score ?? 0) >= 60
                              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            <span>Safety</span>
                            <span>{currentReview.safety_score}/100</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Panel body — only shown when completed */}
                  {currentReview.status !== 'processing' && currentReview.ai_feedback && (
                    <div className="px-4 py-3 space-y-3">
                      {/* Summary */}
                      {currentReview.ai_feedback.summary && (
                        <p className="text-sm text-text leading-relaxed">
                          {currentReview.ai_feedback.summary}
                        </p>
                      )}

                      {/* Issues */}
                      {currentReview.ai_feedback.issues && currentReview.ai_feedback.issues.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                            Issues ({currentReview.ai_feedback.issues.length})
                          </p>
                          {currentReview.ai_feedback.issues.map((issue: any, i: number) => (
                            <div key={i} className={`flex gap-2.5 p-2.5 rounded-lg text-xs ${
                              issue.severity === 'high'
                                ? 'bg-red-500/8 border border-red-500/15'
                                : issue.severity === 'medium'
                                ? 'bg-yellow-500/8 border border-yellow-500/15'
                                : 'bg-blue-500/8 border border-blue-500/15'
                            }`}>
                              <span className={`font-bold uppercase flex-shrink-0 ${
                                issue.severity === 'high' ? 'text-red-400'
                                : issue.severity === 'medium' ? 'text-yellow-400'
                                : 'text-blue-400'
                              }`}>{issue.severity}</span>
                              <div className="min-w-0">
                                <p className="text-text">{issue.message}</p>
                                {issue.suggestion && (
                                  <p className="text-text-muted mt-0.5">→ {issue.suggestion}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Suggestions */}
                      {currentReview.ai_feedback.suggestions && currentReview.ai_feedback.suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                            Suggestions
                          </p>
                          <ul className="space-y-1">
                            {currentReview.ai_feedback.suggestions.map((s: string, i: number) => (
                              <li key={i} className="text-xs text-text-muted flex gap-2">
                                <span className="text-primary flex-shrink-0">•</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Ready to merge indicator */}
                      {currentReview.ai_feedback.ready_for_merge !== undefined && (
                        <div className={`flex items-center gap-2 text-xs font-medium ${
                          currentReview.ai_feedback.ready_for_merge ? 'text-emerald-400' : 'text-yellow-400'
                        }`}>
                          {currentReview.ai_feedback.ready_for_merge
                            ? <><CheckCircle className="w-3.5 h-3.5" /> Ready to merge</>
                            : <><AlertCircle className="w-3.5 h-3.5" /> Needs attention before merging</>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {loadingFiles ? (
                <div className="flex items-center gap-3 py-16 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-text-muted text-sm">Loading changed files…</span>
                </div>
              ) : filesError ? (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />{filesError}
                </div>
              ) : prFiles.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 justify-center text-center">
                  <FileCode className="w-8 h-8 text-text-muted" />
                  <span className="text-text-muted text-sm">No changed files found for this PR</span>
                </div>
              ) : (
                <div key={expandKey}>
                  {prFiles.map((file, i) => <FileRow key={`${file.filename}-${i}`} file={file} />)}
                </div>
              )}
            </div>

            {/* ── Comment box ── */}
            <div className="border-t border-border bg-surface/50 px-6 py-3 flex-shrink-0">
              {actionsLocked ? (
                <div className="flex items-center gap-2 py-1.5 text-text-muted text-xs">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>
                    {prMerged
                      ? 'PR has been merged — no further actions needed'
                      : 'PR has been approved — comments and further review are disabled'}
                  </span>
                </div>
              ) : (
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-xs text-text-muted">Comment on PR #{selectedPR.pr_number} → posts to GitHub</span>
                    </div>
                    <textarea ref={commentRef} value={comment}
                      onChange={e => setComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(); }}
                      placeholder="Leave a comment… (⌘/Ctrl+Enter to send)"
                      className="w-full min-h-[56px] max-h-[120px] bg-background/70 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
                      rows={2}
                    />
                  </div>
                  <Button variant="primary" size="sm" className="gap-2 mb-0.5"
                    onClick={handleComment} disabled={isCommenting || !comment.trim()}>
                    {isCommenting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}