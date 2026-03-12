import { create } from 'zustand';
import { User, Chat, ReviewMode, SidebarMode } from '@/types';

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  sidebarMode: SidebarMode;
  chats: Chat[];
  activeChatId: number | null;
  reviewMode: ReviewMode;
  originalCode: string;
  reviewedCode: string;
  githubConfigured: boolean;

  // Actions
  login: (user: User) => void;
  logout: () => void;
  toggleMode: () => void;
  setCode: (original: string, reviewed: string) => void;
  toggleGitHub: () => void;
  setActiveChat: (id: number) => void;
}

export const useStore = create<AppState>((set) => ({
  user: { id: "1", name: "Dev User", email: "dev@example.com" },
  isAuthenticated: true,
  sidebarMode: 'chats',
  chats: [
    { id: 1, title: "PR #42: Auth Fix", date: "2 hrs ago" },
    { id: 2, title: "Refactor Utils", date: "1 day ago" },
  ],
  activeChatId: 1,
  reviewMode: 'manual',
  originalCode: `function login(user) {\n  if (user.pass == "123") {\n    return true;\n  }\n}`,
  reviewedCode: `function login(user) {\n  // Security: Use hash comparison\n  if (bcrypt.compare(user.pass, hash)) {\n    return true;\n  }\n}`,
  githubConfigured: false,

  login: (user) => set({ isAuthenticated: true, user }),
  logout: () => set({ isAuthenticated: false, user: null }),
  toggleMode: () => set((state) => ({
    reviewMode: state.reviewMode === 'manual' ? 'automatic' : 'manual'
  })),
  setCode: (original, reviewed) => set({ originalCode: original, reviewedCode: reviewed }),
  toggleGitHub: () => set((state) => ({ githubConfigured: !state.githubConfigured })),
  setActiveChat: (id) => set({ activeChatId: id }),
}));