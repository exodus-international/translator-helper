import { create } from 'zustand';

interface NotificationCountState {
  unread: number;
  setUnread: (unread: number | ((current: number) => number)) => void;
}

/**
 * The unread count, shared by everything that shows it. The bell polls and
 * owns it; the user menu and anything else only read it, so they never drift
 * apart or poll twice.
 */
export const useNotificationCount = create<NotificationCountState>((set) => ({
  unread: 0,
  setUnread: (unread) => set((state) => ({ unread: typeof unread === 'function' ? unread(state.unread) : unread })),
}));
