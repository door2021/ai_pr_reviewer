import { useState } from 'react';
import { Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CodePaneProps {
  title: string;
  code: string;
  language?: string;
  isReviewed?: boolean;
  isEditable?: boolean;
  onCodeChange?: (code: string) => void;
  onReview?: () => void;
  isReviewing?: boolean;
}

export default function CodePane({
  title,
  code,
  language = 'typescript',
  isReviewed = false,
  isEditable = false,
  onCodeChange,
  onReview,
  isReviewing = false,
}: CodePaneProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onCodeChange) {
      onCodeChange(e.target.value);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-border last:border-0 bg-background/30">
      {/* Header */}
      <div className="h-12 bg-surface/80 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {isReviewed && <Sparkles className="w-4 h-4 text-primary" />}
          <span className="text-sm font-medium text-text">{title}</span>
          {language && (
            <span className="px-2 py-0.5 rounded text-xs bg-surface text-text-muted border border-border">
              {language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditable && onReview && (
            <Button
              variant="primary"
              size="sm"
              className="gap-1 h-8 px-3"
              onClick={onReview}
              disabled={isReviewing || !code.trim()}
            >
              {isReviewing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Review
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Code Content */}
      <div className="flex-1 overflow-auto p-4">
        {isEditable ? (
          <textarea
            value={code}
            onChange={handleChange}
            placeholder="Paste or type your code here...

The AI will analyze and suggest improvements in the right panel."
            className="w-full h-full min-h-[300px] bg-transparent text-text font-mono text-sm leading-relaxed resize-none focus:outline-none placeholder:text-text-muted/40"
            spellCheck={false}
          />
        ) : (
          <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
            <code className="text-text">
              {code || (
                <span className="text-text-muted/40 italic">No code to display</span>
              )}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}