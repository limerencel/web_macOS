/**
 * Root application shell
 */

import { useCallback, useEffect, useState } from 'react';
import { MenuBar } from './components/MenuBar';
import { Dock } from './components/Dock';
import { Desktop } from './components/Desktop';
import { WindowHost } from './components/WindowHost';
import { Spotlight } from './components/Spotlight';
import { NotificationCenter } from './components/NotificationCenter';
import { useSettings } from './store/settingsStore';
import { useVFS } from './store/vfsStore';
import { useWindowManager } from './store/windowManager';
import { notify } from './store/notificationsStore';
import { getApp } from './apps/registry';
import { registerAllApps } from './apps/registerAll';
import type { VFSNode } from './types/vfs';

// Side-effect: populate app registry once
registerAllApps();

export default function App() {
  const settingsReady = useSettings((s) => s.ready);
  const vfsReady = useVFS((s) => s.ready);
  const initSettings = useSettings((s) => s.init);
  const initVfs = useVFS((s) => s.init);
  const open = useWindowManager((s) => s.open);
  const tree = useVFS((s) => s.tree);
  const mkdir = useVFS((s) => s.mkdir);
  const touch = useVFS((s) => s.touch);

  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([initSettings(), initVfs()]);
      setBooted(true);
      notify('Welcome to WebOS', 'Click dock icons or press Ctrl+Space to search.', 5000);
    })();
  }, [initSettings, initVfs]);

  const launchApp = useCallback(
    (appId: string, payload?: Record<string, unknown>) => {
      const app = getApp(appId);
      if (!app) return;
      open({
        appId: app.id,
        title: app.name,
        width: app.defaultWidth,
        height: app.defaultHeight,
        single: app.singleInstance,
        payload,
      });
    },
    [open]
  );

  const openFile = useCallback(
    (node: VFSNode) => {
      if (node.kind === 'folder') {
        launchApp('finder', { folderId: node.id });
        return;
      }
      if (node.mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(node.name)) {
        launchApp('image-viewer', { fileId: node.id });
        return;
      }
      launchApp('text-editor', { fileId: node.id });
    },
    [launchApp]
  );

  const desktopFolderId = Object.values(tree.nodes).find(
    (n) => n.parentId === tree.rootId && n.name === 'Desktop'
  )?.id;

  const newDesktopFolder = () => {
    const parent = desktopFolderId ?? tree.rootId;
    let name = 'Untitled Folder';
    let i = 1;
    const siblings = Object.values(useVFS.getState().tree.nodes).filter((n) => n.parentId === parent);
    while (siblings.some((s) => s.name === name)) name = `Untitled Folder ${i++}`;
    const r = mkdir(parent, name);
    if (!r.ok) notify('Desktop', r.error);
    else notify('Desktop', `Created ${name}`, 2000);
  };

  const newDesktopFile = () => {
    const parent = desktopFolderId ?? tree.rootId;
    let name = 'Untitled.txt';
    let i = 1;
    const siblings = Object.values(useVFS.getState().tree.nodes).filter((n) => n.parentId === parent);
    while (siblings.some((s) => s.name === name)) name = `Untitled ${i++}.txt`;
    const r = touch(parent, name);
    if (!r.ok) notify('Desktop', r.error);
    else notify('Desktop', `Created ${name}`, 2000);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === ' ') {
        e.preventDefault();
        setSpotlightOpen((o) => !o);
      }
      if (e.key === 'Escape') setSpotlightOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!booted || !settingsReady || !vfsReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 text-white">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="11" stroke="white" strokeWidth="2" />
              <circle cx="16" cy="16" r="5" fill="white" />
            </svg>
          </div>
          <div className="text-sm text-neutral-400">Starting WebOS…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden select-none" data-testid="desktop-root">
      <Desktop
        onOpenFolder={(id) => launchApp('finder', { folderId: id })}
        onOpenFile={openFile}
        onNewFolder={newDesktopFolder}
        onNewFile={newDesktopFile}
        onChangeWallpaper={() => launchApp('settings')}
        onOpenSettings={() => launchApp('settings')}
        onOpenTerminal={() => launchApp('terminal')}
      />
      <WindowHost />
      <MenuBar
        onSpotlight={() => setSpotlightOpen(true)}
        onOpenAbout={() => launchApp('about')}
        onOpenSettings={() => launchApp('settings')}
      />
      <Dock onLaunch={launchApp} />
      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onLaunchApp={launchApp}
        onOpenFile={openFile}
      />
      <NotificationCenter />
    </div>
  );
}
