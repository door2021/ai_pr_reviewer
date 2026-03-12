import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CodePaneProps {
  title: string;
  code: string;
  language?: string;
  isReviewed?: boolean;
}

export default function CodePane({ title, code, language = 'typescript', isReviewed }: CodePaneProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
      
      {/* Code Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="font-mono text-sm leading-relaxed">
          <code className="text-text">
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}