/**
 * Filesystem hub — routes operations to the correct FileSystemProvider.
 *
 * Finder and apps call the hub (via fsStore), never browser FS APIs directly.
 */

import type {
  FileSystemProvider,
  FSEntry,
  FSResult,
  ListOptions,
  MountPermissionState,
  MountRecord,
  RecentFileRecord,
  RecentMountRecord,
} from '../../types/fs';
import { fsErr, fsOk, parseEntryId } from '../../types/fs';
import {
  BrowserLocalFolderProvider,
  BROWSER_LOCAL_PROVIDER_ID,
  isBrowserLocalSupported,
} from './BrowserLocalFolderProvider';
import type { VirtualFileSystemProvider } from './VirtualFileSystemProvider';
import {
  VIRTUAL_PROVIDER_ID,
  createVirtualProviderFromStore,
} from './VirtualFileSystemProvider';
import {
  loadMountRecords,
  saveMountRecords,
  loadRecentFiles,
  saveRecentFiles,
  loadRecentMounts,
  saveRecentMounts,
} from './handleStore';
import type { useVFS } from '../../store/vfsStore';

const MAX_RECENT_FILES = 20;
const MAX_RECENT_MOUNTS = 10;

export interface LocationItem {
  id: string;
  name: string;
  kind: 'virtual-root' | 'virtual-folder' | 'local-mount';
  entryId: string;
  mountId?: string;
  permissionState?: MountPermissionState;
  writeEnabled?: boolean;
}

export class FileSystemHub {
  private virtual: VirtualFileSystemProvider | null = null;
  readonly local = new BrowserLocalFolderProvider();
  private providers = new Map<string, FileSystemProvider>();
  recentFiles: RecentFileRecord[] = [];
  recentMounts: RecentMountRecord[] = [];
  private ready = false;
  private listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  isReady(): boolean {
    return this.ready;
  }

  async init(vfsStore: typeof useVFS): Promise<void> {
    this.virtual = createVirtualProviderFromStore(vfsStore);
    this.providers.set(VIRTUAL_PROVIDER_ID, this.virtual);
    this.providers.set(BROWSER_LOCAL_PROVIDER_ID, this.local);

    this.local.onChange(() => this.emit());

    const [mounts, recentFiles, recentMounts] = await Promise.all([
      loadMountRecords(),
      loadRecentFiles(),
      loadRecentMounts(),
    ]);
    this.recentFiles = recentFiles;
    this.recentMounts = recentMounts;
    await this.local.restoreMounts(mounts);
    this.ready = true;
    this.emit();
  }

  getVirtual(): VirtualFileSystemProvider {
    if (!this.virtual) throw new Error('FileSystemHub not initialized');
    return this.virtual;
  }

  getProvider(providerId: string): FileSystemProvider | undefined {
    return this.providers.get(providerId);
  }

  private providerFor(entryId: string): FSResult<FileSystemProvider> {
    const parsed = parseEntryId(entryId);
    if (!parsed) return fsErr('Invalid entry id', 'invalid');
    const p = this.providers.get(parsed.providerId);
    if (!p) return fsErr(`Unknown provider: ${parsed.providerId}`, 'not-found');
    return fsOk(p);
  }

