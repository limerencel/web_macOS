import { create } from 'zustand';
import { apiRequest, jsonBody, setCsrfToken } from '../services/api';
import type { UserProfile } from '../types/dashboard';

export type SystemState =
  | 'booting'
  | 'locked'
  | 'unlocking'
  | 'desktop'
  | 'locking'
  | 'shutdown';

interface SessionResponse {
  authenticated: boolean;
  setupRequired: boolean;
  profile: UserProfile | null;
  csrfToken?: string;
  expiresAt?: string;
}

interface SetupInput {
  setupToken: string;
  username: string;
  displayName: string;
  password: string;
  avatarData: string | null;
}

interface AuthState {
  state: SystemState;
  setupRequired: boolean;
  profile: UserProfile | null;
  error: string | null;
  initialized: boolean;
  init: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  setup: (input: SetupInput) => Promise<boolean>;
  lock: () => Promise<void>;
  logout: () => Promise<void>;
  shutdown: () => Promise<void>;
  wake: () => void;
  markUnauthorized: () => void;
  updateProfile: (patch: { displayName?: string; avatarData?: string | null; lockWallpaperData?: string | null }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

function applySession(set: (patch: Partial<AuthState>) => void, response: SessionResponse): void {
  setCsrfToken(response.csrfToken ?? null);
  set({
    state: response.authenticated ? 'desktop' : 'locked',
    setupRequired: response.setupRequired,
    profile: response.profile,
    error: null,
    initialized: true,
  });
}

export const useAuth = create<AuthState>((set, get) => ({
  state: 'booting',
  setupRequired: false,
  profile: null,
  error: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    try {
      const response = await apiRequest<SessionResponse>('/api/auth/session');
      applySession(set, response);
    } catch (error) {
      set({
        state: 'locked',
        error: error instanceof Error ? error.message : 'Unable to reach the WebOS server',
        initialized: true,
      });
    }
  },

  login: async (password) => {
    set({ state: 'unlocking', error: null });
    try {
      const response = await apiRequest<SessionResponse>('/api/auth/login', {
        method: 'POST',
        ...jsonBody({ password }),
      });
      setCsrfToken(response.csrfToken ?? null);
      await new Promise((resolve) => setTimeout(resolve, 620));
      set({ state: 'desktop', profile: response.profile, setupRequired: false, error: null });
      return true;
    } catch (error) {
      set({ state: 'locked', error: error instanceof Error ? error.message : 'Unable to unlock WebOS' });
      return false;
    }
  },

  setup: async (input) => {
    set({ state: 'unlocking', error: null });
    try {
      const response = await apiRequest<SessionResponse>('/api/auth/setup', {
        method: 'POST',
        ...jsonBody(input),
      });
      setCsrfToken(response.csrfToken ?? null);
      await new Promise((resolve) => setTimeout(resolve, 620));
      set({ state: 'desktop', profile: response.profile, setupRequired: false, error: null });
      return true;
    } catch (error) {
      set({ state: 'locked', error: error instanceof Error ? error.message : 'Unable to finish setup' });
      return false;
    }
  },

  lock: async () => {
    if (get().state !== 'desktop') return;
    set({ state: 'locking', error: null });
    try {
      await apiRequest<void>('/api/auth/lock', { method: 'POST' });
    } catch {
      // Local locking remains authoritative when the network is unavailable.
    }
    setCsrfToken(null);
    await new Promise((resolve) => setTimeout(resolve, 280));
    set({ state: 'locked' });
  },

  logout: async () => {
    try {
      await apiRequest<void>('/api/auth/logout', { method: 'POST' });
    } catch {
      // The visible session still ends locally.
    }
    setCsrfToken(null);
    set({ state: 'locked', error: null });
  },

  shutdown: async () => {
    try {
      await apiRequest<void>('/api/auth/lock', { method: 'POST' });
    } catch {
      // The local machine still enters its powered-off state.
    }
    setCsrfToken(null);
    set({ state: 'shutdown', error: null });
  },
  wake: () => set({ state: 'locked', error: null }),

  markUnauthorized: () => {
    setCsrfToken(null);
    set({ state: 'locked', error: 'Your session expired. Unlock WebOS to continue.' });
  },

  updateProfile: async (patch) => {
    const response = await apiRequest<{ profile: UserProfile }>('/api/profile', {
      method: 'PATCH',
      ...jsonBody(patch),
    });
    set({ profile: response.profile });
  },

  changePassword: async (currentPassword, newPassword) => {
    await apiRequest<void>('/api/auth/change-password', {
      method: 'POST',
      ...jsonBody({ currentPassword, newPassword }),
    });
    setCsrfToken(null);
    set({ state: 'locked', error: 'Password updated. Unlock WebOS with your new password.' });
  },
}));
