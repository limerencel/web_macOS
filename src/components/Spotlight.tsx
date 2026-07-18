/**
 * Spotlight — global app + file search overlay
 *
 * Triggered by Ctrl/Cmd+Space or the menu bar icon. Searches registered apps
 * by name and the VFS by filename. Selecting an app launches it; selecting a
 * file opens it in the appropriate app (text editor or image viewer).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getApps } from '../apps/registry';
import { useVFS } from '../store/vfsStore';
import type { VFSNode } from '../types/vfs';
import { GenericAppIcon } from './icons/AppIcons';

interface SpotlightProps {
  open: boolean;
  onClose: () => void;
  onLaunchApp: (appId: string, payload?: Record<string, unknown>) => void;
  onOpenFile: (node: VFSNode) => void;
}

interface ResultRow {
  kind: 'app' | 'file';
  id: string;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  payload?: Record<string, unknown>;
  fileNode?: VFSNode;
  appId?: string;
}

export function Spotlight({ open, onClose, onLaunchApp, onOpenFile }: SpotlightProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useVFS((s) => s.search);
  const getPath = useVFS((s) => s.getPath);

  const results = useMemo<ResultRow[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rows: ResultRow[] = [];
    for (const app of getApps()) {
      if (!app.searchable) continue;
      if (app.name.toLowerCase().includes(q) || app.id.toLowerCase().includes(q)) {
        rows.push({
          kind: 'app',
          id: `app-${app.id}`,
          title: app.name,
          subtitle: app.description,
          appId: app.id,
        });
      }
    }
    for (const node of search(query)) {
      rows.push({
        kind: 'file',
        id: `file-${node.id}`,
        title: node.name,
        subtitle: getPath(node.id),
        fileNode: node,
      });
    }
    return rows.slice(0, 10);
  }, [query, search, getPath]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  const launch = (row: ResultRow) => {
    if (row.kind === 'app' && row.appId) onLaunchApp(row.appId);
    else if (row.kind === 'file' && row.fileNode) onOpenFile(row.fileNode);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = results[selected];
      if (row) launch(row);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-start justify-center pt-[15vh] bg-black/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] mx-4 bg-white/90 dark:bg-neutral-800/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4">
          <svg width="20" height="20" viewBox="0 0 20 20" className="text-neutral-400 shrink-0">
            <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="13" y1="13" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search apps and files…"
            className="flex-1 bg-transparent px-3 py-3.5 text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none"
          />
        </div>
        {results.length > 0 && (
          <div className="border-t border-black/10 dark:border-white/10 max-h-72 overflow-y-auto py-1">
            {results.map((row, i) => (
              <button
                key={row.id}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left ${
                  i === selected ? 'bg-accent text-white' : 'text-neutral-800 dark:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => launch(row)}
              >
                <div className="shrink-0 w-7 h-7 flex items-center justify-center">
                  {row.kind === 'app' ? (
                    (() => {
                      const app = getApps().find((a) => a.id === row.appId);
                      return app ? <app.icon size={24} /> : <GenericAppIcon size={24} />;
                    })()
                  ) : row.fileNode?.mime?.startsWith('image/') ? (
                    <span className="text-lg">🖼️</span>
                  ) : (
                    <span className="text-lg">📄</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{row.title}</div>
                  <div className={`text-xs truncate ${i === selected ? 'text-white/70' : 'text-neutral-500'}`}>
                    {row.subtitle}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <div className="border-t border-black/10 dark:border-white/10 px-4 py-6 text-sm text-neutral-500 text-center">
            No results for “{query}”
          </div>
        )}
      </div>
    </div>
  );
}
