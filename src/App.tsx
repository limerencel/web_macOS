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
import { useFS } from './store/fsStore';
import { useWindowManager } from './store/windowManager';
import { notify } from './store/notificationsStore';
import { getApp } from './apps/registry';
import { registerAllApps } from './apps/registerAll';
import type { VFSNode } from './types/vfs';
import { makeEntryId, guessMime } from './types/fs';
import { fsHub } from './services/fs/hub';
import { createDemoLocalTree, createMockDirectory } from './services/fs/mockDirectory';

// Side-effect: populate app registry once
registerAllApps();

export default function App() {
  const settingsReady = useSettings((s) => s.ready);
  const vfsReady = useVFS((s) => s.ready);
  const fsReady = useFS((s) => s.ready);
  const initSettings = useSettings((s) => s.init);
  const initVfs = useVFS((s) => s.init);
  const initFs = useFS((s) => s.init);
  const open = useWindowManager((s) => s.open);
  const openEntry = useFS((s) => s.openEntry);
  const tree = useVFS((s) => s.tree);
  const mkdir = useVFS((s) => s.mkdir);
  const touch = useVFS((s) => s.touch);

  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([initSettings(), initVfs()]);
      await initFs();
      setBooted(true);
      notify('Welcome to WebOS', 'Click dock icons or press Ctrl+Space to search.', 5000);
    })();
  }, [initSettings, initVfs, initFs]);

  // E2E / dev test hooks (no host shell access — mocked FS only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = {
      mountDemoFolder: async (writeEnabled = false) => {
        const handle = createDemoLocalTree() as unknown as FileSystemDirectoryHandle;
        return fsHub.mountTestHandle(handle, {
          id: 'test-demo-mount',
          name: 'DemoPhotos',
          writeEnabled,
        });
      },
      mountMockFolder: async (
        spec: Parameters<typeof createMockDirectory>[0],
        opts?: { id?: string; writeEnabled?: boolean; name?: string }
      ) => {
        const handle = createMockDirectory(spec) as unknown as FileSystemDirectoryHandle;
        return fsHub.mountTestHandle(handle, opts);
      },
      setMountPermission: async (mountId: string, state: 'granted' | 'denied' | 'prompt') => {
        const views = fsHub.getMountViews();
        const m = views.find((x) => x.id === mountId);
        if (!m) return { ok: false as const, error: 'not found' };
        // Access internal runtime via request or mark
        if (state === 'denied' || state === 'prompt') {
          // Force permission-required by clearing grant through request path mock
          const local = fsHub.local;
          const rt = (local as unknown as { mounts: Map<string, { handle: { permission?: string }; permissionState: string }> }).mounts.get(mountId);
          if (rt?.handle) {
            (rt.handle as { permission?: PermissionState }).permission = state === 'denied' ? 'denied' : 'prompt';
          }
          if (rt) rt.permissionState = 'permission-required';
          await useFS.getState().refresh();
          return { ok: true as const, value: 'permission-required' as const };
        }
        return fsHub.requestMountPermission(mountId);
      },
      getMounts: () => fsHub.getMountViews(),
    };
    (window as unknown as { __webosTest?: typeof api }).__webosTest = api;
    return () => {
      delete (window as unknown as { __webosTest?: typeof api }).__webosTest;
    };
  }, []);

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
      const entryId = makeEntryId('vfs', node.id);
      void openEntry({
        id: entryId,
        name: node.name,
        kind: node.kind,
        parentId: node.parentId ? makeEntryId('vfs', node.parentId) : null,
        providerId: 'vfs',
        path: useVFS.getState().getPath(node.id) || `/${node.name}`,
        mime: node.mime || (node.kind === 'file' ? guessMime(node.name) : undefined),
        writable: true,
      });
    },
    [openEntry]
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

  if (!booted || !settingsReady || !vfsReady || !fsReady) {
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
        onOpenFolder={(id) => launchApp('finder', { folderId: makeEntryId('vfs', id) })}
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
