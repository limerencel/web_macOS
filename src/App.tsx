/** Root WebOS shell with authenticated single-user session gating. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MenuBar } from './components/MenuBar';
import { Dock } from './components/Dock';
import { Desktop } from './components/Desktop';
import { WindowHost } from './components/WindowHost';
import { Spotlight } from './components/Spotlight';
import { NotificationCenter } from './components/NotificationCenter';
import { LockScreen, ShutdownScreen } from './components/LockScreen';
import { Launchpad } from './components/Launchpad';
import { useSettings } from './store/settingsStore';
import { useVFS } from './store/vfsStore';
import { useFS } from './store/fsStore';
import { useWindowManager } from './store/windowManager';
import { useAuth } from './store/authStore';
import { useDashboard } from './store/dashboardStore';
import { notify } from './store/notificationsStore';
import { getApp } from './apps/registry';
import { registerAllApps } from './apps/registerAll';
import type { VFSNode } from './types/vfs';
import type { RemoteApp } from './types/dashboard';
import { makeEntryId, guessMime } from './types/fs';
import { fsHub } from './services/fs/hub';
import { createDemoLocalTree, createMockDirectory } from './services/fs/mockDirectory';

registerAllApps();

export default function App() {
  const systemState = useAuth((s) => s.state);
  const initAuth = useAuth((s) => s.init);
  const markUnauthorized = useAuth((s) => s.markUnauthorized);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  useEffect(() => {
    window.addEventListener('webos:unauthorized', markUnauthorized);
    return () => window.removeEventListener('webos:unauthorized', markUnauthorized);
  }, [markUnauthorized]);

  if (systemState === 'booting') return <BootScreen />;
  if (systemState === 'shutdown') return <ShutdownScreen />;
  if (systemState !== 'desktop') return <LockScreen />;
  return <DesktopSession />;
}

function DesktopSession() {
  const settingsReady = useSettings((s) => s.ready);
  const vfsReady = useVFS((s) => s.ready);
  const fsReady = useFS((s) => s.ready);
  const dashboardReady = useDashboard((s) => s.ready);
  const initSettings = useSettings((s) => s.init);
  const initVfs = useVFS((s) => s.init);
  const initFs = useFS((s) => s.init);
  const initDashboard = useDashboard((s) => s.init);
  const dashboardApps = useDashboard((s) => s.apps);
  const clearDashboard = useDashboard((s) => s.clear);
  const open = useWindowManager((s) => s.open);
  const closeAll = useWindowManager((s) => s.closeAll);
  const lock = useAuth((s) => s.lock);
  const shutdown = useAuth((s) => s.shutdown);
  const openEntry = useFS((s) => s.openEntry);
  const tree = useVFS((s) => s.tree);
  const mkdir = useVFS((s) => s.mkdir);
  const touch = useVFS((s) => s.touch);

  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const bootingRef = useRef(false);

  useEffect(() => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    void (async () => {
      await Promise.all([initSettings(), initVfs(), initDashboard()]);
      await initFs();
      setBooted(true);
      notify('Welcome to WebOS', 'Open Launchpad to manage your applications.', 5000);
    })();
  }, [initDashboard, initFs, initSettings, initVfs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = {
      mountDemoFolder: async (writeEnabled = false) => {
        const handle = createDemoLocalTree() as unknown as FileSystemDirectoryHandle;
        return fsHub.mountTestHandle(handle, { id: 'test-demo-mount', name: 'DemoPhotos', writeEnabled });
      },
      mountMockFolder: async (
        spec: Parameters<typeof createMockDirectory>[0],
        opts?: { id?: string; writeEnabled?: boolean; name?: string },
      ) => {
        const handle = createMockDirectory(spec) as unknown as FileSystemDirectoryHandle;
        return fsHub.mountTestHandle(handle, opts);
      },
      setMountPermission: async (mountId: string, state: 'granted' | 'denied' | 'prompt') => {
        const mount = fsHub.getMountViews().find((item) => item.id === mountId);
        if (!mount) return { ok: false as const, error: 'not found' };
        if (state === 'denied' || state === 'prompt') {
          const local = fsHub.local;
          const runtime = (local as unknown as {
            mounts: Map<string, { handle: { permission?: string }; permissionState: string }>;
          }).mounts.get(mountId);
          if (runtime?.handle) runtime.handle.permission = state;
          if (runtime) runtime.permissionState = 'permission-required';
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
    [open],
  );

  const launchRemote = useCallback(
    (app: RemoteApp) => {
      if (app.launchMode === 'same-tab') {
        window.location.assign(app.url);
        return;
      }
      if (app.launchMode === 'external') {
        const target = window.open(app.url, '_blank', 'noopener,noreferrer');
        if (target) target.opener = null;
        return;
      }
      open({
        appId: 'remote-frame',
        title: app.name,
        width: 1000,
        height: 680,
        payload: { url: app.url, name: app.name, remoteAppId: app.id },
      });
    },
    [open],
  );

  const handleLock = useCallback(async () => {
    setSpotlightOpen(false);
    setLaunchpadOpen(false);
    closeAll();
    clearDashboard();
    await lock();
  }, [clearDashboard, closeAll, lock]);

  const handleShutdown = useCallback(async () => {
    setSpotlightOpen(false);
    setLaunchpadOpen(false);
    closeAll();
    clearDashboard();
    await shutdown();
  }, [clearDashboard, closeAll, shutdown]);

  const handleRestart = useCallback(async () => {
    await handleLock();
    window.location.reload();
  }, [handleLock]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void handleLock(), 30 * 60_000);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, arm));
    };
  }, [handleLock]);

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
    [openEntry],
  );

  const desktopFolderId = Object.values(tree.nodes).find(
    (node) => node.parentId === tree.rootId && node.name === 'Desktop',
  )?.id;

  const newDesktopFolder = () => {
    const parent = desktopFolderId ?? tree.rootId;
    let name = 'Untitled Folder';
    let index = 1;
    const siblings = Object.values(useVFS.getState().tree.nodes).filter((node) => node.parentId === parent);
    while (siblings.some((sibling) => sibling.name === name)) name = `Untitled Folder ${index++}`;
    const result = mkdir(parent, name);
    if (!result.ok) notify('Desktop', result.error);
    else notify('Desktop', `Created ${name}`, 2000);
  };

  const newDesktopFile = () => {
    const parent = desktopFolderId ?? tree.rootId;
    let name = 'Untitled.txt';
    let index = 1;
    const siblings = Object.values(useVFS.getState().tree.nodes).filter((node) => node.parentId === parent);
    while (siblings.some((sibling) => sibling.name === name)) name = `Untitled ${index++}.txt`;
    const result = touch(parent, name);
    if (!result.ok) notify('Desktop', result.error);
    else notify('Desktop', `Created ${name}`, 2000);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === ' ') {
        event.preventDefault();
        setSpotlightOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setSpotlightOpen(false);
        setLaunchpadOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!booted || !settingsReady || !vfsReady || !fsReady || !dashboardReady) return <BootScreen />;

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
        onLock={() => void handleLock()}
        onShutdown={() => void handleShutdown()}
        onRestart={() => void handleRestart()}
      />
      <Dock
        onLaunch={launchApp}
        remoteApps={dashboardApps}
        onLaunchRemote={launchRemote}
        onOpenLaunchpad={() => setLaunchpadOpen(true)}
      />
      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onLaunchApp={launchApp}
        onOpenFile={openFile}
        onLaunchRemote={launchRemote}
      />
      <Launchpad
        open={launchpadOpen}
        onClose={() => setLaunchpadOpen(false)}
        onLaunchNative={launchApp}
        onLaunchRemote={launchRemote}
        onAdd={() => launchApp('app-manager', {})}
        onEdit={(app) => launchApp('app-manager', { editAppId: app.id })}
      />
      <NotificationCenter />
    </div>
  );
}

function BootScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 text-white" data-testid="boot-screen">
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
