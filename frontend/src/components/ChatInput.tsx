import { useState, FormEvent, ChangeEvent } from 'react';
import { useStore } from '@/store/useStore';
import { Send, Code2 } from 'lucide-react';
import { Button } from './ui/Button';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const { setCode } = useStore();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Mock Logic
    if (input.includes('function') || input.includes('const')) {
      setCode(input, `// AI Reviewed Version\n${input}\n// Optimized`);
    }
    setInput('');
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <div className="h-16 bg-surface border-t border-border flex items-center px-4 gap-4">
      <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
        <div className="flex-1 relative">
          <input 
            type="text" 
            value={input}
            onChange={handleChange}
            placeholder="Paste code or ask AI to review..." 
            className="w-full bg-background border border-border rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary pl-10"
          />
          <Code2 size={16} className="absolute left-3 top-3 text-text-muted"/>
        </div>
        <Button type="submit" className="gap-2">
          Review <Send size={16}/>
        </Button>
      </form>
    </div>
  );
}