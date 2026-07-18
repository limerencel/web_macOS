/**
 * Desktop — wallpaper, desktop icons, and right-click context menu
 *
 * Renders the wallpaper background, a grid of desktop icons (read from the
 * Desktop folder in the VFS), and a custom context menu (right-click).
 * Double-clicking a folder opens it in Finder; double-clicking a file opens it
 * in the appropriate app.
 */

import { useEffect, useState } from 'react';
import { useVFS } from '../store/vfsStore';
import { FolderIcon, FileIcon, ImageIcon } from './icons/AppIcons';
import type { VFSNode } from '../types/vfs';

interface DesktopProps {
  onOpenFolder: (nodeId: string) => void;
  onOpenFile: (node: VFSNode) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onChangeWallpaper: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
}

interface ContextMenu {
  x: number;
  y: number;
}

export function Desktop(props: DesktopProps) {
  const { onOpenFolder, onOpenFile, onNewFolder, onNewFile, onChangeWallpaper, onOpenSettings, onOpenTerminal } = props;
  const tree = useVFS((s) => s.tree);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);

  // Find Desktop folder and list its children reactively (re-derives on tree change)
  const desktopFolder = Object.values(tree.nodes).find(
    (n) => n.parentId === tree.rootId && n.name === 'Desktop'
  );
  const desktopItems: VFSNode[] = desktopFolder
    ? Object.values(tree.nodes)
        .filter((n) => n.parentId === desktopFolder.id)
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
    : [];

  useEffect(() => {
    if (!menu) return;
    const onClick = () => setMenu(null);
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'var(--wallpaper)' }}
      onContextMenu={handleContextMenu}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelectedId(null);
      }}
    >
      {/* Desktop icons grid (right-aligned column like macOS) */}
      <div
        className="absolute top-9 right-3 flex flex-col flex-wrap-reverse gap-1 items-end"
        style={{ maxHeight: 'calc(100vh - 120px)' }}
      >
        {desktopItems.map((node) => (
          <button
            key={node.id}
            className={`flex flex-col items-center w-20 p-1.5 rounded-lg ${
              selectedId === node.id ? 'bg-white/20 ring-1 ring-white/40' : 'hover:bg-white/10'
            }`}
            onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
            onDoubleClick={() => {
              if (node.kind === 'folder') onOpenFolder(node.id);
              else onOpenFile(node);
            }}
          >
            {node.kind === 'folder' ? (
              <FolderIcon size={48} />
            ) : node.mime?.startsWith('image/') ? (
              <ImageIcon size={48} />
            ) : (
              <FileIcon size={40} />
            )}
            <span
              className="text-white text-xs mt-1 text-center break-words leading-tight"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
            >
              {node.name}
            </span>
          </button>
        ))}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-[10001] min-w-[180px] py-1 bg-white/90 dark:bg-neutral-800/95 backdrop-blur-xl rounded-lg shadow-2xl border border-black/10 dark:border-white/10 text-sm animate-scale-in"
          style={{ left: menu.x, top: menu.y }}
        >
          <MenuItem label="New Folder" onClick={() => { setMenu(null); onNewFolder(); }} />
          <MenuItem label="New Text File" onClick={() => { setMenu(null); onNewFile(); }} />
          <Divider />
          <MenuItem label="Change Wallpaper…" onClick={() => { setMenu(null); onChangeWallpaper(); }} />
          <MenuItem label="Open Settings" onClick={() => { setMenu(null); onOpenSettings(); }} />
          <Divider />
          <MenuItem label="Open Terminal" onClick={() => { setMenu(null); onOpenTerminal(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="block w-full text-left px-3 py-1 text-neutral-800 dark:text-neutral-100 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-black/10 dark:bg-white/10" />;
}
