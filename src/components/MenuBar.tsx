/**
 * MenuBar — top status bar with logo, clock, and status indicators
 *
 * Pure presentational component reading time from a 1s interval and the
 * active window title from the window manager. Clicking the logo opens the
 * About window.
 */

import { useEffect, useState } from 'react';
import { useWindowManager } from '../store/windowManager';
import { useSettings } from '../store/settingsStore';
import { SpotlightIcon } from './icons/AppIcons';

interface MenuBarProps {
  onSpotlight: () => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
  onShutdown: () => void;
  onRestart: () => void;
}

export function MenuBar({ onSpotlight, onOpenAbout, onOpenSettings, onLock, onShutdown, onRestart }: MenuBarProps) {
  const [now, setNow] = useState(new Date());
  const [systemMenu, setSystemMenu] = useState(false);
  const windows = useWindowManager((s) => s.windows);
  const topZ = useWindowManager((s) => s.topZ);
  const appearance = useSettings((s) => s.settings.appearance);
  const update = useSettings((s) => s.update);
  const wallpaper = useSettings((s) => s.settings.wallpaper);

  // Find the currently focused window (highest z that isn't minimized)
  const focused = windows
    .filter((w) => !w.minimized)
    .sort((a, b) => b.zIndex - a.zIndex)[0];

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Use a dummy read of topZ to keep focused window reactive to focus changes
  void topZ;

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="fixed top-0 left-0 right-0 h-7 z-[10000] bg-black/20 dark:bg-black/40 backdrop-blur-2xl text-white text-xs flex items-center px-3 select-none border-b border-white/5">
      <button
        className="flex items-center gap-1.5 hover:bg-white/10 rounded px-1.5 py-0.5 font-semibold"
        onClick={() => setSystemMenu((open) => !open)}
        aria-label="WebOS menu"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="7" cy="7" r="2.4" fill="currentColor" />
        </svg>
        <span>WebOS</span>
      </button>

      {systemMenu && (
        <div className="system-menu" role="menu">
          <button onClick={() => { setSystemMenu(false); onOpenAbout(); }}>About This WebOS</button>
          <button onClick={() => { setSystemMenu(false); onOpenSettings(); }}>System Settings…</button>
          <div />
          <button onClick={() => { setSystemMenu(false); onLock(); }}>Lock Screen</button>
          <button onClick={() => { setSystemMenu(false); onRestart(); }}>Restart…</button>
          <button onClick={() => { setSystemMenu(false); onShutdown(); }}>Shut Down…</button>
        </div>
      )}

      <span className="ml-3 font-semibold">{focused?.title ?? 'Desktop'}</span>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Appearance quick toggle */}
        <button
          className="hover:bg-white/10 rounded px-1.5 py-0.5"
          onClick={onLock}
          aria-label="Lock WebOS"
          title="Lock WebOS"
        >
          ◉
        </button>
        <button
          className="hover:bg-white/10 rounded px-1.5 py-0.5"
          onClick={() => update({ appearance: appearance === 'dark' ? 'light' : 'dark' })}
          aria-label="Toggle appearance"
          title={`Appearance: ${appearance}`}
        >
          {appearance === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          className="hover:bg-white/10 rounded px-1.5 py-0.5"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          ⚙️
        </button>
        <button
          className="hover:bg-white/10 rounded p-0.5"
          onClick={onSpotlight}
          aria-label="Spotlight search"
          title="Spotlight (⌘Space / Ctrl+Space)"
        >
          <SpotlightIcon size={14} className="text-white" />
        </button>
        <span className="ml-1 tabular-nums" title={wallpaper}>{dateStr}</span>
        <span className="tabular-nums font-medium">{timeStr}</span>
      </div>
    </div>
  );
}
