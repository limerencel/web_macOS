import { create } from 'zustand';
import { apiRequest, jsonBody } from '../services/api';
import { load, persist, remove } from '../services/db';
import type { RemoteApp, RemoteAppInput } from '../types/dashboard';

const CACHE_KEY = 'dashboard-apps-v1';

interface DashboardState {
  apps: RemoteApp[];
  ready: boolean;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  createApp: (input: RemoteAppInput) => Promise<RemoteApp>;
  updateApp: (id: string, patch: Partial<RemoteAppInput>) => Promise<RemoteApp>;
  deleteApp: (id: string) => Promise<void>;
  reorderApps: (ids: string[]) => Promise<void>;
  uploadIcon: (dataUrl: string) => Promise<string>;
  clear: () => void;
}

async function cache(apps: RemoteApp[]): Promise<void> {
  await persist(CACHE_KEY, apps);
}

export const useDashboard = create<DashboardState>((set, get) => ({
  apps: [],
  ready: false,
  loading: false,
  error: null,

  init: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    const cached = await load<RemoteApp[]>(CACHE_KEY);
    if (cached) set({ apps: cached, ready: true });
    try {
      const response = await apiRequest<{ apps: RemoteApp[] }>('/api/apps');
      set({ apps: response.apps, ready: true, loading: false });
      await cache(response.apps);
    } catch (error) {
      set({
        ready: true,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load applications',
      });
    }
  },

  createApp: async (input) => {
    const response = await apiRequest<{ app: RemoteApp }>('/api/apps', {
      method: 'POST',
      ...jsonBody(input),
    });
    const apps = [...get().apps, response.app].sort((a, b) => a.sortOrder - b.sortOrder);
    set({ apps, error: null });
    await cache(apps);
    return response.app;
  },

  updateApp: async (id, patch) => {
    const response = await apiRequest<{ app: RemoteApp }>(`/api/apps/${id}`, {
      method: 'PATCH',
      ...jsonBody(patch),
    });
    const apps = get().apps.map((app) => app.id === id ? response.app : app);
    set({ apps, error: null });
    await cache(apps);
    return response.app;
  },

  deleteApp: async (id) => {
    await apiRequest<void>(`/api/apps/${id}`, { method: 'DELETE' });
    const apps = get().apps.filter((app) => app.id !== id);
    set({ apps, error: null });
    await cache(apps);
  },

  reorderApps: async (ids) => {
    const previous = get().apps;
    const byId = new Map(previous.map((app) => [app.id, app]));
    const optimistic = ids.map((id, index) => ({ ...byId.get(id)!, sortOrder: index }));
    set({ apps: optimistic });
    try {
      const response = await apiRequest<{ apps: RemoteApp[] }>('/api/apps/reorder', {
        method: 'POST',
        ...jsonBody({ ids }),
      });
      set({ apps: response.apps, error: null });
      await cache(response.apps);
    } catch (error) {
      set({ apps: previous, error: error instanceof Error ? error.message : 'Unable to reorder applications' });
      throw error;
    }
  },

  uploadIcon: async (dataUrl) => {
    const response = await apiRequest<{ url: string }>('/api/icons', {
      method: 'POST',
      ...jsonBody({ dataUrl }),
    });
    return response.url;
  },

  clear: () => {
    set({ apps: [], ready: false, loading: false, error: null });
    void remove(CACHE_KEY);
  },
}));
