import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import CodePane from '@/components/CodePane';
import GitHubModal from '@/components/GitHubModal';
import { Button } from '@/components/ui/Button';
import {
  Zap, CheckCircle, AlertCircle, Send, Code2,
  GitPullRequest, Sparkles, Loader2
} from 'lucide-react';
import { reviewsAPI } from '@/lib/api';

export default function Dashboard() {
  const {
    reviewMode, toggleMode, originalCode, reviewedCode,
    setCode, currentReview, setCurrentReview,
    approvePR, requestChanges, mergePR,
    isLoading, error, setError
  } = useStore();

  const [isGitHubOpen, setGitHubOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai', content: string }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReview = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsAnalyzing(true);
    setError(null);

    try {
      const review = await reviewsAPI.create({
        pr_url: 'https://github.com/demo/pr/1',
        code_diff: userMessage,
        original_code: userMessage,
        review_mode: reviewMode,
      });

      setCurrentReview(review);
      setCode(userMessage, review.reviewed_code || userMessage);

      if (review.ai_feedback) {
        const feedback = review.ai_feedback;
        const aiMessage = `${feedback.summary || 'Review complete'}\n\n${feedback.issues?.map((i: any) => `• **${i.severity}**: ${i.message}`).join('\n') || ''
          }`;
        setMessages(prev => [...prev, { role: 'ai', content: aiMessage }]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create review');
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Error: ${err.response?.data?.detail || 'Failed to analyze code'}`
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApprove = async () => {
    if (!currentReview) return;
    try {
      await approvePR(currentReview.id, 'Approved via AI PR Reviewer');
      alert('PR approved successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to approve PR');
    }
  };

  const handleRequestChanges = async () => {
    if (!currentReview) return;
    const comment = prompt('Enter reason for changes:');
    if (!comment) return;
    try {
      await requestChanges(currentReview.id, comment);
      alert('Changes requested!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to request changes');
    }
  };

  const handleMerge = async () => {
    if (!currentReview) return;
    if (!confirm('Are you sure you want to merge this PR?')) return;
    try {
      await mergePR(currentReview.id, 'squash');
      alert('PR merged successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to merge PR');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReview();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar onGitHubClick={() => setGitHubOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              <h1 className="font-semibold text-white">
                {currentReview ? `PR #${currentReview.pr_number || 'New'}` : 'New Review'}
              </h1>
            </div>
            {currentReview && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${currentReview.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  currentReview.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}>
                {currentReview.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-background/50 px-3 py-1.5 rounded-lg border border-border">
              <span className={`text-xs font-medium transition-colors ${reviewMode === 'manual' ? 'text-white' : 'text-text-muted'}`}>
                Manual
              </span>
              <button
                onClick={toggleMode}
                className={`w-11 h-6 rounded-full relative transition-colors ${reviewMode === 'automatic' ? 'bg-primary' : 'bg-border'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${reviewMode === 'automatic' ? 'left-6' : 'left-1'}`} />
              </button>
              <span className={`text-xs font-medium transition-colors ${reviewMode === 'automatic' ? 'text-white' : 'text-text-muted'}`}>
                Auto
              </span>
            </div>

            {currentReview && (
              <>
                {reviewMode === 'manual' ? (
                  <>
                    <Button variant="danger" size="sm" className="gap-2" onClick={handleRequestChanges}>
                      <AlertCircle className="w-4 h-4" />
                      Request Changes
                    </Button>
                    <Button variant="success" size="sm" className="gap-2" onClick={handleApprove}>
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button variant="primary" size="sm" className="gap-2" onClick={handleMerge}>
                      <GitPullRequest className="w-4 h-4" />
                      Merge
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleMerge}>
                    <Zap className="w-4 h-4 text-yellow-500" />
                    Auto-Merge Enabled
                  </Button>
                )}
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
          <CodePane title="Original Code" code={originalCode} language="typescript" />
          <CodePane title="AI Suggested Changes" code={reviewedCode} language="typescript" isReviewed />
        </div>

        {/* Chat Input Area */}
        <div className="h-auto max-h-96 bg-surface/80 backdrop-blur-xl border-t border-border flex flex-col">
          {/* Messages */}
          {messages.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-48">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-2xl px-4 py-2 rounded-lg ${msg.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-background border border-border text-text'
                    }`}>
                    <p className="text-sm whitespace-pre-line">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isAnalyzing && (
                <div className="flex justify-start">
                  <div className="bg-background border border-border px-4 py-2 rounded-lg flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-text-muted">AI is analyzing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input */}
          <div className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
                  <Code2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Paste code or ask AI to review (e.g., 'review this function...')"
                  className="w-full pl-12 pr-4 py-3 bg-background/50 border border-border rounded-lg text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>
              <Button onClick={handleReview} disabled={!chatInput.trim() || isAnalyzing || isLoading} className="gap-2">
                {isAnalyzing || isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Review
              </Button>
            </div>
            <p className="text-xs text-text-muted mt-2 text-center">
              Press Enter to send • AI will analyze and suggest improvements
            </p>
          </div>
        </div>
      </div>

      <GitHubModal isOpen={isGitHubOpen} onClose={() => setGitHubOpen(false)} />
    </div>
  );
}