  async get(id: string): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.get(id);
  }

  async list(folderId: string, options?: ListOptions): Promise<FSResult<FSEntry[]>> {
    const p = this.providerFor(folderId);
    if (!p.ok) return p;
    return p.value.list(folderId, options);
  }

  async readText(id: string): Promise<FSResult<string>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.readText(id);
  }

  async readBlob(id: string): Promise<FSResult<Blob>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.readBlob(id);
  }

  async createObjectURL(id: string): Promise<FSResult<string>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.createObjectURL(id);
  }

  async writeText(id: string, content: string): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.writeText(id, content);
  }

  async writeBlob(id: string, blob: Blob): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.writeBlob(id, blob);
  }

  async mkdir(parentId: string, name: string): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(parentId);
    if (!p.ok) return p;
    return p.value.mkdir(parentId, name);
  }

  async createFile(parentId: string, name: string, content?: string): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(parentId);
    if (!p.ok) return p;
    return p.value.createFile(parentId, name, content);
  }

  async rename(id: string, newName: string): Promise<FSResult<FSEntry>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.rename(id, newName);
  }

  async remove(id: string): Promise<FSResult<void>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.remove(id);
  }

  async getParent(id: string): Promise<FSResult<FSEntry | null>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.getParent(id);
  }

  async getBreadcrumbs(id: string): Promise<FSResult<FSEntry[]>> {
    const p = this.providerFor(id);
    if (!p.ok) return p;
    return p.value.getBreadcrumbs(id);
  }

  async canWrite(id: string): Promise<boolean> {
    const p = this.providerFor(id);
    if (!p.ok) return false;
    return p.value.canWrite(id);
  }

  async getVirtualRootId(): Promise<string> {
    const root = await this.getVirtual().getRoot();
    if (!root.ok) throw new Error(root.error);
    return root.value.id;
  }

  /** Sidebar locations: virtual favorites + mounted local folders. */
  async getLocations(): Promise<LocationItem[]> {
    const items: LocationItem[] = [];
    const virtual = this.getVirtual();
    const root = await virtual.getRoot();
    if (root.ok) {
      items.push({
        id: 'loc-home',
        name: 'Home',
        kind: 'virtual-root',
        entryId: root.value.id,
      });
      const children = await virtual.list(root.value.id);
      if (children.ok) {
        for (const c of children.value) {
          if (c.kind !== 'folder') continue;
          if (['Desktop', 'Documents', 'Pictures', 'Downloads'].includes(c.name)) {
            items.push({
              id: `loc-${c.name.toLowerCase()}`,
              name: c.name,
              kind: 'virtual-folder',
              entryId: c.id,
            });
          }
        }
      }
    }

    for (const m of this.local.getMountViews()) {
      items.push({
        id: `loc-mount-${m.id}`,
        name: m.name,
        kind: 'local-mount',
        entryId: this.local.mountRootId(m.id),
        mountId: m.id,
        permissionState: m.permissionState,
        writeEnabled: m.writeEnabled,
      });
    }
    return items;
  }

  isLocalSupported(): boolean {
    return isBrowserLocalSupported();
  }

  async connectFolder(writeEnabled = false): Promise<
    FSResult<MountRecord & { permissionState: MountPermissionState }>
  > {
    const r = await this.local.connectFolder({ writeEnabled });
    if (r.ok) {
      await this.persistMounts();
      await this.touchRecentMount(r.value.id, r.value.name);
    }
    this.emit();
    return r;
  }

  /** Test / e2e: mount without picker. */
  async mountTestHandle(
    handle: FileSystemDirectoryHandle,
    options?: { id?: string; writeEnabled?: boolean; name?: string }
  ): Promise<FSResult<MountRecord & { permissionState: MountPermissionState }>> {
    const r = await this.local.mountHandle(handle, { ...options, persist: false });
    if (r.ok) {
      await this.touchRecentMount(r.value.id, r.value.name);
    }
    this.emit();
    return r;
  }

  async disconnectMount(mountId: string): Promise<void> {
    await this.local.disconnect(mountId, true);
    await this.persistMounts();
    this.recentMounts = this.recentMounts.filter((r) => r.mountId !== mountId);
    await saveRecentMounts(this.recentMounts);
    this.emit();
  }

  async setMountWriteEnabled(mountId: string, enabled: boolean): Promise<FSResult<void>> {
    const r = await this.local.setWriteEnabled(mountId, enabled);
    if (r.ok) await this.persistMounts();
    this.emit();
    return r;
  }

  async requestMountPermission(mountId: string): Promise<FSResult<MountPermissionState>> {
    const r = await this.local.requestMountPermission(mountId);
    await this.persistMounts();
    this.emit();
    return r;
  }

  getMountViews() {
    return this.local.getMountViews();
  }

  private async persistMounts(): Promise<void> {
    await saveMountRecords(this.local.getMountRecords());
  }

  async touchRecentFile(entry: FSEntry): Promise<void> {
    if (entry.kind !== 'file') return;
    const rec: RecentFileRecord = {
      entryId: entry.id,
      name: entry.name,
      path: entry.path,
      providerId: entry.providerId,
      mountId: entry.mountId,
      mime: entry.mime,
      openedAt: Date.now(),
    };
    this.recentFiles = [
      rec,
      ...this.recentFiles.filter((r) => r.entryId !== entry.id),
    ].slice(0, MAX_RECENT_FILES);
    await saveRecentFiles(this.recentFiles);
    this.emit();
  }

  async touchRecentMount(mountId: string, name: string): Promise<void> {
    const rec: RecentMountRecord = { mountId, name, openedAt: Date.now() };
    this.recentMounts = [
      rec,
      ...this.recentMounts.filter((r) => r.mountId !== mountId),
    ].slice(0, MAX_RECENT_MOUNTS);
    await saveRecentMounts(this.recentMounts);
    this.emit();
  }

  /**
   * List sibling files in the same folder matching a predicate (prev/next navigation).
   */
  async listSiblings(
    entryId: string,
    predicate: (e: FSEntry) => boolean
  ): Promise<FSResult<FSEntry[]>> {
    const entry = await this.get(entryId);
    if (!entry.ok) return entry;
    if (!entry.value.parentId) return fsOk(predicate(entry.value) ? [entry.value] : []);
    const list = await this.list(entry.value.parentId);
    if (!list.ok) return list;
    return fsOk(list.value.filter((e) => e.kind === 'file' && predicate(e)));
  }
}

/** Singleton hub used by the store and apps. */
export const fsHub = new FileSystemHub();
