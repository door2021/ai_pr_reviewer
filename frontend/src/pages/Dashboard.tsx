import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import { Button } from '@/components/ui/Button';
import {
  GitPullRequest, Sparkles, Loader2, GitBranch, ArrowRight,
  CheckCircle, AlertCircle, GitMerge, ChevronDown, ChevronRight,
  Zap, Hand, Send, X, MessageSquare, FileCode, FilePlus,
  FileMinus, FileEdit, FileText, Copy, ClipboardCheck,
} from 'lucide-react';
import { githubAPI, reviewsAPI } from '@/lib/api';
import DebtTab from '@/components/DebtTab';
import { createPortal } from 'react-dom';

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

interface PRDescription {
  title: string;
  summary: string;
  changes: string[];
  testing: string;
  notes: string;
}

function PRDescriptionModal({
  prFiles,
  prNumber,
  onClose,
}: {
  prFiles: any[];
  prNumber: number;
  onClose: () => void;
}) {
  const [loading, setLoading]       = useState(false);
  const [desc, setDesc]             = useState<PRDescription | null>(null);
  const [error, setError]           = useState('');
  const [copied, setCopied]         = useState<string | null>(null);

  const generate = async () => {
    if (prFiles.length === 0) { setError('No file diff loaded yet.'); return; }
    setLoading(true); setError(''); setDesc(null);

    // Build a combined diff from all loaded files
    const combinedDiff = prFiles
      .filter(f => f.patch)
      .map(f => `--- ${f.filename} (${f.status})\n${f.patch}`)
      .join('\n\n');

    try {
      const result = await reviewsAPI.generateDescription(combinedDiff);
      setDesc(result);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to generate description');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = async () => {
    if (!desc) return;
    const md = [
      `## ${desc.title}`,
      '',
      `### Summary`,
      desc.summary,
      '',
      `### Changes`,
      ...desc.changes.map(c => `- ${c}`),
      '',
      `### Testing`,
      desc.testing,
      ...(desc.notes ? ['', `### Notes`, desc.notes] : []),
    ].join('\n');
    copyText(md, 'all');
  };

  // Generate immediately on open if files are ready
  useEffect(() => { generate(); }, []);

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copyText(text, id)}
      className="p-1 rounded text-text-muted hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied === id
        ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-white text-sm">AI PR Description</h2>
            <p className="text-xs text-text-muted">PR #{prNumber} · Generated from diff</p>
          </div>
          <div className="flex items-center gap-2">
            {desc && (
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                {copied === 'all'
                  ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</>
                  : <><Copy className="w-3.5 h-3.5" /> Copy all as Markdown</>
                }
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Sparkles className="w-5 h-5 text-primary absolute inset-0 m-auto" />
              </div>
              <div className="text-center">
                <p className="text-sm text-white font-medium">Generating description…</p>
                <p className="text-xs text-text-muted mt-1">AI is reading your diff</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={generate} className="ml-auto text-xs underline hover:no-underline">Retry</button>
            </div>
          )}

          {/* Result */}
          {desc && !loading && (
            <>
              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Title</label>
                  <CopyBtn text={desc.title} id="title" />
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-sm text-white font-medium">{desc.title}</p>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Summary</label>
                  <CopyBtn text={desc.summary} id="summary" />
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-sm text-text leading-relaxed">{desc.summary}</p>
                </div>
              </div>

              {/* Changes */}
              {desc.changes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Changes</label>
                    <CopyBtn text={desc.changes.map(c => `- ${c}`).join('\n')} id="changes" />
                  </div>
                  <div className="p-3 rounded-xl bg-background/60 border border-border space-y-1.5">
                    {desc.changes.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-text">
                        <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                        <span className="leading-relaxed">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Testing */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">How to Test</label>
                  <CopyBtn text={desc.testing} id="testing" />
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-sm text-text leading-relaxed">{desc.testing}</p>
                </div>
              </div>

              {/* Notes */}
              {desc.notes && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Notes</label>
                    <CopyBtn text={desc.notes} id="notes" />
                  </div>
                  <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                    <p className="text-sm text-yellow-200 leading-relaxed">{desc.notes}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-text-muted">
            {desc ? 'Copy individual sections or all at once as Markdown' : 'Paste directly into your GitHub PR description'}
          </p>
          {!loading && (
            <button
              onClick={generate}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [installedBanner, setInstalledBanner] = useState(
    searchParams.get('installed') === 'true'
  );
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
  const [showDescModal, setShowDescModal] = useState(false);
  const [zeroNoise, setZeroNoise]         = useState(false);
  const [activeTab, setActiveTab]         = useState<'prs' | 'debt'>('prs');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const isAutoMode   = reviewMode === 'automatic';
  // After approve OR merge lock comments and review
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
  useEffect(() => { setSuccessMsg(''); setComment(''); setShowDescModal(false); setZeroNoise(false); }, [selectedPR?.id]);
  useEffect(() => { setActiveTab('prs'); }, [selectedRepo?.id]);

  useEffect(() => {
    if (!selectedPR || !isAutoMode) return;

    const existing = useStore.getState().currentReview;
    if (existing && existing.status !== 'processing') return;

    githubAPI.triggerAutoReview(selectedPR.id).catch(() => {
    });

    let stopped = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    // Use a ref-like object so clearInterval always has the right id
    const timer = { id: null as ReturnType<typeof setInterval> | null };

    const stopPolling = () => {
      stopped = true;
      if (timer.id !== null) {
        clearInterval(timer.id);
        timer.id = null;
      }
    };

    const poll = async () => {
      if (stopped) return;
      attempts++;

      // Check store first — review may have been set by a previous tick
      const storeReview = useStore.getState().currentReview;
      if (storeReview && storeReview.status !== 'processing') {
        stopPolling();
        return;
      }

      try {
        const reviews = await reviewsAPI.getAll();
        const match = reviews.find((r: any) =>
          r.pr_number === selectedPR.pr_number &&
          r.repo_full_name === selectedRepo?.repo_full_name
        );
        if (match) {
          useStore.getState().setCurrentReview(match);
          if (match.original_code || match.reviewed_code) {
            useStore.getState().setCode(
              match.original_code || '',
              match.reviewed_code || ''
            );
          }
          if (match.status !== 'processing') {
            stopPolling();
            return;
          }
        }
      } catch {}

      if (attempts >= MAX_ATTEMPTS) stopPolling();
    };

    // Start: first poll after 1.5s, then every 3s
    const initialTimer = setTimeout(() => {
      poll();
      timer.id = setInterval(poll, 3000);
    }, 1500);

    return () => {
      stopped = true;
      clearTimeout(initialTimer);
      if (timer.id !== null) clearInterval(timer.id);
    };
  }, [selectedPR?.id, isAutoMode]);

  const closePR = () => {
    selectPR(null);
    setPRFiles([]);
  };

  const handleApprove = async () => {
    setIsApproving(true); setError(null);
    try {
      await approvePR('Approved via DeepReviewAI');
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
    <>
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/*  Header */}
        <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <GitPullRequest className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="font-semibold text-white truncate">
              {selectedPR
                ? `${selectedRepo?.repo_full_name} / PR #${selectedPR.pr_number} — ${selectedPR.title}`
                : selectedRepo
                ? selectedRepo.repo_full_name
                : 'Select a repository'}
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
                {/* Generate Description only useful before review exists */}
                {!currentReview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-dashed"
                    onClick={() => setShowDescModal(true)}
                    disabled={prFiles.length === 0 || loadingFiles}
                    title={prFiles.length === 0 ? 'Wait for files to load' : 'Generate AI PR description'}
                  >
                    <FileText className="w-3.5 h-3.5 text-text-muted" />
                    <span className="hidden sm:inline">PR Description</span>
                  </Button>
                )}

                {/* Review manual mode: user clicks; auto mode: show status */}
                {isAutoMode ? (
                  // Auto mode show review status instead of button
                  currentReview?.status === 'processing' || isReviewing ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Auto-reviewing…
                    </div>
                  ) : currentReview?.status === 'completed' || currentReview?.status === 'auto_merged' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-reviewed ✓
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Auto-reviewing…
                    </div>
                  )
                ) : (
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

                {/* Approve always visible, becomes badge once clicked */}
                {prApproved ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium select-none">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approved ✓
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={handleApprove}
                    disabled={isApproving}
                    title={isAutoMode && !currentReview ? 'Review in progress — you can still approve' : ''}>
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

        {/* Banners */}
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

        {/* Auto mode merge recommendation banner */}
        {isAutoMode && currentReview?.status === 'completed' && currentReview?.safety_score !== undefined && (
          <div className={`mx-6 mt-3 p-3 rounded-lg border text-sm flex items-center gap-2 flex-shrink-0 ${
            currentReview.safety_score >= 80
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : currentReview.safety_score >= 60
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {currentReview.safety_score >= 80
              ? <><CheckCircle className="w-4 h-4 flex-shrink-0" /><span><strong>Score {currentReview.safety_score}/100 — Safe to merge.</strong> AI reviewed and posted a comment on GitHub. You can now approve and merge.</span></>
              : currentReview.safety_score >= 60
              ? <><AlertCircle className="w-4 h-4 flex-shrink-0" /><span><strong>Score {currentReview.safety_score}/100 — Review needed.</strong> AI found issues and commented on GitHub. Check before merging.</span></>
              : <><AlertCircle className="w-4 h-4 flex-shrink-0" /><span><strong>Score {currentReview.safety_score}/100 — Do not merge.</strong> AI found critical issues and commented on GitHub. Fix before merging.</span></>
            }
          </div>
        )}
        {installedBanner && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>GitHub App installed!</strong> Your repos will appear in the sidebar automatically.
                Open a PR to start reviewing.
              </span>
            </div>
            <button onClick={() => setInstalledBanner(false)} className="ml-4 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Empty state no PR selected */}
        {!selectedPR ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab bar only shown when a repo is selected */}
            {selectedRepo ? (
              <>
                <div className="flex items-center gap-1 px-6 pt-4 border-b border-border flex-shrink-0">
                  <button
                    onClick={() => setActiveTab('prs')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                      activeTab === 'prs'
                        ? 'text-white border-primary'
                        : 'text-text-muted border-transparent hover:text-text'
                    }`}
                  >
                    Pull Requests
                  </button>
                  <button
                    onClick={() => setActiveTab('debt')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                      activeTab === 'debt'
                        ? 'text-white border-primary'
                        : 'text-text-muted border-transparent hover:text-text'
                    }`}
                  >
                    ⚡ Tech Debt
                  </button>
                </div>

                {activeTab === 'debt' ? (
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <DebtTab repoId={selectedRepo.id} />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center max-w-sm px-4">
                      <p className="text-text-muted text-sm">Select a pull request from the sidebar to start reviewing.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* No repo selected at all */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm px-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-6 shadow-lg">
                    <img src="/logo.png" alt="DeepReview" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">No PR Selected</h2>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Select a pull request from the sidebar to view its changed files and start reviewing.
                    Import a GitHub repo first if you haven't already.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* PR meta bar */}
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

            {/* Changed files */}
            <div className="flex-1 overflow-y-auto px-6 pt-3 pb-2 min-h-0">

              {/* AI Review Results panel shown when review exists OR auto mode is active */}
              {(currentReview || isAutoMode) && (
                <div className={`mb-4 rounded-xl border overflow-hidden ${
                  !currentReview || currentReview.status === 'processing'
                    ? 'border-yellow-500/20 bg-yellow-500/5'
                    : currentReview.status === 'failed'
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-primary/20 bg-primary/5'
                }`}>
                  {/* Panel header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                    {!currentReview || currentReview.status === 'processing' ? (
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
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
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
                        {/* Zero Noise toggle */}
                        <button
                          onClick={() => setZeroNoise(z => !z)}
                          title={zeroNoise ? 'Showing top 3 critical issues only — click for full review' : 'Click for Zero Noise mode (top 3 critical only)'}
                          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                            zeroNoise
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : 'bg-surface text-text-muted border-border hover:border-primary/30 hover:text-text'
                          }`}
                        >
                          {zeroNoise ? '⚡ Zero Noise' : '≡ Full Review'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Panel body only shown when completed */}
                  {currentReview && currentReview.status !== 'processing' && currentReview.ai_feedback && (
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
                          {/* Header row */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                              {zeroNoise
                                ? `Top Critical Issues (${Math.min(currentReview.ai_feedback.issues.filter((i: any) => i.severity === 'high').length, 3)} of ${currentReview.ai_feedback.issues.length})`
                                : `Issues (${currentReview.ai_feedback.issues.length})`
                              }
                            </p>
                            {zeroNoise && currentReview.ai_feedback.issues.length > 3 && (
                              <button
                                onClick={() => setZeroNoise(false)}
                                className="text-xs text-primary hover:underline"
                              >
                                Show all {currentReview.ai_feedback.issues.length} issues
                              </button>
                            )}
                          </div>

                          {/* Issue cards filtered in Zero Noise mode */}
                          {(zeroNoise
                            ? currentReview.ai_feedback.issues
                                .filter((i: any) => i.severity === 'high')
                                .slice(0, 3)
                            : currentReview.ai_feedback.issues
                          ).map((issue: any, i: number) => (
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

                          {/* Zero Noise no high severity issues fallback */}
                          {zeroNoise && currentReview.ai_feedback.issues.filter((i: any) => i.severity === 'high').length === 0 && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-xs text-emerald-400">
                              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              No critical issues found — this PR looks safe to merge.
                            </div>
                          )}
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

            {/* Comment box */}
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

    {/* PR Description Modal rendered via portal outside sidebar */}
    {showDescModal && selectedPR && (
      <PRDescriptionModal
        prFiles={prFiles}
        prNumber={selectedPR.pr_number}
        onClose={() => setShowDescModal(false)}
      />
    )}
    </>
  );
}