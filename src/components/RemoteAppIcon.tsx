import type { RemoteApp, RemoteAppIcon as RemoteIcon } from '../types/dashboard';

const PRESETS: Record<string, { glyph: string; colors: [string, string] }> = {
  notes: { glyph: '✎', colors: ['#ffd60a', '#ff9f0a'] },
  cloud: { glyph: '☁', colors: ['#64d2ff', '#0a84ff'] },
  media: { glyph: '▶', colors: ['#ff375f', '#bf5af2'] },
  code: { glyph: '</>', colors: ['#30d158', '#0a7d33'] },
  home: { glyph: '⌂', colors: ['#ff9f0a', '#ff453a'] },
  files: { glyph: '▤', colors: ['#5ac8fa', '#007aff'] },
  chat: { glyph: '●', colors: ['#32d74b', '#00a86b'] },
  tools: { glyph: '⚙', colors: ['#aeaeb2', '#48484a'] },
};

export const REMOTE_ICON_PRESETS = Object.keys(PRESETS);

interface RemoteAppIconProps {
  app?: Pick<RemoteApp, 'name' | 'icon'>;
  name?: string;
  icon?: RemoteIcon;
  size?: number;
  className?: string;
}

export function RemoteAppIcon({ app, name, icon, size = 56, className }: RemoteAppIconProps) {
  const appName = app?.name ?? name ?? 'App';
  const appIcon = app?.icon ?? icon ?? { type: 'letter', value: appName.slice(0, 1) };
  const radius = Math.round(size * 0.22);

  if (appIcon.type === 'upload') {
    return (
      <img
        src={appIcon.value}
        alt=""
        className={className}
        width={size}
        height={size}
        draggable={false}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover' }}
      />
    );
  }

  const preset = PRESETS[appIcon.value];
  const glyph = preset?.glyph ?? appIcon.value.slice(0, 2).toUpperCase() ?? appName.slice(0, 1).toUpperCase();
  const colors = preset?.colors ?? ['#8e8e93', '#48484a'];
  return (
    <span
      className={`remote-app-icon ${className ?? ''}`}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`,
        fontSize: glyph.length > 1 ? size * 0.25 : size * 0.42,
      }}
    >
      {glyph}
    </span>
  );
}
