/**
 * Finder — file manager with virtual + local mounts, Locations sidebar,
 * grid/list, sorting, breadcrumbs, refresh, Connect Folder, Quick Look.
 *
 * All filesystem access goes through useFS / FileSystemProvider — never
 * browser File System Access APIs directly.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';
import type { FSEntry, SortDirection, SortKey } from '../types/fs';
import { isImageName, isVideoName, makeEntryId } from '../types/fs';
import { useFS } from '../store/fsStore';
import { useWindowManager } from '../store/windowManager';
import { useVFS } from '../store/vfsStore';
import { FolderIcon, FileIcon, ImageIcon, VideoIcon } from '../components/icons/AppIcons';
import { QuickLook } from '../components/QuickLook';
import { notify } from '../store/notificationsStore';
import { canQuickLook } from '../services/fileAssociations';

type ViewMode = 'grid' | 'list';

function permissionBadge(state?: string): { label: string; className: string } {
  switch (state) {
    case 'connected':
      return { label: 'Connected', className: 'text-emerald-600 dark:text-emerald-400' };
    case 'permission-required':
      return { label: 'Permission needed', className: 'text-amber-600 dark:text-amber-400' };
    case 'unavailable':
      return { label: 'Unavailable', className: 'text-red-600 dark:text-red-400' };
    case 'disconnected':
      return { label: 'Disconnected', className: 'text-neutral-500' };
    default:
      return { label: '', className: '' };
  }
}

export default function FinderApp({ windowId, payload }: AppWindowProps) {
  const locations = useFS((s) => s.locations);
  const mounts = useFS((s) => s.mounts);
  const recentFiles = useFS((s) => s.recentFiles);
  const revision = useFS((s) => s.revision);
  const list = useFS((s) => s.list);
  const mkdir = useFS((s) => s.mkdir);
  const createFile = useFS((s) => s.createFile);
  const remove = useFS((s) => s.remove);
  const rename = useFS((s) => s.rename);
  const getBreadcrumbs = useFS((s) => s.getBreadcrumbs);
  const canWrite = useFS((s) => s.canWrite);
  const connectFolder = useFS((s) => s.connectFolder);
  const disconnectMount = useFS((s) => s.disconnectMount);
  const setMountWriteEnabled = useFS((s) => s.setMountWriteEnabled);
  const requestMountPermission = useFS((s) => s.requestMountPermission);
  const isLocalSupported = useFS((s) => s.isLocalSupported);
  const openEntry = useFS((s) => s.openEntry);
  const refresh = useFS((s) => s.refresh);
  const getVirtualRootId = useFS((s) => s.getVirtualRootId);
  const setTitle = useWindowManager((s) => s.setTitle);
  const vfsTree = useVFS((s) => s.tree);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [children, setChildren] = useState<FSEntry[]>([]);
  const [trail, setTrail] = useState<FSEntry[]>([]);
  const [view, setView] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [writable, setWritable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [quickLookEntry, setQuickLookEntry] = useState<FSEntry | null>(null);
  const [status, setStatus] = useState('');

  // Resolve initial folder
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof payload?.folderId === 'string') {
        const raw = payload.folderId;
        const id = raw.includes(':') ? raw : makeEntryId('vfs', raw);
        if (!cancelled) setFolderId(id);
        return;
      }
      const root = await getVirtualRootId();
      if (!cancelled) setFolderId(root);
    })();
    return () => {
      cancelled = true;
    };
  }, [payload?.folderId, getVirtualRootId]);

  const loadFolder = useCallback(async () => {
    if (!folderId) return;
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    const [listR, crumbsR, writeR] = await Promise.all([
      list(folderId, { sortBy, sortDir }),
      getBreadcrumbs(folderId),
      canWrite(folderId),
    ]);
    if (!listR.ok) {
      setChildren([]);
      setError(listR.error);
      setErrorCode(listR.code);
      setLoading(false);
      return;
    }
    setChildren(listR.value);
    setTrail(crumbsR.ok ? crumbsR.value : []);
    setWritable(writeR);
    setLoading(false);
    const name = crumbsR.ok && crumbsR.value.length ? crumbsR.value[crumbsR.value.length - 1].name : 'Finder';
    setTitle(windowId, `Finder — ${name || 'Home'}`);
  }, [folderId, list, getBreadcrumbs, canWrite, sortBy, sortDir, setTitle, windowId]);

  useEffect(() => {
    void loadFolder();
  }, [loadFolder, revision, vfsTree]);

  const selectedEntry = children.find((c) => c.id === selected) ?? null;
  const currentMountId =
    trail.find((t) => t.mountId)?.mountId ??
    (folderId?.startsWith('local:') ? folderId.split(':')[1] : undefined);
  const currentMount = mounts.find((m) => m.id === currentMountId);

  // Keyboard: Space = Quick Look, Enter = open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      // Don't steal Space from focused buttons/links
      if ((e.target as HTMLElement)?.closest?.('button, a, [role="button"]')) return;

      if (e.key === ' ' && selectedEntry && !quickLookEntry) {
        e.preventDefault();
        if (selectedEntry.kind === 'folder') return;
        if (!canQuickLook(selectedEntry.name, selectedEntry.mime)) {
          notify('Quick Look', 'No preview available for this file type');
          return;
        }
        setQuickLookEntry(selectedEntry);
        return;
      }
      if (e.key === 'Enter' && selectedEntry) {
        e.preventDefault();
        void openNode(selectedEntry);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        void refreshAndReload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openNode via selectedEntry
  }, [selectedEntry, quickLookEntry]);

  const openNode = async (node: FSEntry) => {
    if (node.kind === 'folder') {
      setFolderId(node.id);
      setSelected(null);
      return;
    }
    await openEntry(node);
  };

  const refreshAndReload = async () => {
    await refresh();
    await loadFolder();
    setStatus('Refreshed');
    setTimeout(() => setStatus(''), 1500);
  };

  const goUp = () => {
    if (trail.length >= 2) {
      setFolderId(trail[trail.length - 2].id);
      setSelected(null);
    }
  };

  const onConnectFolder = async () => {
    if (!isLocalSupported()) {
      notify(
        'Connect Folder',
        'Local folders need a Chromium-based browser with the File System Access API.'
      );
      return;
    }
    const r = await connectFolder(false);
    if (!r.ok) {
      if (r.code !== 'user-cancelled') notify('Connect Folder', r.error);
      return;
    }
    notify('Connect Folder', `Mounted “${r.value.name}” (read-only)`, 3000);
    setFolderId(`local:${r.value.id}:/`);
  };

  const onToggleWrite = async () => {
    if (!currentMountId || !currentMount) return;
    const next = !currentMount.writeEnabled;
    if (next) {
      const ok = window.confirm(
        'Enable write access for this mounted folder?\n\nWebOS can then create, edit, and delete files inside the folder you authorized. Default remains read-only.'
      );
      if (!ok) return;
    }
    const r = await setMountWriteEnabled(currentMountId, next);
    if (!r.ok) notify('Finder', r.error);
    else {
      notify('Finder', next ? 'Write access enabled' : 'Write access disabled (read-only)', 2500);
      await loadFolder();
    }
  };

  const onRequestPermission = async () => {
    if (!currentMountId) return;
    const r = await requestMountPermission(currentMountId);
    if (!r.ok) notify('Finder', r.error);
    else if (r.value !== 'connected') notify('Finder', 'Permission was not granted');
    await loadFolder();
  };

  const onDisconnect = async () => {
    if (!currentMountId || !currentMount) return;
    if (!window.confirm(`Disconnect “${currentMount.name}”? You can reconnect later.`)) return;
    await disconnectMount(currentMountId);
    const root = await getVirtualRootId();
    setFolderId(root);
    notify('Finder', 'Folder disconnected', 2000);
  };

  const newFolder = async () => {
    if (!folderId || !writable) {
      notify('Finder', 'This location is read-only');
      return;
    }
    let name = 'Untitled Folder';
    let i = 1;
    while (children.some((c) => c.name === name)) name = `Untitled Folder ${i++}`;
    const r = await mkdir(folderId, name);
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(r.value.id);
      setRenaming(r.value.id);
      setRenameValue(name);
      await loadFolder();
    }
  };

  const newFile = async () => {
    if (!folderId || !writable) {
      notify('Finder', 'This location is read-only');
      return;
    }
    let name = 'Untitled.txt';
    let i = 1;
    while (children.some((c) => c.name === name)) name = `Untitled ${i++}.txt`;
    const r = await createFile(folderId, name, '');
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(r.value.id);
      setRenaming(r.value.id);
      setRenameValue(name);
      await loadFolder();
    }
  };

  const deleteSelected = async () => {
    if (!selected || !selectedEntry) return;
    if (!writable) {
      notify('Finder', 'This location is read-only');
      return;
    }
    const label =
      selectedEntry.kind === 'folder'
        ? `Delete empty folder “${selectedEntry.name}”?\n\nNon-empty folders cannot be deleted in this version.`
        : `Delete “${selectedEntry.name}”? This cannot be undone.`;
    if (!window.confirm(label)) return;
    const r = await remove(selected);
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(null);
      notify('Finder', `Deleted ${selectedEntry.name}`, 2000);
      await loadFolder();
    }
  };

  const commitRename = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (name && name !== children.find((c) => c.id === renaming)?.name) {
      if (selectedEntry && folderId?.startsWith('local:')) {
        // bulk rename not supported; single confirm
        if (!window.confirm(`Rename to “${name}”?`)) {
          setRenaming(null);
          return;
        }
      }
      const r = await rename(renaming, name);
      if (!r.ok) notify('Finder', r.error);
      else await loadFolder();
    }
    setRenaming(null);
  };

  const iconFor = (node: FSEntry) => {
    const size = view === 'grid' ? 56 : 28;
    if (node.kind === 'folder') return <FolderIcon size={size} />;
    if (isImageName(node.name, node.mime)) return <ImageIcon size={view === 'grid' ? 48 : 28} />;
    if (isVideoName(node.name, node.mime)) return <VideoIcon size={view === 'grid' ? 48 : 28} />;
    return <FileIcon size={view === 'grid' ? 40 : 24} />;
  };

  const formatSize = (n?: number) => {
    if (n == null) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const favorites = locations.filter((l) => l.kind !== 'local-mount');
  const localLocs = locations.filter((l) => l.kind === 'local-mount');

  return (
    <div
      className="h-full flex bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
      data-testid="finder"
    >
      {/* Sidebar */}
      <aside
        className="w-44 shrink-0 border-r border-black/10 dark:border-white/10 bg-neutral-100/90 dark:bg-neutral-850 dark:bg-neutral-800/60 flex flex-col text-xs overflow-y-auto"
        data-testid="finder-sidebar"
      >
        <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
          Favorites
        </div>
        {favorites.map((loc) => (
          <button
            key={loc.id}
            className={`mx-1 px-2 py-1.5 rounded text-left truncate ${
              folderId === loc.entryId ? 'bg-accent/20 text-accent' : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            onClick={() => {
              setFolderId(loc.entryId);
              setSelected(null);
            }}
            data-testid={`finder-loc-${loc.name}`}
          >
            {loc.name}
          </button>
        ))}

        <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-neutral-500 font-semibold flex items-center justify-between">
          <span>Locations</span>
        </div>
        {localLocs.length === 0 && (
          <div className="px-3 py-1 text-neutral-400">No local folders</div>
        )}
        {localLocs.map((loc) => {
          const badge = permissionBadge(loc.permissionState);
          return (
            <button
              key={loc.id}
              className={`mx-1 px-2 py-1.5 rounded text-left ${
                folderId === loc.entryId || folderId?.includes(loc.mountId ?? '')
                  ? 'bg-accent/20 text-accent'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              onClick={() => {
                setFolderId(loc.entryId);
                setSelected(null);
              }}
              data-testid={`finder-mount-${loc.mountId}`}
              title={badge.label}
            >
              <div className="truncate font-medium">{loc.name}</div>
              <div className={`text-[10px] ${badge.className}`}>
                {badge.label}
                {loc.writeEnabled ? ' · Write' : ' · Read-only'}
              </div>
            </button>
          );
        })}

        <div className="mt-auto p-2 space-y-1 border-t border-black/10 dark:border-white/10">
          <button
            className="w-full px-2 py-1.5 rounded bg-accent text-white hover:brightness-110"
            onClick={() => void onConnectFolder()}
            data-testid="finder-connect-folder"
          >
            Connect Folder…
          </button>
          {recentFiles.length > 0 && (
            <div className="pt-2">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
                Recent
              </div>
              {recentFiles.slice(0, 5).map((r) => (
                <button
                  key={r.entryId + r.openedAt}
                  className="w-full px-1 py-1 rounded text-left truncate hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() =>
                    void openEntry({
                      id: r.entryId,
                      name: r.name,
                      kind: 'file',
                      parentId: null,
                      providerId: r.providerId,
                      mountId: r.mountId,
                      path: r.path,
                      mime: r.mime,
                      writable: false,
                    })
                  }
                  title={r.path}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-black/10 dark:border-white/10 bg-neutral-100/80 dark:bg-neutral-800/80">
          <button
            className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
            onClick={goUp}
            disabled={trail.length < 2}
            aria-label="Go up"
            data-testid="finder-up"
          >
            ←
          </button>
          <button
            className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => void refreshAndReload()}
            aria-label="Refresh"
            data-testid="finder-refresh"
            title="Refresh"
          >
            ↻
          </button>
          <div className="flex-1 flex items-center gap-1 overflow-x-auto text-xs" data-testid="finder-breadcrumbs">
            {trail.map((n, i) => (
              <button
                key={n.id}
                className="hover:underline shrink-0"
                onClick={() => setFolderId(n.id)}
              >
                {i === 0 && !n.mountId ? 'Home' : n.name}
                {i < trail.length - 1 && <span className="mx-1 opacity-40">/</span>}
              </button>
            ))}
          </div>

          {currentMount && (
            <div className="flex items-center gap-1 text-xs">
              {(currentMount.permissionState === 'permission-required' ||
                errorCode === 'permission-denied') && (
                <button
                  className="px-2 py-1 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  onClick={() => void onRequestPermission()}
                  data-testid="finder-request-permission"
                >
                  Grant Access
                </button>
              )}
              <button
                className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => void onToggleWrite()}
                data-testid="finder-toggle-write"
                title="Toggle write access"
              >
                {currentMount.writeEnabled ? 'Writable' : 'Read-only'}
              </button>
              <button
                className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-red-600"
                onClick={() => void onDisconnect()}
                data-testid="finder-disconnect"
              >
                Disconnect
              </button>
            </div>
          )}

          <button
            className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
            onClick={() => void newFolder()}
            disabled={!writable}
            data-testid="finder-new-folder"
          >
            New Folder
          </button>
          <button
            className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
            onClick={() => void newFile()}
            disabled={!writable}
            data-testid="finder-new-file"
          >
            New File
          </button>
          <button
            className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
            onClick={() => void deleteSelected()}
            disabled={!selected || !writable}
            data-testid="finder-delete"
          >
            Delete
          </button>

          <select
            className="text-xs rounded border border-black/10 dark:border-white/10 bg-transparent px-1 py-1"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [b, d] = e.target.value.split(':') as [SortKey, SortDirection];
              setSortBy(b);
              setSortDir(d);
            }}
            data-testid="finder-sort"
          >
            <option value="name:asc">Name ↑</option>
            <option value="name:desc">Name ↓</option>
            <option value="modified:desc">Modified ↓</option>
            <option value="modified:asc">Modified ↑</option>
            <option value="size:desc">Size ↓</option>
            <option value="kind:asc">Kind</option>
          </select>

          <div className="flex rounded overflow-hidden border border-black/10 dark:border-white/10">
            <button
              className={`px-2 py-1 text-xs ${view === 'grid' ? 'bg-accent text-white' : ''}`}
              onClick={() => setView('grid')}
              data-testid="finder-view-grid"
            >
              Grid
            </button>
            <button
              className={`px-2 py-1 text-xs ${view === 'list' ? 'bg-accent text-white' : ''}`}
              onClick={() => setView('list')}
              data-testid="finder-view-list"
            >
              List
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto p-3"
          onClick={() => setSelected(null)}
          data-testid="finder-content"
        >
          {loading && (
            <div className="h-full flex items-center justify-center text-sm text-neutral-400">Loading…</div>
          )}
          {!loading && error && (
            <div
              className="h-full flex flex-col items-center justify-center text-sm text-center px-6 gap-3"
              data-testid="finder-error"
            >
              <div className="text-neutral-500 max-w-md">{error}</div>
              {(errorCode === 'permission-denied' ||
                currentMount?.permissionState === 'permission-required') && (
                <button
                  className="px-3 py-1.5 rounded bg-accent text-white"
                  onClick={() => void onRequestPermission()}
                  data-testid="finder-error-grant"
                >
                  Grant Access
                </button>
              )}
              {errorCode === 'unavailable' && (
                <button
                  className="px-3 py-1.5 rounded border border-black/10 dark:border-white/10"
                  onClick={() => void onConnectFolder()}
                >
                  Connect a different folder
                </button>
              )}
            </div>
          )}
          {!loading && !error && children.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-neutral-400">
              This folder is empty
            </div>
          )}
          {!loading && !error && view === 'grid' && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
              {children.map((node) => (
                <button
                  key={node.id}
                  className={`flex flex-col items-center p-2 rounded-lg ${
                    selected === node.id
                      ? 'bg-accent/20 ring-1 ring-accent'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(node.id);
                  }}
                  onDoubleClick={() => void openNode(node)}
                  data-testid={`finder-item-${node.name}`}
                >
                  {iconFor(node)}
                  {renaming === node.id ? (
                    <input
                      className="mt-1 w-full text-xs text-center bg-white dark:bg-neutral-800 border border-accent rounded px-1"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="mt-1 text-xs text-center break-words w-full"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!writable) return;
                        setRenaming(node.id);
                        setRenameValue(node.name);
                      }}
                    >
                      {node.name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {!loading && !error && view === 'list' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-black/10 dark:border-white/10">
                  <th className="py-1 font-medium">Name</th>
                  <th className="py-1 font-medium w-24">Kind</th>
                  <th className="py-1 font-medium w-24">Size</th>
                  <th className="py-1 font-medium w-40">Modified</th>
                </tr>
              </thead>
              <tbody>
                {children.map((node) => (
                  <tr
                    key={node.id}
                    className={`cursor-default ${
                      selected === node.id ? 'bg-accent/20' : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(node.id);
                    }}
                    onDoubleClick={() => void openNode(node)}
                    data-testid={`finder-item-${node.name}`}
                  >
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        {iconFor(node)}
                        {renaming === node.id ? (
                          <input
                            className="text-xs bg-white dark:bg-neutral-800 border border-accent rounded px-1"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void commitRename()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename();
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span>{node.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 text-neutral-500">
                      {node.kind === 'folder' ? 'Folder' : node.mime || 'File'}
                    </td>
                    <td className="py-1.5 text-neutral-500 text-xs">
                      {node.kind === 'folder' ? '—' : formatSize(node.size)}
                    </td>
                    <td className="py-1.5 text-neutral-500 text-xs">
                      {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-3 py-1 text-xs text-neutral-500 border-t border-black/10 dark:border-white/10 flex justify-between">
          <span>
            {children.length} item{children.length === 1 ? '' : 's'}
            {!writable ? ' · Read-only' : ''}
            {status ? ` · ${status}` : ''}
          </span>
          <span className="text-neutral-400">Space: Quick Look</span>
        </div>
      </div>

      {quickLookEntry && (
        <QuickLook entry={quickLookEntry} onClose={() => setQuickLookEntry(null)} ownerId={`ql-${windowId}`} />
      )}
    </div>
  );
}
