/**
 * App Icons — original SVG icons for each application
 *
 * All icons are generated as React components with no external assets,
 * using simple geometric shapes and gradients. They avoid any proprietary
 * iconography while remaining visually distinctive.
 */

import { useId, type ReactNode } from 'react';
import type { AppIconProps } from '../../apps/registry';

function SvgWrap({ className, size = 56, children }: AppIconProps & { children: ReactNode }) {
  const uid = useId().replace(/:/g, '');
  const r = 12.3; // ~22% of 56 — macOS squircle-ish corner
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: `${Math.round(size * 0.22)}px`, display: 'block', overflow: 'hidden' }}
    >
      <defs>
        <clipPath id={`sq-${uid}`}>
          <rect width="56" height="56" rx={r} ry={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#sq-${uid})`}>{children}</g>
    </svg>
  );
}

export const FinderIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <defs>
      <linearGradient id="finderGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7fd3ff" />
        <stop offset="1" stopColor="#2196f3" />
      </linearGradient>
    </defs>
    <rect width="56" height="56" rx="12" fill="url(#finderGrad)" />
    <circle cx="22" cy="24" r="2.6" fill="#fff" />
    <circle cx="34" cy="24" r="2.6" fill="#fff" />
    <path d="M22 32 Q28 38 34 32" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </SvgWrap>
);

export const CalculatorIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <rect width="56" height="56" rx="12" fill="#3a3a3c" />
    <rect x="8" y="8" width="40" height="12" rx="2" fill="#1c1c1e" />
    <text x="42" y="18" textAnchor="end" fill="#fff" fontSize="9" fontFamily="monospace">0</text>
    {[0, 1, 2].map((row) =>
      [0, 1, 2].map((col) => (
        <rect key={`${row}-${col}`} x={8 + col * 11} y={24 + row * 8} width="8" height="6" rx="1.5" fill="#636366" />
      ))
    )}
    <rect x="41" y="24" width="7" height="22" rx="1.5" fill="#ff9f0a" />
  </SvgWrap>
);

export const TerminalIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <rect width="56" height="56" rx="12" fill="#1c1c1e" />
    <rect x="6" y="8" width="44" height="40" rx="4" fill="#0a0a0a" stroke="#3a3a3c" strokeWidth="0.5" />
    <text x="11" y="22" fill="#30d158" fontSize="11" fontFamily="monospace" fontWeight="bold">&gt;_</text>
    <rect x="11" y="28" width="18" height="2" rx="1" fill="#5ac8fa" />
    <rect x="11" y="33" width="12" height="2" rx="1" fill="#5ac8fa" opacity="0.6" />
  </SvgWrap>
);

export const TextEditorIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <rect width="56" height="56" rx="12" fill="#f5f5f7" />
    <rect x="12" y="10" width="32" height="36" rx="2" fill="#fff" stroke="#d2d2d7" strokeWidth="0.5" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x="16" y={16 + i * 5} width={i === 5 ? 14 : 24} height="2" rx="1" fill="#86868b" />
    ))}
    <circle cx="44" cy="44" r="6" fill="#ff3b30" />
    <path d="M44 41 v6 M41 44 h6" stroke="#fff" strokeWidth="1.4" />
  </SvgWrap>
);

export const ImageViewerIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <defs>
      <linearGradient id="imgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9f0a" />
        <stop offset="1" stopColor="#ff2d55" />
      </linearGradient>
    </defs>
    <rect width="56" height="56" rx="12" fill="url(#imgGrad)" />
    <rect x="8" y="14" width="40" height="28" rx="3" fill="#fff" />
    <circle cx="18" cy="22" r="3" fill="#ffd60a" />
    <path d="M8 38 L20 28 L28 34 L40 22 L48 30 L48 42 L8 42 Z" fill="#34c759" />
  </SvgWrap>
);

export const SettingsIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <rect width="56" height="56" rx="12" fill="#8e8e93" />
    <g transform="translate(28 28)">
      <g fill="#fff">
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x="-2.5"
            y="-18"
            width="5"
            height="8"
            rx="1.5"
            transform={`rotate(${i * 45})`}
          />
        ))}
      </g>
      <circle r="11" fill="#fff" />
      <circle r="5" fill="#8e8e93" />
    </g>
  </SvgWrap>
);

