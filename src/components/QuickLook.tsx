/**
 * Quick Look — lightweight Space-key overlay for images, video, and text.
 * Escape closes. Does not open a full app window.
 */

import { useEffect, useState } from 'react';
import type { FSEntry } from '../types/fs';
import { isImageName, isTextName, isVideoName } from '../types/fs';
import { useFS } from '../store/fsStore';
import { createTrackedObjectURL, revokeObjectURL } from '../services/objectUrlManager';

interface QuickLookProps {
  entry: FSEntry;
  onClose: () => void;
  /** Stable owner id for object URL tracking */
  ownerId?: string;
}

export function QuickLook({ entry, onClose, ownerId = 'quicklook' }: QuickLookProps) {
  const readText = useFS((s) => s.readText);
  const readBlob = useFS((s) => s.readBlob);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const kind = isImageName(entry.name, entry.mime)
    ? 'image'
    : isVideoName(entry.name, entry.mime)
      ? 'video'
      : isTextName(entry.name, entry.mime)
        ? 'text'
        : 'unknown';

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setText(null);
      setUrl(null);
      try {
        if (kind === 'text') {
          const r = await readText(entry.id);
          if (cancelled) return;
          if (!r.ok) {
            setError(r.error);
          } else {
            setText(r.value.slice(0, 100_000));
          }
        } else if (kind === 'image' || kind === 'video') {
          const r = await readBlob(entry.id);
          if (cancelled) return;
          if (!r.ok) {
            setError(r.error);
          } else {
            createdUrl = createTrackedObjectURL(ownerId, r.value);
            setUrl(createdUrl);
          }
        } else {
          setError('Quick Look is not available for this file type. Double-click to open.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (createdUrl) revokeObjectURL(createdUrl);
    };
  }, [entry.id, kind, ownerId, readBlob, readText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      data-testid="quick-look"
      role="dialog"
      aria-label={`Quick Look: ${entry.name}`}
    >
      <div
        className="relative max-w-[90vw] max-h-[85vh] w-auto bg-neutral-900 text-white rounded-xl shadow-2xl border border-white/10 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 text-sm bg-neutral-950/80">
          <span className="font-medium truncate pr-4">{entry.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-neutral-400">Space / Esc to close</span>
            <button
              className="px-2 py-0.5 rounded hover:bg-white/10"
              onClick={onClose}
              aria-label="Close Quick Look"
              data-testid="quick-look-close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 min-h-[200px] min-w-[320px] max-h-[75vh] overflow-auto">
          {loading && <div className="text-neutral-400 text-sm">Loading…</div>}
          {!loading && error && (
            <div className="text-red-300 text-sm max-w-md text-center" data-testid="quick-look-error">
              {error}
            </div>
          )}
          {!loading && !error && kind === 'image' && url && (
            <img
              src={url}
              alt={entry.name}
              className="max-w-full max-h-[70vh] object-contain"
              data-testid="quick-look-image"
            />
          )}
          {!loading && !error && kind === 'video' && url && (
            <video
              src={url}
              controls
              className="max-w-full max-h-[70vh]"
              data-testid="quick-look-video"
            />
          )}
          {!loading && !error && kind === 'text' && text !== null && (
            <pre
              className="text-xs font-mono whitespace-pre-wrap max-w-[70vw] max-h-[70vh] overflow-auto p-2"
              data-testid="quick-look-text"
            >
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
