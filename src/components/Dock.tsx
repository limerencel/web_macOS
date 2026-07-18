/**
 * Dock — bottom application launcher (macOS Sonoma/Sequoia style)
 *
 * Magnification grows from bottom-center and opens horizontal room via
 * animated margins so icons never overlap. Tooltips track the live
 * (post-scale) icon bounding rect without causing update loops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDockApps, getApp } from '../apps/registry';
import { useWindowManager } from '../store/windowManager';
import { useSettings } from '../store/settingsStore';

interface DockProps {
  onLaunch: (appId: string) => void;
}

const ICON_SIZE = 50;
/** Half of the resting gap between icons (full gap = 10px). */
const BASE_MARGIN = 5;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const TRANSITION_MS = 280;
const TRANSITION = `transform ${TRANSITION_MS}ms ${SPRING}, margin ${TRANSITION_MS}ms ${SPRING}`;

function scaleForDistance(dist: number): number {
  if (dist === 0) return 1.3;
  if (dist === 1) return 1.1;
  if (dist === 2) return 1.03;
  return 1;
}

/** Horizontal padding each side so scaled icon has exclusive layout room. */
function sideMargin(scale: number): number {
  const grow = (ICON_SIZE * (scale - 1)) / 2;
  return BASE_MARGIN + grow;
}

interface TipState {
  name: string;
  left: number;
  top: number;
}

function tipsEqual(a: TipState | null, b: TipState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5
  );
}

export function Dock({ onLaunch }: DockProps) {
  const apps = getDockApps();
  const windows = useWindowManager((s) => s.windows);
  const restore = useWindowManager((s) => s.restore);
  const focus = useWindowManager((s) => s.focus);
  const findByApp = useWindowManager((s) => s.findByApp);
  const reducedMotion = useSettings((s) => s.settings.reducedMotion);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [bouncingId, setBouncingId] = useState<string | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconStageRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hoveredIndexRef = useRef<number | null>(null);
  const bouncingIdRef = useRef<string | null>(null);
  const appsRef = useRef(apps);
  const tipRef = useRef<TipState | null>(null);

  hoveredIndexRef.current = hoveredIndex;
  bouncingIdRef.current = bouncingId;
  appsRef.current = apps;
  tipRef.current = tip;

  /** Measure magnified icon and update tip only when geometry actually changes. */
  const syncTooltip = useCallback(() => {
    const idx = hoveredIndexRef.current;
    const bounce = bouncingIdRef.current;
    if (idx === null || bounce) {
      if (tipRef.current !== null) {
        tipRef.current = null;
        setTip(null);
      }
      return;
    }
    const el = iconStageRefs.current[idx];
    const app = appsRef.current[idx];
    if (!el || !app) {
      if (tipRef.current !== null) {
        tipRef.current = null;
        setTip(null);
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    const next: TipState = {
      name: app.name,
      left: rect.left + rect.width / 2,
      top: rect.top - 8,
    };
    if (!tipsEqual(tipRef.current, next)) {
      tipRef.current = next;
      setTip(next);
    }
  }, []);

  // rAF loop only while hovering — reads refs, never recreates from render deps
  useEffect(() => {
    if (hoveredIndex === null) {
      if (tipRef.current !== null) {
        tipRef.current = null;
        setTip(null);
      }
      return;
    }

    let raf = 0;
    let active = true;
    const tick = () => {
      if (!active) return;
      syncTooltip();
      raf = requestAnimationFrame(tick);
    };
    // First paint after hover/margin transition starts
    syncTooltip();
    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [hoveredIndex, bouncingId, syncTooltip]);

  useEffect(() => {
    const onScrollOrResize = () => syncTooltip();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [syncTooltip]);

  const handleClick = useCallback(
    (appId: string) => {
      const app = getApp(appId);
      if (!app) return;

      if (!reducedMotion) {
        if (bounceTimer.current) clearTimeout(bounceTimer.current);
        setBouncingId(appId);
        tipRef.current = null;
        setTip(null);
        bounceTimer.current = setTimeout(() => setBouncingId(null), 520);
      }

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
    },
    [findByApp, focus, onLaunch, reducedMotion, restore]
  );

  return (
    <div
      className="dock-root"
      data-testid="dock"
      onMouseLeave={() => {
        setHoveredIndex(null);
        tipRef.current = null;
        setTip(null);
      }}
    >
      <div className="dock-shell">
        {apps.map((app, index) => {
          const running = windows.some((w) => w.appId === app.id);
          const dist =
            hoveredIndex === null || reducedMotion ? 99 : Math.abs(index - hoveredIndex);
          const scale = reducedMotion ? 1 : scaleForDistance(dist);
          const marginX = reducedMotion ? BASE_MARGIN : sideMargin(scale);
          const isBouncing = bouncingId === app.id && !reducedMotion;
          const isHovered = hoveredIndex === index;

          return (
            <button
              key={app.id}
              type="button"
              className={`dock-item${isHovered ? ' dock-item-hovered' : ''}`}
              onClick={() => handleClick(app.id)}
              onMouseEnter={() => setHoveredIndex(index)}
              aria-label={`Launch ${app.name}`}
              data-testid={`dock-item-${app.id}`}
              style={{
                marginLeft: marginX,
                marginRight: marginX,
                zIndex: isHovered ? 5 : isBouncing ? 4 : 1,
                transition: reducedMotion ? 'none' : TRANSITION,
              }}
            >
              <span
                ref={(el) => {
                  iconStageRefs.current[index] = el;
                }}
                className={`dock-icon-stage${isBouncing ? ' dock-icon-bounce' : ''}`}
                style={{
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                  transformOrigin: 'bottom center',
                  transform: isBouncing ? undefined : `scale(${scale})`,
                  transition: reducedMotion ? 'none' : `transform ${TRANSITION_MS}ms ${SPRING}`,
                }}
              >
                <span className="dock-icon-face">
                  <app.icon size={ICON_SIZE} className="dock-icon-svg" />
                  <span className="dock-icon-shine" aria-hidden />
                </span>
              </span>

              <span className={`dock-dot${running ? ' dock-dot-on' : ''}`} aria-hidden />
            </button>
          );
        })}
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="dock-tooltip-fixed"
            role="tooltip"
            style={{
              left: tip.left,
              top: tip.top,
            }}
          >
            {tip.name}
            <span className="dock-tooltip-arrow" aria-hidden />
          </div>,
          document.body
        )}
    </div>
  );
}
