/**
 * Video Player — play local / virtual browser-supported video files.
 * Play/pause, seek, volume, mute, fullscreen, speed, previous/next.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppWindowProps } from './registry';
import type { FSEntry } from '../types/fs';
import { isVideoName, makeEntryId } from '../types/fs';
import { useFS } from '../store/fsStore';
import { useWindowManager } from '../store/windowManager';
import { createTrackedObjectURL, revokeObjectURL } from '../services/objectUrlManager';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayerApp({ windowId, payload }: AppWindowProps) {
  const get = useFS((s) => s.get);
  const listSiblings = useFS((s) => s.listSiblings);
  const readBlob = useFS((s) => s.readBlob);
  const rememberFile = useFS((s) => s.rememberFile);
  const setTitle = useWindowManager((s) => s.setTitle);

  const entryId = useMemo(() => resolveEntryId(payload), [payload]);
  const [currentId, setCurrentId] = useState<string | null>(entryId);
  const [entry, setEntry] = useState<FSEntry | null>(null);
  const [siblings, setSiblings] = useState<FSEntry[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (entryId) setCurrentId(entryId);
  }, [entryId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentId) {
        setError('No video specified');
        return;
      }
      setError(null);
      setPlaying(false);
      const er = await get(currentId);
      if (cancelled) return;
      if (!er.ok) {
        setEntry(null);
        setError(er.error);
        return;
      }
      setEntry(er.value);
      setTitle(windowId, `Video — ${er.value.name}`);
      void rememberFile(er.value);

      const sibs = await listSiblings(currentId, (e) => isVideoName(e.name, e.mime));
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
      setCurrentTime(0);
      setDuration(0);
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

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = speed;
  }, [volume, muted, speed, url]);

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

  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
        setPlaying(true);
      } else {
        v.pause();
        setPlaying(false);
      }
    } catch {
      setError('Playback failed — format may be unsupported in this browser');
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }, []);

  const formatTime = (t: number) => {
    if (!Number.isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (error && !url) {
    return (
      <div
        className="h-full flex items-center justify-center bg-neutral-950 text-red-300 text-sm p-6 text-center"
        data-testid="video-player"
      >
        <div>
          <div className="mb-2 font-medium">Unable to open video</div>
          <div className="text-neutral-400" data-testid="video-player-error">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-neutral-950 text-white"
      data-testid="video-player"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900 border-b border-white/10 text-xs flex-wrap">
        <button
          className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30"
          onClick={goPrev}
          data-testid="video-prev"
          disabled={siblings.length < 2}
        >
          ◀ Prev
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => void togglePlay()}
          data-testid="video-play-pause"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30"
          onClick={goNext}
          data-testid="video-next"
          disabled={siblings.length < 2}
        >
          Next ▶
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-white/10"
          onClick={() => setMuted((m) => !m)}
          data-testid="video-mute"
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <label className="flex items-center gap-1 px-1">
          <span className="text-neutral-400">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (v > 0) setMuted(false);
            }}
            className="w-20"
            data-testid="video-volume"
          />
        </label>
        <label className="flex items-center gap-1 px-1">
          <span className="text-neutral-400">Speed</span>
          <select
            className="bg-neutral-800 rounded px-1 py-0.5"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            data-testid="video-speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <button
          className="px-2 py-1 rounded hover:bg-white/10 ml-auto"
          onClick={() => void toggleFullscreen()}
          data-testid="video-fullscreen"
        >
          Fullscreen
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center bg-black relative min-h-0">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            className="max-w-full max-h-full"
            data-testid="video-element"
            onClick={() => void togglePlay()}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
            onError={() =>
              setError('This video cannot be played in the browser (codec/container unsupported).')
            }
          />
        ) : (
          <div className="text-neutral-500 text-sm">Loading…</div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-white/10 space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const t = Number(e.target.value);
            setCurrentTime(t);
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          className="w-full"
          data-testid="video-seek"
        />
        <div className="flex justify-between text-xs text-neutral-400">
          <span className="truncate pr-2">{entry?.name ?? ''}</span>
          <span className="tabular-nums shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
            {siblings.length > 0 ? ` · ${Math.max(index, 0) + 1}/${siblings.length}` : ''}
          </span>
        </div>
        {error && (
          <div className="text-amber-300 text-xs" data-testid="video-player-error">
            {error}
          </div>
        )}
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
