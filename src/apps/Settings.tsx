/**
 * Settings — wallpaper, appearance, accent, reduced motion
 */

import type { AppWindowProps } from '../apps/registry';
import {
  useSettings,
  WALLPAPERS,
  ACCENT_COLORS,
  type Appearance,
} from '../store/settingsStore';

export default function SettingsApp(_props: AppWindowProps) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const clearWallpaperImage = useSettings((s) => s.clearWallpaperImage);
  const hasCustomWallpaper = Boolean(settings.wallpaperImage);

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-5" data-testid="settings">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as Appearance[]).map((a) => (
            <button
              key={a}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                settings.appearance === a
                  ? 'bg-accent text-white'
                  : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15'
              }`}
              onClick={() => update({ appearance: a })}
              data-testid={`settings-appearance-${a}`}
            >
              {a}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accent Color">
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              title={c.label}
              aria-label={c.label}
              className={`w-8 h-8 rounded-full ring-offset-2 ring-offset-neutral-50 dark:ring-offset-neutral-900 ${
                settings.accent === c.id ? 'ring-2 ring-neutral-900 dark:ring-white' : ''
              }`}
              style={{ backgroundColor: `rgb(${c.rgb.join(',')})` }}
              onClick={() => update({ accent: c.id })}
              data-testid={`settings-accent-${c.id}`}
            />
          ))}
        </div>
      </Section>

      <Section title="Wallpaper">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {hasCustomWallpaper && (
            <div
              className="relative rounded-xl overflow-hidden aspect-[16/10] border-2 border-accent ring-2 ring-accent/40"
              style={{
                background: `#0b0b0f url("${settings.wallpaperImage}") center center / cover no-repeat`,
              }}
              data-testid="settings-wallpaper-custom"
            >
              <span
                className="absolute bottom-0 left-0 right-0 p-1.5 text-[10px] text-white font-medium bg-black/40"
                style={{ textShadow: '0 1px 2px #000' }}
              >
                Custom photo
              </span>
              <button
                type="button"
                className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-black/60 text-white hover:bg-black/80"
                onClick={() => clearWallpaperImage()}
                data-testid="settings-wallpaper-clear-custom"
              >
                Clear
              </button>
            </div>
          )}
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              className={`rounded-xl overflow-hidden aspect-[16/10] border-2 ${
                !hasCustomWallpaper && settings.wallpaper === w.id
                  ? 'border-accent ring-2 ring-accent/40'
                  : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: w.css }}
              onClick={() => update({ wallpaper: w.id, wallpaperImage: null })}
              aria-label={w.label}
              data-testid={`settings-wallpaper-${w.id}`}
            >
              <span className="block mt-auto p-1.5 text-[10px] text-white font-medium" style={{ textShadow: '0 1px 2px #000' }}>
                {w.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Tip: open an image in Preview and choose <span className="font-medium">Set as Wallpaper</span>.
        </p>
      </Section>

      <Section title="Accessibility">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => update({ reducedMotion: e.target.checked })}
            className="w-4 h-4 accent-[rgb(var(--accent-rgb))]"
            data-testid="settings-reduced-motion"
          />
          <div>
            <div className="text-sm font-medium">Reduce motion</div>
            <div className="text-xs text-neutral-500">Minimize animations and transitions</div>
          </div>
        </label>
      </Section>

      <p className="mt-8 text-xs text-neutral-500">
        Settings are saved automatically to IndexedDB and restore after reload.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">{title}</h2>
      {children}
    </section>
  );
}
