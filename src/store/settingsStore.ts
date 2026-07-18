/**
 * Settings store — appearance & behavior preferences
 *
 * Persisted to IndexedDB. On change we apply side effects (CSS variables,
 * dark class, motion preference) via applySettings().
 */

import { create } from 'zustand';
import { load, persist } from '../services/db';

const SETTINGS_KEY = 'settings-v1';

export type Appearance = 'light' | 'dark' | 'system';

export interface AccentColor {
  id: string;
  label: string;
  rgb: [number, number, number];
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: 'blue', label: 'Blue', rgb: [10, 132, 255] },
  { id: 'purple', label: 'Purple', rgb: [175, 82, 222] },
  { id: 'pink', label: 'Pink', rgb: [255, 55, 95] },
  { id: 'red', label: 'Red', rgb: [255, 59, 48] },
  { id: 'orange', label: 'Orange', rgb: [255, 149, 0] },
  { id: 'yellow', label: 'Yellow', rgb: [255, 204, 0] },
  { id: 'green', label: 'Green', rgb: [48, 209, 88] },
  { id: 'graphite', label: 'Graphite', rgb: [142, 142, 147] },
];

export interface Wallpaper {
  id: string;
  label: string;
  /** CSS background value (gradients only — no external assets) */
  css: string;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    css: 'linear-gradient(135deg, #1a2a6c 0%, #b21f1f 50%, #fdbb2d 100%)',
  },
  {
    id: 'twilight',
    label: 'Twilight',
    css: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css: 'linear-gradient(160deg, #ff6e7f 0%, #bfe9ff 100%)',
  },
  {
    id: 'mint',
    label: 'Mint',
    css: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    css: 'linear-gradient(160deg, #232526 0%, #414345 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    css: 'linear-gradient(160deg, #2E3192 0%, #1BFFFF 100%)',
  },
  {
    id: 'blossom',
    label: 'Blossom',
    css: 'linear-gradient(135deg, #ec008c 0%, #fc6767 100%)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    css: 'radial-gradient(ellipse at top, #1B2735 0%, #090A0F 100%)',
  },
];

export interface Settings {
  appearance: Appearance;
  accent: string;
  wallpaper: string;
  reducedMotion: boolean;
  /** Auto-hide dock when false keeps it visible; kept as toggle for future */
  dockAutohide: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'dark',
  accent: 'blue',
  wallpaper: 'aurora',
  reducedMotion: false,
  dockAutohide: false,
};

interface SettingsStoreState {
  settings: Settings;
  ready: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

function applySettings(s: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const accent = ACCENT_COLORS.find((a) => a.id === s.accent) ?? ACCENT_COLORS[0];
  root.style.setProperty('--accent-rgb', accent.rgb.join(' '));

  // Appearance: resolve system if needed
  let dark = s.appearance === 'dark';
  if (s.appearance === 'system') {
    dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  root.classList.toggle('dark', dark);

  // Wallpaper
  const wp = WALLPAPERS.find((w) => w.id === s.wallpaper) ?? WALLPAPERS[0];
  root.style.setProperty('--wallpaper', wp.css);

  // Reduced motion
  root.classList.toggle('reduce-motion', s.reducedMotion);
}

export const useSettings = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,

  init: async () => {
    const saved = await load<Settings>(SETTINGS_KEY);
    const merged = saved ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
    set({ settings: merged, ready: true });
    applySettings(merged);
    // React to system theme changes when in system mode
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().settings.appearance === 'system') applySettings(get().settings);
      });
    }
  },

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    applySettings(next);
    void persist(SETTINGS_KEY, next);
  },
}));
