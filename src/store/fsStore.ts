/**
 * Filesystem store — reactive facade over FileSystemHub.
 *
 * Components subscribe here for mounts, locations, and recent items.
 * All I/O methods proxy to the hub (never browser FS APIs).
 */

import { create } from 'zustand';
import type {
  FSEntry,
  FSResult,
  ListOptions,
  MountPermissionState,
  MountRecord,
  RecentFileRecord,
  RecentMountRecord,
  SortDirection,
  SortKey,
} from '../types/fs';
import { fsHub, type LocationItem } from '../services/fs/hub';
import { useVFS } from './vfsStore';
import { resolveOpenAppId } from '../services/fileAssociations';
import { useWindowManager } from './windowManager';
import { getApp } from '../apps/registry';
import { revokeOwnerObjectURLs } from '../services/objectUrlManager';

interface FSStoreState {
  ready: boolean;
  locations: LocationItem[];
  mounts: Array<MountRecord & { permissionState: MountPermissionState }>;
  recentFiles: RecentFileRecord[];
  recentMounts: RecentMountRecord[];
  /** Monotonic tick so list views can refresh after external mutations */
  revision: number;

  init: () => Promise<void>;
  refresh: () => Promise<void>;

  list: (folderId: string, options?: ListOptions) => Promise<FSResult<FSEntry[]>>;
  get: (id: string) => Promise<FSResult<FSEntry>>;
  readText: (id: string) => Promise<FSResult<string>>;
  readBlob: (id: string) => Promise<FSResult<Blob>>;
  createObjectURL: (id: string) => Promise<FSResult<string>>;
  writeText: (id: string, content: string) => Promise<FSResult<FSEntry>>;
  mkdir: (parentId: string, name: string) => Promise<FSResult<FSEntry>>;
  createFile: (parentId: string, name: string, content?: string) => Promise<FSResult<FSEntry>>;
  rename: (id: string, name: string) => Promise<FSResult<FSEntry>>;
  remove: (id: string) => Promise<FSResult<void>>;
  getBreadcrumbs: (id: string) => Promise<FSResult<FSEntry[]>>;
  getParent: (id: string) => Promise<FSResult<FSEntry | null>>;
  canWrite: (id: string) => Promise<boolean>;
  listSiblings: (
    entryId: string,
    predicate: (e: FSEntry) => boolean
  ) => Promise<FSResult<FSEntry[]>>;

  connectFolder: (writeEnabled?: boolean) => Promise<
    FSResult<MountRecord & { permissionState: MountPermissionState }>
  >;
  disconnectMount: (mountId: string) => Promise<void>;
  setMountWriteEnabled: (mountId: string, enabled: boolean) => Promise<FSResult<void>>;
  requestMountPermission: (mountId: string) => Promise<FSResult<MountPermissionState>>;
  isLocalSupported: () => boolean;

  openEntry: (entry: FSEntry, opts?: { forceAppId?: string }) => Promise<void>;
  rememberFile: (entry: FSEntry) => Promise<void>;

  getVirtualRootId: () => Promise<string>;
  bump: () => void;
}

function syncFromHub(set: (partial: Partial<FSStoreState>) => void): void {
  void fsHub.getLocations().then((locations) => {
    set({
      locations,
      mounts: fsHub.getMountViews(),
      recentFiles: [...fsHub.recentFiles],
      recentMounts: [...fsHub.recentMounts],
      revision: Date.now(),
    });
  });
}

