import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Send, MessageSquare } from 'lucide-react';

interface CommentSectionProps {
  reviewId?: number;
  onAddComment: (content: string, lineNumber?: number) => Promise<void>;
}

export default function CommentSection({ reviewId, onAddComment }: CommentSectionProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !reviewId) return;

    setIsSubmitting(true);
    try {
      await onAddComment(comment);
      setComment('');
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-auto max-h-64 bg-surface/50 border-t border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-text-muted" />
        <span className="text-sm font-medium text-text">Add Comment to PR</span>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write your comment for the PR author..."
          className="flex-1 min-h-[80px] bg-background/50 border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <Button
          type="submit"
          disabled={!comment.trim() || isSubmitting}
          className="self-end"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Posting...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Post Comment
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}