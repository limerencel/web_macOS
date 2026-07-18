/**
 * Notifications store — transient UI banners
 *
 * Each notification auto-dismisses after a timeout. Notifications are not
 * persisted (intentional — they are ephemeral UI events).
 */

import { create } from 'zustand';

export interface Notification {
  id: string;
  title: string;
  body: string;
  /** Optional icon name from the app icon set */
  icon?: string;
  /** Auto-dismiss ms (0 = sticky) */
  duration: number;
  createdAt: number;
}

interface NotificationsState {
  notifications: Notification[];
  push: (n: Omit<Notification, 'id' | 'createdAt'>) => string;
  dismiss: (id: string) => void;
}

function makeId(): string {
  return `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: [],

  push: (n) => {
    const id = makeId();
    const notif: Notification = { ...n, id, createdAt: Date.now() };
    set((s) => ({ notifications: [notif, ...s.notifications].slice(0, 12) }));
    if (n.duration > 0) {
      setTimeout(() => get().dismiss(id), n.duration);
    }
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },
}));

/** Convenience helper used throughout the UI. */
export function notify(title: string, body = '', duration = 4000, icon?: string): void {
  useNotifications.getState().push({ title, body, duration, icon });
}
