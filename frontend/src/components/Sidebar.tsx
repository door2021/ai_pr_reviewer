import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { 
  MessageSquare, FolderGit2, Plus, Github, Settings, 
  LogOut, ChevronRight, ChevronDown, Sparkles, GitPullRequest,
  Folder, X, Check
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Repo, PR } from '@/types';

interface SidebarProps {
  onGitHubClick: () => void;
}

export default function Sidebar({ onGitHubClick }: SidebarProps) {
  const { 
    chats, 
    githubConnected, 
    githubUsername,
    importedRepos, 
    selectedRepo,
    repoPRs,
    activeChatId, 
    user, 
    logout,
    sidebarMode,
    setSidebarMode,
    setActiveChat,
    selectRepo,
    selectPR,
    currentReview
  } = useStore();

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [selectedPRNumber, setSelectedPRNumber] = useState<number | null>(null);

  const toggleRepo = (repoFullName: string) => {
    const newExpanded = new Set(expandedRepos);
    if (newExpanded.has(repoFullName)) {
      newExpanded.delete(repoFullName);
    } else {
      newExpanded.add(repoFullName);
    }
    setExpandedRepos(newExpanded);
    selectRepo(repoFullName);
  };

  const handlePRClick = (repoFullName: string, pr: PR) => {
    setSelectedPRNumber(pr.number);
    selectPR(pr);
    console.log('Opening PR:', repoFullName, pr.number);
  };

  const getUserInitials = () => {
    if (!user?.full_name && !user?.name && !user?.email) return 'U';
    const name = user?.full_name || user?.name || user?.email || 'User';
    if (name.includes('@')) {
      return name.split('@')[0].charAt(0).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

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
        <button 
          onClick={() => setSidebarMode('chats')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            sidebarMode === 'chats' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-text-muted hover:text-text'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chats
        </button>
        <button 
          onClick={() => setSidebarMode('files')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            sidebarMode === 'files' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-text-muted hover:text-text'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          Files
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* CHATS TAB */}
        {sidebarMode === 'chats' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-2 mb-2">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Recent Reviews
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            
            {chats && chats.length > 0 ? (
              chats.map((chat) => (
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
              ))
            ) : (
              <div className="px-3 py-4 text-center text-text-muted text-sm">
                No reviews yet. Start by pasting code below!
              </div>
            )}
          </div>
        )}

        {/* FILES TAB */}
        {sidebarMode === 'files' && (
          <div className="space-y-2">
            {/* GitHub Connection Status */}
            <div className="px-2 py-2 mb-3">
              {githubConnected ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-emerald-400">Connected</span>
                  </div>
                  <button 
                    onClick={onGitHubClick}
                    className="text-xs text-text-muted hover:text-text"
                  >
                    Manage
                  </button>
                </div>
              ) : (
                <Button 
                  variant="primary" 
                  size="sm" 
                  className="w-full justify-start gap-2"
                  onClick={onGitHubClick}
                >
                  <Github className="w-4 h-4" />
                  Connect GitHub
                </Button>
              )}
            </div>

            {/* Imported Repos */}
            {importedRepos && importedRepos.length > 0 ? (
              <div>
                <div className="flex items-center justify-between px-2 py-2 mb-2">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Imported Repos
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={onGitHubClick}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {importedRepos.map((repo: Repo) => (
                  <div key={repo.id} className="mb-1">
                    {/* Repo Header */}
                    <button
                      onClick={() => toggleRepo(repo.full_name)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                        selectedRepo === repo.full_name
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-surface border border-transparent'
                      }`}
                    >
                      {expandedRepos.has(repo.full_name) ? (
                        <ChevronDown className="w-4 h-4 text-text-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      )}
                      <Folder className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-text flex-1 text-left truncate">
                        {repo.name}
                      </span>
                      {repo.private && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted border border-border">
                          Private
                        </span>
                      )}
                    </button>

                    {/* PR List (when expanded) */}
                    {expandedRepos.has(repo.full_name) && (
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-3">
                        {repoPRs && repoPRs.length > 0 ? (
                          repoPRs.map((pr: PR) => (
                            <button
                              key={pr.number}
                              onClick={() => handlePRClick(repo.full_name, pr)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                                selectedPRNumber === pr.number
                                  ? 'bg-primary/10 border border-primary/20'
                                  : 'hover:bg-surface border border-transparent'
                              }`}
                            >
                              <GitPullRequest className="w-3.5 h-3.5 text-text-muted" />
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-xs font-medium text-text truncate">
                                  #{pr.number} {pr.title}
                                </p>
                                <p className="text-xs text-text-muted truncate">
                                  {pr.head_ref} → {pr.base_ref}
                                </p>
                              </div>
                              {pr.state === 'open' && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-2 py-2 text-xs text-text-muted">
                            No open PRs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : githubConnected ? (
              <div className="px-3 py-4 text-center text-text-muted text-sm">
                No repos imported yet. Click + to import.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-sm">
            {getUserInitials()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name || user?.name || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-xs text-text-muted truncate">
              {user?.email || 'No email'}
            </p>
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