export const useFS = create<FSStoreState>((set, get) => ({
  ready: false,
  locations: [],
  mounts: [],
  recentFiles: [],
  recentMounts: [],
  revision: 0,

  init: async () => {
    await fsHub.init(useVFS);
    fsHub.onChange(() => syncFromHub(set));
    // Also refresh locations when VFS tree changes
    useVFS.subscribe(() => {
      if (fsHub.isReady()) syncFromHub(set);
    });

    // Revoke object URLs when windows close
    let prevIds = new Set(useWindowManager.getState().windows.map((w) => w.id));
    useWindowManager.subscribe((state) => {
      const nextIds = new Set(state.windows.map((w) => w.id));
      for (const id of prevIds) {
        if (!nextIds.has(id)) revokeOwnerObjectURLs(id);
      }
      prevIds = nextIds;
    });

    const locations = await fsHub.getLocations();
    set({
      ready: true,
      locations,
      mounts: fsHub.getMountViews(),
      recentFiles: [...fsHub.recentFiles],
      recentMounts: [...fsHub.recentMounts],
    });
  },

  refresh: async () => {
    syncFromHub(set);
    set({ revision: Date.now() });
  },

  bump: () => set({ revision: Date.now() }),

  list: (folderId, options) => fsHub.list(folderId, options),
  get: (id) => fsHub.get(id),
  readText: (id) => fsHub.readText(id),
  readBlob: (id) => fsHub.readBlob(id),
  createObjectURL: (id) => fsHub.createObjectURL(id),
  writeText: async (id, content) => {
    const r = await fsHub.writeText(id, content);
    get().bump();
    return r;
  },
  mkdir: async (parentId, name) => {
    const r = await fsHub.mkdir(parentId, name);
    get().bump();
    syncFromHub(set);
    return r;
  },
  createFile: async (parentId, name, content) => {
    const r = await fsHub.createFile(parentId, name, content);
    get().bump();
    return r;
  },
  rename: async (id, name) => {
    const r = await fsHub.rename(id, name);
    get().bump();
    syncFromHub(set);
    return r;
  },
  remove: async (id) => {
    const r = await fsHub.remove(id);
    get().bump();
    syncFromHub(set);
    return r;
  },
  getBreadcrumbs: (id) => fsHub.getBreadcrumbs(id),
  getParent: (id) => fsHub.getParent(id),
  canWrite: (id) => fsHub.canWrite(id),
  listSiblings: (entryId, predicate) => fsHub.listSiblings(entryId, predicate),

  connectFolder: async (writeEnabled = false) => {
    const r = await fsHub.connectFolder(writeEnabled);
    syncFromHub(set);
    return r;
  },
  disconnectMount: async (mountId) => {
    await fsHub.disconnectMount(mountId);
    syncFromHub(set);
  },
  setMountWriteEnabled: async (mountId, enabled) => {
    const r = await fsHub.setMountWriteEnabled(mountId, enabled);
    syncFromHub(set);
    return r;
  },
  requestMountPermission: async (mountId) => {
    const r = await fsHub.requestMountPermission(mountId);
    syncFromHub(set);
    return r;
  },
  isLocalSupported: () => fsHub.isLocalSupported(),

  openEntry: async (entry, opts) => {
    const open = useWindowManager.getState().open;
    if (entry.kind === 'folder') {
      open({
        appId: 'finder',
        title: 'Finder',
        width: 880,
        height: 560,
        payload: { folderId: entry.id },
      });
      if (entry.mountId) {
        await fsHub.touchRecentMount(entry.mountId, entry.name);
        syncFromHub(set);
      }
      return;
    }

    await fsHub.touchRecentFile(entry);
    syncFromHub(set);

    const appId = opts?.forceAppId ?? resolveOpenAppId(entry.name, entry.mime, entry.kind);
    const app = getApp(appId);
    open({
      appId,
      title: app?.name ? `${app.name} — ${entry.name}` : entry.name,
      width: app?.defaultWidth ?? 720,
      height: app?.defaultHeight ?? 520,
      payload: {
        entryId: entry.id,
        // Back-compat for virtual-only callers
        fileId: entry.id.startsWith('vfs:') ? entry.id.slice(4) : undefined,
      },
    });
  },

  rememberFile: async (entry) => {
    await fsHub.touchRecentFile(entry);
    syncFromHub(set);
  },

  getVirtualRootId: () => fsHub.getVirtualRootId(),
}));

export type { SortKey, SortDirection, LocationItem };