export const AboutIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <defs>
      <linearGradient id="aboutGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5ac8fa" />
        <stop offset="1" stopColor="#007aff" />
      </linearGradient>
    </defs>
    <rect width="56" height="56" rx="12" fill="url(#aboutGrad)" />
    <text x="28" y="38" textAnchor="middle" fill="#fff" fontSize="28" fontFamily="-apple-system, sans-serif" fontWeight="300">i</text>
  </SvgWrap>
);

export const SpotlightIcon = ({ className, size }: AppIconProps) => (
  <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 18 18" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="7.5" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
    <line x1="11" y1="11" x2="15.5" y2="15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const FolderIcon = ({ className, size = 56 }: AppIconProps) => (
  <svg width={size} height={size * 0.78} viewBox="0 0 56 44" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="folderGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7fd3ff" />
        <stop offset="1" stopColor="#2196f3" />
      </linearGradient>
    </defs>
    <path d="M2 6 Q2 2 6 2 L20 2 L24 7 L50 7 Q54 7 54 11 L54 38 Q54 42 50 42 L6 42 Q2 42 2 38 Z" fill="url(#folderGrad)" />
    <path d="M2 12 L54 12 L54 38 Q54 42 50 42 L6 42 Q2 42 2 38 Z" fill="#5ac8fa" opacity="0.55" />
  </svg>
);

export const FileIcon = ({ className, size = 56 }: AppIconProps) => (
  <svg width={size} height={size * 1.25} viewBox="0 0 56 70" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2 L38 2 L54 18 L54 64 Q54 68 50 68 L8 68 Q4 68 4 64 L4 6 Q4 2 8 2 Z" fill="#fff" stroke="#c7c7cc" strokeWidth="0.8" />
    <path d="M38 2 L38 18 L54 18 Z" fill="#d1d1d6" />
    {[0, 1, 2, 3, 4].map((i) => (
      <rect key={i} x="12" y={30 + i * 6} width={i === 4 ? 20 : 32} height="2.4" rx="1.2" fill="#aeaeb2" />
    ))}
  </svg>
);

export const ImageIcon = ({ className, size = 56 }: AppIconProps) => (
  <svg width={size} height={size} viewBox="0 0 56 56" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="10" width="44" height="36" rx="4" fill="#fff" stroke="#c7c7cc" strokeWidth="0.8" />
    <circle cx="18" cy="22" r="3.5" fill="#ffd60a" />
    <path d="M6 42 L22 28 L30 34 L44 20 L50 26 L50 46 L6 46 Z" fill="#34c759" />
  </svg>
);

export const VideoIcon = ({ className, size = 56 }: AppIconProps) => (
  <svg width={size} height={size} viewBox="0 0 56 56" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="12" width="36" height="32" rx="4" fill="#1c1c1e" stroke="#636366" strokeWidth="1" />
    <polygon points="16,20 16,36 30,28" fill="#ff375f" />
    <path d="M40 20 L52 12 L52 44 L40 36 Z" fill="#ff9f0a" />
  </svg>
);

export const PreviewIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <defs>
      <linearGradient id="previewGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#bf5af2" />
        <stop offset="1" stopColor="#5e5ce6" />
      </linearGradient>
    </defs>
    <rect width="56" height="56" rx="12" fill="url(#previewGrad)" />
    <rect x="10" y="14" width="36" height="28" rx="3" fill="#fff" opacity="0.95" />
    <circle cx="20" cy="24" r="3" fill="#ffd60a" />
    <path d="M10 38 L22 28 L30 34 L40 22 L46 28 L46 42 L10 42 Z" fill="#5e5ce6" opacity="0.85" />
  </SvgWrap>
);

export const VideoPlayerIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <defs>
      <linearGradient id="vidGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff375f" />
        <stop offset="1" stopColor="#ff9f0a" />
      </linearGradient>
    </defs>
    <rect width="56" height="56" rx="12" fill="url(#vidGrad)" />
    <circle cx="28" cy="28" r="14" fill="#000" opacity="0.25" />
    <polygon points="24,18 24,38 40,28" fill="#fff" />
  </SvgWrap>
);

/** Generic app icon used by Spotlight when none is registered. */
export const GenericAppIcon = ({ className, size }: AppIconProps) => (
  <SvgWrap className={className} size={size}>
    <rect width="56" height="56" rx="12" fill="#8e8e93" />
    <text x="28" y="34" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="600">A</text>
  </SvgWrap>
);
