export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Chat {
  id: number;
  title: string;
  date: string;
}

export interface ReviewState {
  originalCode: string;
  reviewedCode: string;
  status: 'pending' | 'processing' | 'completed';
}

export type ReviewMode = 'manual' | 'automatic';
export type SidebarMode = 'chats' | 'files';