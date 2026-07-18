/**
 * Finder — file manager with grid/list views and VFS navigation
 */

import { useEffect, useMemo, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';
import { useVFS } from '../store/vfsStore';
import { useWindowManager } from '../store/windowManager';
import { FolderIcon, FileIcon, ImageIcon } from '../components/icons/AppIcons';
import type { VFSNode } from '../types/vfs';
import { notify } from '../store/notificationsStore';

type ViewMode = 'grid' | 'list';

export default function FinderApp({ windowId, payload }: AppWindowProps) {
  const tree = useVFS((s) => s.tree);
  const mkdir = useVFS((s) => s.mkdir);
  const touch = useVFS((s) => s.touch);
  const remove = useVFS((s) => s.remove);
  const rename = useVFS((s) => s.rename);
  const getPath = useVFS((s) => s.getPath);
  const openWin = useWindowManager((s) => s.open);
  const setTitle = useWindowManager((s) => s.setTitle);

  const initialId =
    (typeof payload?.folderId === 'string' && payload.folderId) || tree.rootId;
  const [folderId, setFolderId] = useState(initialId);
  const [view, setView] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const folder = tree.nodes[folderId] ?? tree.nodes[tree.rootId];
  const currentId = folder?.id ?? tree.rootId;

  const children = useMemo(() => {
    return Object.values(tree.nodes)
      .filter((n) => n.parentId === currentId)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [tree, currentId]);

  // Build breadcrumb trail
  const trail: VFSNode[] = [];
  let cursor: VFSNode | undefined = tree.nodes[currentId];
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }

  const pathLabel = getPath(currentId) || '/';
  useEffect(() => {
    setTitle(windowId, `Finder — ${pathLabel === '/' ? 'Home' : pathLabel}`);
  }, [pathLabel, setTitle, windowId]);

  const openNode = (node: VFSNode) => {
    if (node.kind === 'folder') {
      setFolderId(node.id);
      setSelected(null);
      return;
    }
    if (node.mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(node.name)) {
      openWin({
        appId: 'image-viewer',
        title: node.name,
        width: 760,
        height: 540,
        payload: { fileId: node.id },
      });
      return;
    }
    openWin({
      appId: 'text-editor',
      title: node.name,
      width: 720,
      height: 520,
      payload: { fileId: node.id },
    });
  };

  const goUp = () => {
    const parent = tree.nodes[currentId]?.parentId;
    if (parent) setFolderId(parent);
  };

  const newFolder = () => {
    let name = 'Untitled Folder';
    let i = 1;
    while (children.some((c) => c.name === name)) {
      name = `Untitled Folder ${i++}`;
    }
    const r = mkdir(currentId, name);
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(r.value.id);
      setRenaming(r.value.id);
      setRenameValue(name);
    }
  };

  const newFile = () => {
    let name = 'Untitled.txt';
    let i = 1;
    while (children.some((c) => c.name === name)) {
      name = `Untitled ${i++}.txt`;
    }
    const r = touch(currentId, name);
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(r.value.id);
      setRenaming(r.value.id);
      setRenameValue(name);
    }
  };

  const deleteSelected = () => {
    if (!selected) return;
    const r = remove(selected);
    if (!r.ok) notify('Finder', r.error);
    else {
      setSelected(null);
      notify('Finder', 'Item moved to trash (deleted)');
    }
  };

  const commitRename = () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (name) {
      const r = rename(renaming, name);
      if (!r.ok) notify('Finder', r.error);
    }
    setRenaming(null);
  };

  const iconFor = (node: VFSNode) => {
    if (node.kind === 'folder') return <FolderIcon size={view === 'grid' ? 56 : 28} />;
    if (node.mime?.startsWith('image/')) return <ImageIcon size={view === 'grid' ? 48 : 28} />;
    return <FileIcon size={view === 'grid' ? 40 : 24} />;
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100" data-testid="finder">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-black/10 dark:border-white/10 bg-neutral-100/80 dark:bg-neutral-800/80">
        <button
          className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          onClick={goUp}
          disabled={!tree.nodes[currentId]?.parentId}
          aria-label="Go up"
        >
          ←
        </button>
        <div className="flex-1 flex items-center gap-1 overflow-x-auto text-xs">
          {trail.map((n, i) => (
            <button
              key={n.id}
              className="hover:underline shrink-0"
              onClick={() => setFolderId(n.id)}
            >
              {i === 0 ? 'Home' : n.name}
              {i < trail.length - 1 && <span className="mx-1 opacity-40">/</span>}
            </button>
          ))}
        </div>
        <button className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10" onClick={newFolder} data-testid="finder-new-folder">
          New Folder
        </button>
        <button className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10" onClick={newFile} data-testid="finder-new-file">
          New File
        </button>
        <button
          className="px-2 py-1 text-xs rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          onClick={deleteSelected}
          disabled={!selected}
          data-testid="finder-delete"
        >
          Delete
        </button>
        <div className="flex rounded overflow-hidden border border-black/10 dark:border-white/10">
          <button
            className={`px-2 py-1 text-xs ${view === 'grid' ? 'bg-accent text-white' : ''}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            className={`px-2 py-1 text-xs ${view === 'list' ? 'bg-accent text-white' : ''}`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3" onClick={() => setSelected(null)}>
        {children.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-neutral-400">
            This folder is empty
          </div>
        )}
        {view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
            {children.map((node) => (
              <button
                key={node.id}
                className={`flex flex-col items-center p-2 rounded-lg ${
                  selected === node.id ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
                onDoubleClick={() => openNode(node)}
                data-testid={`finder-item-${node.name}`}
              >
                {iconFor(node)}
                {renaming === node.id ? (
                  <input
                    className="mt-1 w-full text-xs text-center bg-white dark:bg-neutral-800 border border-accent rounded px-1"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="mt-1 text-xs text-center break-words w-full"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
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
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-black/10 dark:border-white/10">
                <th className="py-1 font-medium">Name</th>
                <th className="py-1 font-medium w-24">Kind</th>
                <th className="py-1 font-medium w-40">Modified</th>
              </tr>
            </thead>
            <tbody>
              {children.map((node) => (
                <tr
                  key={node.id}
                  className={`cursor-default ${selected === node.id ? 'bg-accent/20' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                  onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
                  onDoubleClick={() => openNode(node)}
                  data-testid={`finder-item-${node.name}`}
                >
                  <td className="py-1.5 flex items-center gap-2">
                    {iconFor(node)}
                    {renaming === node.id ? (
                      <input
                        className="text-xs bg-white dark:bg-neutral-800 border border-accent rounded px-1"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span>{node.name}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-neutral-500">{node.kind === 'folder' ? 'Folder' : 'File'}</td>
                  <td className="py-1.5 text-neutral-500 text-xs">
                    {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-3 py-1 text-xs text-neutral-500 border-t border-black/10 dark:border-white/10">
        {children.length} item{children.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
