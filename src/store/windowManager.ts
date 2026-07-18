/**
 * Window Manager — Zustand store
 *
 * Centralized registry of all open windows. Each window has a unique id, an
 * associated app id, a title, position/size, and state flags (minimized,
 * maximized, focused). The store exposes open/close/focus/minimize/maximize
 * and drag/resize actions; window presentation components subscribe to the
 * per-window state.
 */

import { create } from 'zustand';

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pre-maximize geometry for restore */
  prevRect?: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  /** Optional payload passed to the app (e.g. file id to open) */
  payload?: Record<string, unknown>;
}

interface WindowManagerState {
  windows: WindowState[];
  topZ: number;
  open: (opts: OpenWindowOpts) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, width: number, height: number, x?: number, y?: number) => void;
  setTitle: (id: string, title: string) => void;
  setPayload: (id: string, payload: Record<string, unknown>) => void;
  closeByApp: (appId: string) => void;
  findByApp: (appId: string) => WindowState | undefined;
}

export interface OpenWindowOpts {
  appId: string;
  title: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  payload?: Record<string, unknown>;
  /** If true, reuse an existing window of this app instead of opening a new one */
  single?: boolean;
}

const DEFAULT_W = 720;
const DEFAULT_H = 480;

function makeId(): string {
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  topZ: 10,

  open: (opts) => {
    const { appId, title, single } = opts;
    if (single) {
      const existing = get().findByApp(appId);
      if (existing) {
        get().restore(existing.id);
        get().focus(existing.id);
        if (opts.payload) get().setPayload(existing.id, opts.payload);
        return existing.id;
      }
    }
    const id = makeId();
    const z = get().topZ + 1;
    const width = opts.width ?? DEFAULT_W;
    const height = opts.height ?? DEFAULT_H;
    // Center-ish with a small cascade so stacked windows don't perfectly overlap
    const offset = (get().windows.length % 6) * 28;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = opts.x ?? clamp((vw - width) / 2 + offset, 0, vw - 200);
    const y = opts.y ?? clamp(40 + offset, 28, vh - 200);
    const win: WindowState = {
      id,
      appId,
      title,
      x,
      y,
      width,
      height,
      minimized: false,
      maximized: false,
      zIndex: z,
      payload: opts.payload,
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z }));
    return id;
  },

  close: (id) => {
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }));
  },

  focus: (id) => {
    set((s) => {
      const z = s.topZ + 1;
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, zIndex: z, minimized: false } : w)),
        topZ: z,
      };
    });
  },

  minimize: (id) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
    }));
  },

  restore: (id) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false } : w)),
    }));
    get().focus(id);
  },

  toggleMaximize: (id) => {
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized) {
          const r = w.prevRect ?? { x: w.x, y: w.y, width: w.width, height: w.height };
          return { ...w, maximized: false, ...r, prevRect: undefined };
        }
        return {
          ...w,
          maximized: true,
          prevRect: { x: w.x, y: w.y, width: w.width, height: w.height },
        };
      }),
    }));
    get().focus(id);
  },

  move: (id, x, y) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    }));
  },

  resize: (id, width, height, x, y) => {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? { ...w, width, height, x: x ?? w.x, y: y ?? w.y }
          : w
      ),
    }));
  },

  setTitle: (id, title) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
    }));
  },

  setPayload: (id, payload) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, payload } : w)),
    }));
  },

  closeByApp: (appId) => {
    set((s) => ({ windows: s.windows.filter((w) => w.appId !== appId) }));
  },

  findByApp: (appId) => get().windows.find((w) => w.appId === appId),
}));
