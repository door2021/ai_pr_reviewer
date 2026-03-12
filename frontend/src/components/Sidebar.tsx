import { useStore } from '@/store/useStore';
import { 
  MessageSquare, FolderGit2, Plus, Github, Settings, 
  LogOut, ChevronRight, FileCode, Sparkles, GitPullRequest
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chat } from '@/types';

interface SidebarProps {
  onGitHubClick: () => void;
}

export default function Sidebar({ onGitHubClick }: SidebarProps) {
  const { chats, githubConfigured, setActiveChat, activeChatId, user, logout } = useStore();

  return (
    <div className="w-72 bg-surface/90 backdrop-blur-xl border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white">AI Reviewer</span>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button className="flex-1 py-3 text-sm font-medium text-primary border-b-2 border-primary flex items-center justify-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Chats
        </button>
        <button className="flex-1 py-3 text-sm font-medium text-text-muted hover:text-text flex items-center justify-center gap-2 transition-colors">
          <FolderGit2 className="w-4 h-4" />
          Files
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="flex items-center justify-between px-2 py-2 mb-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Recent Reviews
          </span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        
        {chats.map((chat: Chat) => (
          <button
            key={chat.id}
            onClick={() => setActiveChat(chat.id)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all group ${
              activeChatId === chat.id 
                ? 'bg-primary/10 border border-primary/20' 
                : 'hover:bg-surface border border-transparent'
            }`}
          >
            <div className={`mt-0.5 ${activeChatId === chat.id ? 'text-primary' : 'text-text-muted group-hover:text-text'}`}>
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className={`text-sm font-medium truncate ${activeChatId === chat.id ? 'text-white' : 'text-text'}`}>
                {chat.title}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{chat.date}</p>
            </div>
            {activeChatId === chat.id && (
              <ChevronRight className="w-4 h-4 text-primary" />
            )}
          </button>
        ))}

        {/* GitHub Section */}
        <div className="mt-6 pt-6 border-t border-border">
          <Button 
            variant={githubConfigured ? "outline" : "primary"} 
            className="w-full justify-start gap-2 mb-3"
            onClick={onGitHubClick}
          >
            <Github className="w-4 h-4" />
            {githubConfigured ? "Connected to GitHub" : "Import from GitHub"}
          </Button>
          
          {githubConfigured && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border">
                <GitPullRequest className="w-4 h-4 text-text-muted" />
                <span className="text-sm text-text">ai-pr-reviewer</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border">
                <GitPullRequest className="w-4 h-4 text-text-muted" />
                <span className="text-sm text-text">frontend-app</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-sm">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-text-muted" onClick={logout}>
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}