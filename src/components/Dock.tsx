/**
 * Dock — bottom application launcher
 *
 * Reads registered apps that opt into the dock, plus shows running windows.
 * Clicking a dock icon launches (or focuses) the app. The dock scales icons
 * on hover for the macOS "magnification" feel (gated by reduced motion).
 */

import { useState } from 'react';
import { getDockApps, getApp } from '../apps/registry';
import { useWindowManager } from '../store/windowManager';
import { useSettings } from '../store/settingsStore';

interface DockProps {
  onLaunch: (appId: string) => void;
}

export function Dock({ onLaunch }: DockProps) {
  const apps = getDockApps();
  const windows = useWindowManager((s) => s.windows);
  const restore = useWindowManager((s) => s.restore);
  const focus = useWindowManager((s) => s.focus);
  const findByApp = useWindowManager((s) => s.findByApp);
  const reducedMotion = useSettings((s) => s.settings.reducedMotion);
  const [hovered, setHovered] = useState<string | null>(null);

  const handleClick = (appId: string) => {
    const app = getApp(appId);
    if (!app) return;
    // For single-instance apps that already have a window, restore it
    if (app.singleInstance) {
      const existing = findByApp(appId);
      if (existing) {
        if (existing.minimized) restore(existing.id);
        else focus(existing.id);
        return;
      }
    }
    onLaunch(appId);
  };

  return (
    <div className="fixed bottom-1 left-1/2 -translate-x-1/2 z-[9000] flex items-end gap-1.5 px-2 py-1.5 bg-white/20 dark:bg-black/30 backdrop-blur-2xl rounded-2xl border border-white/15 shadow-2xl">
      {apps.map((app) => {
        const running = windows.some((w) => w.appId === app.id);
        const scale = !reducedMotion && hovered === app.id ? 1.25 : 1;
        return (
          <button
            key={app.id}
            className="relative flex flex-col items-center justify-end group"
            onClick={() => handleClick(app.id)}
            onMouseEnter={() => setHovered(app.id)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`Launch ${app.name}`}
            title={app.name}
            style={{
              transform: `scale(${scale})`,
              transition: reducedMotion ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)',
              transformOrigin: 'bottom',
            }}
          >
            <app.icon size={44} />
            {running && (
              <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-white/80" />
            )}
            {hovered === app.id && (
              <span className="absolute -top-7 px-2 py-0.5 rounded bg-neutral-900/90 text-white text-xs whitespace-nowrap animate-fade-in">
                {app.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
