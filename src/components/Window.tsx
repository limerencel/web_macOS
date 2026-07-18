/**
 * Window — single window container with drag + resize
 *
 * Handles pointer-based dragging of the title bar and 8-directional resize
 * handles. Subscribes to the window manager store for position/size and calls
 * store actions on interaction. The window content (app component) is mounted
 * as a child.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useWindowManager, type WindowState } from '../store/windowManager';
import { useSettings } from '../store/settingsStore';

interface WindowProps {
  win: WindowState;
  children: React.ReactNode;
}

type DragMode = 'move' | 'resize' | null;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  /** Which resize handle is active */
  handle: string;
}

const MIN_W = 280;
const MIN_H = 200;

const RESIZE_HANDLES = [
  { id: 'n', className: 'top-0 left-2 right-2 h-1 cursor-ns-resize' },
  { id: 's', className: 'bottom-0 left-2 right-2 h-1 cursor-ns-resize' },
  { id: 'e', className: 'right-0 top-2 bottom-2 w-1 cursor-ew-resize' },
  { id: 'w', className: 'left-0 top-2 bottom-2 w-1 cursor-ew-resize' },
  { id: 'ne', className: 'top-0 right-0 w-2 h-2 cursor-nesw-resize' },
  { id: 'nw', className: 'top-0 left-0 w-2 h-2 cursor-nwse-resize' },
  { id: 'se', className: 'bottom-0 right-0 w-2 h-2 cursor-nwse-resize' },
  { id: 'sw', className: 'bottom-0 left-0 w-2 h-2 cursor-nesw-resize' },
];

export function Window({ win, children }: WindowProps) {
  const { focus, close, minimize, toggleMaximize, move, resize } = useWindowManager();
  const reducedMotion = useSettings((s) => s.settings.reducedMotion);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef<number | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.mode === 'move') {
        const maxX = window.innerWidth - 100;
        const maxY = window.innerHeight - 60;
        const nx = Math.max(-drag.origW + 100, Math.min(maxX, drag.origX + dx));
        const ny = Math.max(28, Math.min(maxY, drag.origY + dy));
        // Use rAF to throttle store updates during drag
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => move(win.id, nx, ny));
      } else if (drag.mode === 'resize') {
        let { origX: x, origY: y, origW: w, origH: h } = drag;
        if (drag.handle.includes('e')) w = Math.max(MIN_W, drag.origW + dx);
        if (drag.handle.includes('s')) h = Math.max(MIN_H, drag.origH + dy);
        if (drag.handle.includes('w')) {
          const newW = Math.max(MIN_W, drag.origW - dx);
          x = drag.origX + (drag.origW - newW);
          w = newW;
        }
        if (drag.handle.includes('n')) {
          const newH = Math.max(MIN_H, drag.origH - dy);
          y = Math.max(28, drag.origY + (drag.origH - newH));
          h = newH;
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => resize(win.id, w, h, x, y));
      }
    },
    [move, resize, win.id]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onPointerMove, onPointerUp]);

  const startDrag = (e: React.PointerEvent, mode: DragMode, handle = '') => {
    if (win.maximized && mode === 'move') return;
    e.preventDefault();
    focus(win.id);
    dragRef.current = {
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
      origW: win.width,
      origH: win.height,
    };
    setIsDragging(true);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  if (win.minimized) return null;

  // Maximized windows fill below the menu bar
  const style: React.CSSProperties = win.maximized
    ? { left: 0, top: 28, width: '100vw', height: 'calc(100vh - 28px - 70px)', zIndex: win.zIndex }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      className={`absolute flex flex-col overflow-hidden bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl rounded-xl ${
        isDragging && !reducedMotion ? '' : 'transition-[box-shadow]'
      } ${reducedMotion ? '' : 'animate-scale-in'}`}
      style={style}
      onPointerDown={() => focus(win.id)}
      role="dialog"
      aria-label={win.title}
    >
      {/* Title bar */}
      <div
        className="flex items-center h-8 pl-3 pr-2 select-none bg-neutral-100/80 dark:bg-neutral-900/80 border-b border-black/5 dark:border-white/5 cursor-default relative z-20"
        onPointerDown={(e) => {
          // Only start drag from empty title-bar chrome, not buttons
          const t = e.target as HTMLElement;
          if (t.closest('button')) return;
          startDrag(e, 'move');
        }}
        onDoubleClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('button')) return;
          toggleMaximize(win.id);
        }}
      >
        <div className="flex items-center gap-2 group relative z-30">
          <button
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); close(win.id); }}
            className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 flex items-center justify-center"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-60" viewBox="0 0 8 8">
              <path d="M1 1 L7 7 M7 1 L1 7" stroke="#000" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            aria-label="Minimize"
            onClick={(e) => { e.stopPropagation(); minimize(win.id); }}
            className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 flex items-center justify-center"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-60" viewBox="0 0 8 8">
              <path d="M1 4 L7 4" stroke="#000" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            aria-label="Maximize"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
            className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 flex items-center justify-center"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-60" viewBox="0 0 8 8">
              <path d="M2 2 L6 2 L6 6 Z M2 2 L6 6" stroke="#000" strokeWidth="1" fill="none" />
            </svg>
          </button>
        </div>
        <div className="flex-1 text-center text-xs font-medium text-neutral-700 dark:text-neutral-200 pointer-events-none truncate px-2">
          {win.title}
        </div>
        <div className="w-12" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<div className="p-4 text-sm text-neutral-500">Loading…</div>}>
          {children}
        </Suspense>
      </div>

      {/* Resize handles (only when not maximized) */}
      {!win.maximized &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.id}
            className={`absolute ${h.className} z-10`}
            onPointerDown={(e) => startDrag(e, 'resize', h.id)}
          />
        ))}
    </div>
  );
}
