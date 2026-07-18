/**
 * Preview — full window image viewer for local + virtual files.
 * Zoom, rotate, fit-to-window, actual size, previous/next, set as wallpaper.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppWindowProps } from './registry';
import type { FSEntry } from '../types/fs';
import { isImageName, makeEntryId } from '../types/fs';
import { useFS } from '../store/fsStore';
import { useWindowManager } from '../store/windowManager';
import { useSettings } from '../store/settingsStore';
import { createTrackedObjectURL, revokeObjectURL } from '../services/objectUrlManager';
import { blobToDataURL } from '../services/fs/blobUtils';
import { notify } from '../store/notificationsStore';

type FitMode = 'fit' | 'actual';

export default function PreviewApp({ windowId, payload }: AppWindowProps) {
  const get = useFS((s) => s.get);
  const listSiblings = useFS((s) => s.listSiblings);
  const readBlob = useFS((s) => s.readBlob);
  const rememberFile = useFS((s) => s.rememberFile);
  const setTitle = useWindowManager((s) => s.setTitle);
  const setWallpaperImage = useSettings((s) => s.setWallpaperImage);

  const entryId = useMemo(() => resolveEntryId(payload), [payload]);

  const [currentId, setCurrentId] = useState<string | null>(entryId);
  const [entry, setEntry] = useState<FSEntry | null>(null);
  const [siblings, setSiblings] = useState<FSEntry[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [settingWallpaper, setSettingWallpaper] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (entryId) setCurrentId(entryId);
  }, [entryId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentId) {
        setError('No image specified');
        return;
      }
      setError(null);
      const er = await get(currentId);
      if (cancelled) return;
      if (!er.ok) {
        setEntry(null);
        setError(er.error);
        return;
      }
      setEntry(er.value);
      setTitle(windowId, `Preview — ${er.value.name}`);
      void rememberFile(er.value);

      const sibs = await listSiblings(currentId, (e) => isImageName(e.name, e.mime));
      if (!cancelled && sibs.ok) setSiblings(sibs.value);

      const blobR = await readBlob(currentId);
      if (cancelled) return;
      if (urlRef.current) {
        revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      if (!blobR.ok) {
        setUrl(null);
        setError(blobR.error);
        return;
      }
      const next = createTrackedObjectURL(windowId, blobR.value);
      urlRef.current = next;
      setUrl(next);
      setZoom(1);
      setRotation(0);
      setFitMode('fit');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [currentId, get, listSiblings, readBlob, rememberFile, setTitle, windowId]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  const index = siblings.findIndex((s) => s.id === currentId);

  const goPrev = useCallback(() => {
    if (siblings.length === 0) return;
    const i = index < 0 ? 0 : (index - 1 + siblings.length) % siblings.length;
    setCurrentId(siblings[i].id);
  }, [index, siblings]);

  const goNext = useCallback(() => {
    if (siblings.length === 0) return;
    const i = index < 0 ? 0 : (index + 1) % siblings.length;
    setCurrentId(siblings[i].id);
  }, [index, siblings]);

  const setAsWallpaper = useCallback(async () => {
    if (!currentId || settingWallpaper) return;
    setSettingWallpaper(true);
    try {
      const blobR = await readBlob(currentId);
      if (!blobR.ok) {
        notify('Preview', blobR.error);
        return;
      }
      // Cap very large images to avoid blowing IndexedDB quota
      if (blobR.value.size > 6 * 1024 * 1024) {
        notify('Preview', 'Image is too large to use as wallpaper (max ~6 MB).');
        return;
      }
      const dataUrl = await blobToDataURL(blobR.value);
      setWallpaperImage(dataUrl);
      notify('Desktop', `Wallpaper set to “${entry?.name ?? 'image'}”`, 3000);
    } catch (e) {
      notify('Preview', e instanceof Error ? e.message : 'Could not set wallpaper');
    } finally {
      setSettingWallpaper(false);
    }
  }, [currentId, entry?.name, readBlob, setWallpaperImage, settingWallpaper]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') {
        setFitMode('actual');
        setZoom((z) => Math.min(8, z + 0.25));
      } else if (e.key === '-') {
        setFitMode('actual');
        setZoom((z) => Math.max(0.1, z - 0.25));
      } else if (e.key === '0') {
        setFitMode('actual');
        setZoom(1);
      } else if (e.key === '1') {
        setFitMode('fit');
        setZoom(1);
      } else if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  if (error && !url) {
    return (
      <div
        className="h-full flex items-center justify-center bg-neutral-950 text-red-300 text-sm p-6 text-center"
        data-testid="preview"
      >
        <div>
          <div className="mb-2 font-medium">Unable to open image</div>
          <div className="text-neutral-400" data-testid="preview-error">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-950 text-white" data-testid="preview">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900 border-b border-white/10 text-xs flex-wrap">
        <button
          className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30"
          onClick={goPrev}
          data-testid="preview-prev"
          disabled={siblings.length < 2}
        >
          ◀ Prev
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30"
          onClick={goNext}
          data-testid="preview-next"
          disabled={siblings.length < 2}
        >
          Next ▶
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => {
            setFitMode('actual');
            setZoom((z) => Math.max(0.1, z - 0.25));
          }}
          data-testid="preview-zoom-out"
        >
          −
        </button>
        <span className="tabular-nums w-14 text-center" data-testid="preview-zoom-label">
          {fitMode === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </span>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => {
            setFitMode('actual');
            setZoom((z) => Math.min(8, z + 0.25));
          }}
          data-testid="preview-zoom-in"
        >
          +
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => {
            setFitMode('fit');
            setZoom(1);
          }}
          data-testid="preview-fit"
        >
          Fit
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => {
            setFitMode('actual');
            setZoom(1);
          }}
          data-testid="preview-actual"
        >
          Actual
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          data-testid="preview-rotate"
        >
          ⟳ Rotate
        </button>
        <button
          className="px-2 py-1 rounded bg-accent/90 hover:bg-accent text-white disabled:opacity-40 ml-auto"
          onClick={() => void setAsWallpaper()}
          disabled={!url || settingWallpaper}
          data-testid="preview-set-wallpaper"
          title="Use this image as the desktop wallpaper"
        >
          {settingWallpaper ? 'Setting…' : 'Set as Wallpaper'}
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black/50 p-4">
        {url && (
          <img
            src={url}
            alt={entry?.name ?? 'preview'}
            draggable={false}
            className="select-none"
            style={{
              transform: `scale(${fitMode === 'fit' ? 1 : zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.15s ease',
              maxHeight: fitMode === 'fit' ? '100%' : 'none',
              maxWidth: fitMode === 'fit' ? '100%' : 'none',
            }}
            data-testid="preview-image"
          />
        )}
      </div>
      <div className="px-3 py-1 text-xs text-neutral-400 border-t border-white/10 flex justify-between">
        <span className="truncate">{entry?.name ?? ''}</span>
        <span>{siblings.length ? `${Math.max(index, 0) + 1} / ${siblings.length}` : '—'}</span>
      </div>
    </div>
  );
}

function resolveEntryId(payload: Record<string, unknown> | undefined): string | null {
  if (typeof payload?.entryId === 'string') return payload.entryId;
  if (typeof payload?.fileId === 'string') {
    const fid = payload.fileId;
    if (fid.includes(':')) return fid;
    return makeEntryId('vfs', fid);
  }
  return null;
}
