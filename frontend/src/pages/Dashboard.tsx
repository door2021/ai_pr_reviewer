import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import CodePane from '@/components/CodePane';
import GitHubModal from '@/components/GitHubModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Zap, CheckCircle, AlertCircle, Send, Code2, 
  GitPullRequest, MessageSquare, Sparkles, Loader2,
  ChevronRight, X
} from 'lucide-react';

export default function Dashboard() {
  const { 
    reviewMode, toggleMode, originalCode, reviewedCode, 
    setCode, githubConfigured 
  } = useStore();
  
  const [isGitHubOpen, setGitHubOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<Array<{role: 'user' | 'ai', content: string}>>([]);
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

    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockReview = {
      summary: "I've analyzed your code and found several improvements:",
      issues: [
        { severity: 'high', message: 'Security: Use bcrypt for password comparison instead of plain text' },
        { severity: 'medium', message: 'Add input validation for user object' },
        { severity: 'low', message: 'Consider adding TypeScript types' }
      ]
    };

    const reviewed = `function login(user: User) {
  // Validate input
  if (!user || !user.pass) {
    throw new Error('Invalid credentials');
  }
  
  // Security: Use hash comparison
  const isValid = await bcrypt.compare(user.pass, hash);
  
  if (isValid) {
    return true;
  }
  return false;
}`;

    setCode(userMessage.includes('function') ? userMessage : originalCode, reviewed);
    
    setMessages(prev => [...prev, { 
      role: 'ai', 
      content: `${mockReview.summary}\n\n${mockReview.issues.map(i => `• **${i.severity}**: ${i.message}`).join('\n')}`
    }]);
    
    setIsAnalyzing(false);
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
              <h1 className="font-semibold text-white">PR #42: Auth Fix</h1>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Open
            </span>
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

            {reviewMode === 'manual' ? (
              <>
                <Button variant="danger" size="sm" className="gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Request Changes
                </Button>
                <Button variant="success" size="sm" className="gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Auto-Merge Enabled
              </Button>
            )}
          </div>
        </header>

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
                  <div className={`max-w-2xl px-4 py-2 rounded-lg ${
                    msg.role === 'user' 
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
              <Button onClick={handleReview} disabled={!chatInput.trim() || isAnalyzing} className="gap-2">
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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