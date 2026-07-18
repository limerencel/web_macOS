/**
 * Image Viewer — bundled + uploaded images, zoom, rotation, prev/next, fullscreen
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';
import { useVFS } from '../store/vfsStore';
import { useWindowManager } from '../store/windowManager';
import { notify } from '../store/notificationsStore';

/** Bundled sample images as inline SVG data URLs (no external assets). */
export const BUNDLED_IMAGES: { id: string; name: string; src: string }[] = [
  {
    id: 'sample-mountains',
    name: 'Mountains.svg',
    src:
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2a6c"/><stop offset="1" stop-color="#b21f1f"/></linearGradient></defs>
          <rect width="800" height="500" fill="url(#sky)"/>
          <circle cx="620" cy="90" r="40" fill="#fdbb2d"/>
          <polygon points="0,500 200,220 360,500" fill="#2c3e50"/>
          <polygon points="200,500 420,160 680,500" fill="#34495e"/>
          <polygon points="480,500 700,250 800,500" fill="#1c2833"/>
          <rect y="420" width="800" height="80" fill="#1a252f" opacity="0.6"/>
        </svg>`
      ),
  },
  {
    id: 'sample-abstract',
    name: 'Abstract.svg',
    src:
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <rect width="800" height="500" fill="#0f2027"/>
          <circle cx="200" cy="200" r="140" fill="#00b09b" opacity="0.8"/>
          <circle cx="480" cy="280" r="180" fill="#96c93d" opacity="0.7"/>
          <circle cx="620" cy="120" r="90" fill="#fdbb2d" opacity="0.85"/>
          <rect x="100" y="360" width="600" height="40" rx="20" fill="#fff" opacity="0.15"/>
        </svg>`
      ),
  },
  {
    id: 'sample-night',
    name: 'Night Sky.svg',
    src:
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <defs><radialGradient id="n" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#1B2735"/><stop offset="1" stop-color="#090A0F"/></radialGradient></defs>
          <rect width="800" height="500" fill="url(#n)"/>
          ${Array.from({ length: 40 }, (_, i) => {
            const x = (i * 97) % 800;
            const y = (i * 53) % 400;
            const r = 0.8 + (i % 3) * 0.6;
            return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`;
          }).join('')}
          <circle cx="640" cy="100" r="28" fill="#f5f5dc" opacity="0.9"/>
        </svg>`
      ),
  },
];

interface GalleryItem {
  id: string;
  name: string;
  src: string;
  fromVfs?: boolean;
}

export default function ImageViewerApp({ windowId, payload }: AppWindowProps) {
  const tree = useVFS((s) => s.tree);
  const touch = useVFS((s) => s.touch);
  const write = useVFS((s) => s.write);
  const setTitle = useWindowManager((s) => s.setTitle);

  const gallery = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = BUNDLED_IMAGES.map((b) => ({ ...b }));
    for (const node of Object.values(tree.nodes)) {
      if (node.kind !== 'file') continue;
      const isImg =
        node.mime?.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(node.name);
      if (!isImg) continue;
      if (node.content?.startsWith('data:image') || node.content?.startsWith('blob:')) {
        items.push({ id: node.id, name: node.name, src: node.content, fromVfs: true });
      } else if (node.content?.startsWith('<svg') || node.content?.includes('xmlns="http://www.w3.org/2000/svg"')) {
        items.push({
          id: node.id,
          name: node.name,
          src: 'data:image/svg+xml,' + encodeURIComponent(node.content),
          fromVfs: true,
        });
      }
    }
    return items;
  }, [tree]);

  const initialIndex = useMemo(() => {
    const fid = typeof payload?.fileId === 'string' ? payload.fileId : null;
    if (fid) {
      const i = gallery.findIndex((g) => g.id === fid);
      if (i >= 0) return i;
    }
    return 0;
  }, [payload?.fileId, gallery]);

  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const current = gallery[index] ?? gallery[0];

  useEffect(() => {
    if (current) setTitle(windowId, `Photos — ${current.name}`);
  }, [current, setTitle, windowId]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + gallery.length) % gallery.length);
    setZoom(1);
    setRotation(0);
  }, [gallery.length]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % gallery.length);
    setZoom(1);
    setRotation(0);
  }, [gallery.length]);

  const toggleFs = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z - 0.25));
      else if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
      else if (e.key === 'f' || e.key === 'F') void toggleFs();
      else if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, toggleFs]);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const pics = Object.values(tree.nodes).find(
      (n) => n.parentId === tree.rootId && n.name === 'Pictures'
    );
    const parentId = pics?.id ?? tree.rootId;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await readAsDataURL(file);
      let name = file.name;
      let i = 1;
      const siblings = Object.values(useVFS.getState().tree.nodes).filter((n) => n.parentId === parentId);
      while (siblings.some((s) => s.name === name)) {
        const base = file.name.replace(/(\.[^.]+)?$/, '');
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
        name = `${base} ${i++}${ext}`;
      }
      const created = touch(parentId, name);
      if (created.ok) {
        const node = created.value;
        node.mime = file.type;
        write(node.id, dataUrl);
        // Patch mime onto the node via write then manual — store write only sets content.
        // Update mime by rewriting through tree clone is already done; set mime on store:
        useVFS.setState((s) => {
          const n = s.tree.nodes[node.id];
          if (n) n.mime = file.type;
          return { tree: { ...s.tree, nodes: { ...s.tree.nodes } } };
        });
        notify('Photos', `Imported ${name}`, 2500);
      }
    }
  };

  if (!current) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500" data-testid="image-viewer">
        No images available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-neutral-950 text-white"
      data-testid="image-viewer"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900 border-b border-white/10 text-xs flex-wrap">
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={prev} data-testid="img-prev">◀ Prev</button>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={next} data-testid="img-next">Next ▶</button>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} data-testid="img-zoom-out">−</button>
        <span className="tabular-nums w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} data-testid="img-zoom-in">+</button>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={() => setRotation((r) => (r + 90) % 360)} data-testid="img-rotate">⟳ Rotate</button>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={() => { setZoom(1); setRotation(0); }}>Reset</button>
        <button className="px-2 py-1 rounded hover:bg-white/10" onClick={() => void toggleFs()} data-testid="img-fullscreen">
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button className="px-2 py-1 rounded hover:bg-white/10 ml-auto" onClick={() => fileInputRef.current?.click()} data-testid="img-upload">
          Upload…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void onUpload(e.target.files)}
        />
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black/40 p-4">
        <img
          src={current.src}
          alt={current.name}
          draggable={false}
          className="max-w-none select-none"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease',
            maxHeight: zoom === 1 ? '100%' : 'none',
            maxWidth: zoom === 1 ? '100%' : 'none',
          }}
          data-testid="img-display"
        />
      </div>
      <div className="px-3 py-1 text-xs text-neutral-400 border-t border-white/10 flex justify-between">
        <span>{current.name}</span>
        <span>
          {index + 1} / {gallery.length}
        </span>
      </div>
    </div>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
