/**
 * BrowserLocalFolderProvider — File System Access API backed provider.
 *
 * One provider instance may own multiple mounts, each with its own root
 * directory handle. Default mode is read-only; write access is a per-mount
 * user toggle and requires readwrite permission.
 *
 * Recursive deletion is intentionally NOT implemented.
 */

import type {
  FileSystemProvider,
  FSEntry,
  FSResult,
  ListOptions,
  MountPermissionState,
  MountRecord,
} from '../../types/fs';
import {
  fsOk,
  fsErr,
  makeEntryId,
  guessMime,
  sortEntries,
} from '../../types/fs';
import {
  saveDirectoryHandle,
  loadDirectoryHandle,
  deleteDirectoryHandle,
} from './handleStore';
import { readBlobAsArrayBuffer, readBlobAsText } from './blobUtils';

export const BROWSER_LOCAL_PROVIDER_ID = 'local';

interface MountRuntime {
  record: MountRecord;
  handle: FileSystemDirectoryHandle | null;
  permissionState: MountPermissionState;
}

/** Encode mount-relative path into the local id segment (after `local:`). */
export function encodeLocalId(mountId: string, relativePath: string): string {
  // relativePath uses `/` separators; empty or `/` means mount root
  const norm = normalizeRelPath(relativePath);
  return `${mountId}:${norm || '/'}`;
}

export function parseLocalId(localId: string): { mountId: string; relPath: string } | null {
  const idx = localId.indexOf(':');
  if (idx <= 0) return null;
  return { mountId: localId.slice(0, idx), relPath: localId.slice(idx + 1) || '/' };
}

function normalizeRelPath(path: string): string {
  const parts = path.split('/').filter((p) => p && p !== '.');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function joinRel(parent: string, name: string): string {
  const base = normalizeRelPath(parent);
  return base ? `${base}/${name}` : name;
}

function parentRel(relPath: string): string | null {
  const norm = normalizeRelPath(relPath);
  if (!norm || norm === '/') return null;
  const i = norm.lastIndexOf('/');
  if (i < 0) return '';
  return norm.slice(0, i);
}

function baseName(relPath: string, fallback: string): string {
  const norm = normalizeRelPath(relPath);
  if (!norm || norm === '/') return fallback;
  const i = norm.lastIndexOf('/');
  return i < 0 ? norm : norm.slice(i + 1);
}

export function isBrowserLocalSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

async function queryPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
  mode: 'read' | 'readwrite'
): Promise<PermissionState> {
  try {
    if (typeof handle.queryPermission === 'function') {
      return await handle.queryPermission({ mode });
    }
  } catch {
    /* older engines */
  }
  return 'prompt';
}

async function requestPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
  mode: 'read' | 'readwrite'
): Promise<PermissionState> {
  try {
    if (typeof handle.requestPermission === 'function') {
      return await handle.requestPermission({ mode });
    }
  } catch {
    return 'denied';
  }
  return 'granted';
}

export class BrowserLocalFolderProvider implements FileSystemProvider {
  readonly id = BROWSER_LOCAL_PROVIDER_ID;
  readonly name = 'Local Folders';
  readonly kind = 'browser-local' as const;

  private mounts = new Map<string, MountRuntime>();
  /** Optional synthetic multi-root id for listing all mounts — not used as browse root. */
  private listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  getMountViews(): Array<MountRecord & { permissionState: MountPermissionState }> {
    return [...this.mounts.values()].map((m) => ({
      ...m.record,
      permissionState: m.permissionState,
    }));
  }

  getMount(mountId: string): (MountRecord & { permissionState: MountPermissionState }) | undefined {
    const m = this.mounts.get(mountId);
    if (!m) return undefined;
    return { ...m.record, permissionState: m.permissionState };
  }

  /** Restore mounts from persisted records + IDB handles. */
  async restoreMounts(records: MountRecord[]): Promise<void> {
    for (const record of records) {
      const handle = (await loadDirectoryHandle(record.id)) ?? null;
      let permissionState: MountPermissionState = 'disconnected';
      if (!handle) {
        permissionState = 'unavailable';
      } else {
        const mode = record.writeEnabled ? 'readwrite' : 'read';
        const perm = await queryPermission(handle, mode);
        if (perm === 'granted') permissionState = 'connected';
        else if (perm === 'denied') permissionState = 'permission-required';
        else permissionState = 'permission-required';
      }
      this.mounts.set(record.id, { record, handle, permissionState });
    }
    this.emit();
  }

  /**
   * Prompt the user to pick a directory and mount it (read-only by default).
   */
  async connectFolder(options?: {
    writeEnabled?: boolean;
    existingId?: string;
  }): Promise<FSResult<MountRecord & { permissionState: MountPermissionState }>> {
    if (!isBrowserLocalSupported()) {
      return fsErr(
        'Local folders require the File System Access API (Chromium-based browsers).',
        'not-supported'
      );
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!({
        mode: options?.writeEnabled ? 'readwrite' : 'read',
        id: 'webos-local-folder',
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'AbortError') return fsErr('Folder selection cancelled', 'user-cancelled');
      return fsErr('Could not open directory picker', 'unavailable');
    }

    const id =
      options?.existingId ??
      `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    const now = Date.now();
    const prev = this.mounts.get(id)?.record;
    const record: MountRecord = {
      id,
      name: handle.name || 'Local Folder',
      providerId: BROWSER_LOCAL_PROVIDER_ID,
      writeEnabled: options?.writeEnabled ?? prev?.writeEnabled ?? false,
      createdAt: prev?.createdAt ?? now,
      lastAccessedAt: now,
      label: handle.name,
    };

    await saveDirectoryHandle(id, handle);
    const mode = record.writeEnabled ? 'readwrite' : 'read';
    let perm = await queryPermission(handle, mode);
    if (perm !== 'granted') {
      perm = await requestPermission(handle, mode);
    }
    const permissionState: MountPermissionState =
      perm === 'granted' ? 'connected' : 'permission-required';

    this.mounts.set(id, { record, handle, permissionState });
    this.emit();
    return fsOk({ ...record, permissionState });
  }

  /** Inject a handle without picker (tests / Playwright mock). */
  async mountHandle(
    handle: FileSystemDirectoryHandle,
    options?: { id?: string; writeEnabled?: boolean; name?: string; persist?: boolean }
  ): Promise<FSResult<MountRecord & { permissionState: MountPermissionState }>> {
    const id =
      options?.id ??
      `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    const now = Date.now();
    const record: MountRecord = {
      id,
      name: options?.name ?? handle.name ?? 'Local Folder',
      providerId: BROWSER_LOCAL_PROVIDER_ID,
      writeEnabled: options?.writeEnabled ?? false,
      createdAt: now,
      lastAccessedAt: now,
      label: handle.name,
    };
    if (options?.persist !== false) {
      try {
        await saveDirectoryHandle(id, handle);
      } catch {
        /* tests may not support handle IDB */
      }
    }
    this.mounts.set(id, { record, handle, permissionState: 'connected' });
    this.emit();
    return fsOk({ ...record, permissionState: 'connected' as const });
  }

  async disconnect(mountId: string, forgetHandle = true): Promise<void> {
    this.mounts.delete(mountId);
    if (forgetHandle) await deleteDirectoryHandle(mountId);
    this.emit();
  }

  async setWriteEnabled(mountId: string, enabled: boolean): Promise<FSResult<void>> {
    const m = this.mounts.get(mountId);
    if (!m) return fsErr('Mount not found', 'not-found');
    m.record = { ...m.record, writeEnabled: enabled, lastAccessedAt: Date.now() };
    if (m.handle && enabled) {
      const perm = await requestPermission(m.handle, 'readwrite');
      m.permissionState = perm === 'granted' ? 'connected' : 'permission-required';
    }
    this.emit();
    return fsOk(undefined);
  }

  async requestMountPermission(mountId: string): Promise<FSResult<MountPermissionState>> {
    const m = this.mounts.get(mountId);
    if (!m) return fsErr('Mount not found', 'not-found');
    if (!m.handle) {
      // Try reload from IDB
      m.handle = (await loadDirectoryHandle(mountId)) ?? null;
    }
    if (!m.handle) {
      m.permissionState = 'unavailable';
      this.emit();
      return fsOk('unavailable');
    }
    const mode = m.record.writeEnabled ? 'readwrite' : 'read';
    let perm = await queryPermission(m.handle, mode);
    if (perm !== 'granted') {
      perm = await requestPermission(m.handle, mode);
    }
    m.permissionState = perm === 'granted' ? 'connected' : 'permission-required';
    m.record = { ...m.record, lastAccessedAt: Date.now() };
    this.emit();
    return fsOk(m.permissionState);
  }

  markUnavailable(mountId: string): void {
    const m = this.mounts.get(mountId);
    if (!m) return;
    m.permissionState = 'unavailable';
    m.handle = null;
    this.emit();
  }

  private ensureMount(mountId: string): FSResult<MountRuntime> {
    const m = this.mounts.get(mountId);
    if (!m) return fsErr('Mounted folder not found', 'not-found');
    if (m.permissionState === 'disconnected') return fsErr('Folder disconnected', 'unavailable');
    if (m.permissionState === 'unavailable') {
      return fsErr('Folder is no longer available (moved or deleted)', 'unavailable');
    }
    if (m.permissionState === 'permission-required' || !m.handle) {
      return fsErr('Permission required to access this folder', 'permission-denied');
    }
    return fsOk(m);
  }

  private async resolveHandle(
    mount: MountRuntime,
    relPath: string
  ): Promise<FSResult<{ handle: FileSystemHandle; kind: 'file' | 'directory'; name: string; rel: string }>> {
    if (!mount.handle) return fsErr('No directory handle', 'unavailable');
    const norm = normalizeRelPath(relPath);
    if (!norm || norm === '/') {
      return fsOk({
        handle: mount.handle,
        kind: 'directory',
        name: mount.record.name,
        rel: '',
      });
    }
    const parts = norm.split('/');
    let dir: FileSystemDirectoryHandle = mount.handle;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      try {
        if (isLast) {
          // Try directory first, then file
          try {
            const d = await dir.getDirectoryHandle(part);
            return fsOk({ handle: d, kind: 'directory', name: part, rel: norm });
          } catch {
            const f = await dir.getFileHandle(part);
            return fsOk({ handle: f, kind: 'file', name: part, rel: norm });
          }
        } else {
          dir = await dir.getDirectoryHandle(part);
        }
      } catch {
        return fsErr(`“${part}” was not found (renamed or deleted)`, 'not-found');
      }
    }
    return fsErr('Path not found', 'not-found');
  }

  private entryFrom(
    mount: MountRuntime,
    kind: 'file' | 'folder',
    rel: string,
    name: string,
    meta?: { mime?: string; size?: number; updatedAt?: number }
  ): FSEntry {
    const norm = normalizeRelPath(rel);
    const id = makeEntryId(BROWSER_LOCAL_PROVIDER_ID, encodeLocalId(mount.record.id, norm || '/'));
    const parentNorm = parentRel(norm || '');
    const parentId =
      parentNorm === null
        ? null
        : makeEntryId(
            BROWSER_LOCAL_PROVIDER_ID,
            encodeLocalId(mount.record.id, parentNorm === '' ? '/' : parentNorm)
          );
    // Root of mount: parent is null within provider; FS hub treats mount root specially
    const isRoot = !norm || norm === '/';
    return {
      id,
      name: isRoot ? mount.record.name : name,
      kind,
      parentId: isRoot ? null : parentId,
      providerId: BROWSER_LOCAL_PROVIDER_ID,
      mountId: mount.record.id,
      path: '/' + (norm && norm !== '/' ? norm : ''),
      mime: meta?.mime,
      size: meta?.size,
      updatedAt: meta?.updatedAt,
      writable: mount.record.writeEnabled && mount.permissionState === 'connected',
    };
  }

  mountRootId(mountId: string): string {
    return makeEntryId(BROWSER_LOCAL_PROVIDER_ID, encodeLocalId(mountId, '/'));
  }

  async getRoot(): Promise<FSResult<FSEntry>> {
    // Multi-mount provider has no single root; callers should use mount roots.
    return fsErr('Use a mounted folder root', 'not-supported');
  }

  async get(id: string): Promise<FSResult<FSEntry>> {
    const parsed = this.parseGlobal(id);
    if (!parsed) return fsErr('Invalid local entry id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) {
      if (resolved.code === 'not-found') return resolved;
      return resolved;
    }
    if (resolved.value.kind === 'directory') {
      return fsOk(this.entryFrom(mount, 'folder', parsed.relPath, resolved.value.name));
    }
    const fileHandle = resolved.value.handle as FileSystemFileHandle;
    try {
      const file = await fileHandle.getFile();
      return fsOk(
        this.entryFrom(mount, 'file', parsed.relPath, file.name, {
          mime: file.type || guessMime(file.name),
          size: file.size,
          updatedAt: file.lastModified,
        })
      );
    } catch {
      return fsErr('Could not read file metadata', 'unavailable');
    }
  }

  async list(folderId: string, options?: ListOptions): Promise<FSResult<FSEntry[]>> {
    const parsed = this.parseGlobal(folderId);
    if (!parsed) return fsErr('Invalid folder id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind !== 'directory') return fsErr('Not a folder', 'invalid');
    const dir = resolved.value.handle as FileSystemDirectoryHandle;
    const entries: FSEntry[] = [];
    try {
      for await (const [name, handle] of dir.entries()) {
        const childRel = joinRel(parsed.relPath === '/' ? '' : parsed.relPath, name);
        if (handle.kind === 'directory') {
          entries.push(this.entryFrom(mount, 'folder', childRel, name));
        } else {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            entries.push(
              this.entryFrom(mount, 'file', childRel, name, {
                mime: file.type || guessMime(name),
                size: file.size,
                updatedAt: file.lastModified,
              })
            );
          } catch {
            entries.push(
              this.entryFrom(mount, 'file', childRel, name, {
                mime: guessMime(name),
              })
            );
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'List failed';
      if (/permission/i.test(msg)) {
        mount.permissionState = 'permission-required';
        this.emit();
        return fsErr('Permission required to access this folder', 'permission-denied');
      }
      return fsErr('Could not list folder contents', 'unavailable');
    }
    mount.record = { ...mount.record, lastAccessedAt: Date.now() };
    return fsOk(sortEntries(entries, options?.sortBy ?? 'name', options?.sortDir ?? 'asc'));
  }

  async readText(id: string): Promise<FSResult<string>> {
    const blobR = await this.readBlob(id);
    if (!blobR.ok) return blobR;
    try {
      return fsOk(await readBlobAsText(blobR.value));
    } catch {
      return fsErr('Could not decode file as text', 'invalid');
    }
  }

  async readBlob(id: string): Promise<FSResult<Blob>> {
    const parsed = this.parseGlobal(id);
    if (!parsed) return fsErr('Invalid entry id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const resolved = await this.resolveHandle(mountR.value, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind !== 'file') return fsErr('Not a file', 'invalid');
    try {
      const file = await (resolved.value.handle as FileSystemFileHandle).getFile();
      return fsOk(file);
    } catch {
      return fsErr('Could not read file (permission revoked or missing)', 'permission-denied');
    }
  }

  async createObjectURL(id: string): Promise<FSResult<string>> {
    const blobR = await this.readBlob(id);
    if (!blobR.ok) return blobR;
    return fsOk(URL.createObjectURL(blobR.value));
  }

  async writeText(id: string, content: string): Promise<FSResult<FSEntry>> {
    return this.writeBytes(id, new Blob([content], { type: 'text/plain' }));
  }

  async writeBlob(id: string, blob: Blob): Promise<FSResult<FSEntry>> {
    return this.writeBytes(id, blob);
  }

  private async writeBytes(id: string, data: Blob): Promise<FSResult<FSEntry>> {
    const parsed = this.parseGlobal(id);
    if (!parsed) return fsErr('Invalid entry id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    if (!mount.record.writeEnabled) return fsErr('Mount is read-only. Enable write access first.', 'read-only');
    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind !== 'file') return fsErr('Not a file', 'invalid');
    try {
      const writable = await (resolved.value.handle as FileSystemFileHandle).createWritable();
      await writable.write(data);
      await writable.close();
      return this.get(id);
    } catch {
      return fsErr('Write failed (permission denied or file locked)', 'permission-denied');
    }
  }

  async mkdir(parentId: string, name: string): Promise<FSResult<FSEntry>> {
    const parsed = this.parseGlobal(parentId);
    if (!parsed) return fsErr('Invalid parent id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    if (!mount.record.writeEnabled) return fsErr('Mount is read-only. Enable write access first.', 'read-only');
    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind !== 'directory') return fsErr('Parent is not a folder', 'invalid');
    try {
      await (resolved.value.handle as FileSystemDirectoryHandle).getDirectoryHandle(name, {
        create: true,
      });
      const childRel = joinRel(parsed.relPath === '/' ? '' : parsed.relPath, name);
      const childId = makeEntryId(
        BROWSER_LOCAL_PROVIDER_ID,
        encodeLocalId(mount.record.id, childRel)
      );
      return this.get(childId);
    } catch {
      return fsErr('Could not create folder', 'permission-denied');
    }
  }

  async createFile(parentId: string, name: string, content = ''): Promise<FSResult<FSEntry>> {
    const parsed = this.parseGlobal(parentId);
    if (!parsed) return fsErr('Invalid parent id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    if (!mount.record.writeEnabled) return fsErr('Mount is read-only. Enable write access first.', 'read-only');
    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind !== 'directory') return fsErr('Parent is not a folder', 'invalid');
    try {
      const fh = await (resolved.value.handle as FileSystemDirectoryHandle).getFileHandle(name, {
        create: true,
      });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      const childRel = joinRel(parsed.relPath === '/' ? '' : parsed.relPath, name);
      const childId = makeEntryId(
        BROWSER_LOCAL_PROVIDER_ID,
        encodeLocalId(mount.record.id, childRel)
      );
      return this.get(childId);
    } catch {
      return fsErr('Could not create file', 'permission-denied');
    }
  }

  async rename(id: string, newName: string): Promise<FSResult<FSEntry>> {
    // File System Access API has no direct rename; implement via read+write+remove for files only.
    const parsed = this.parseGlobal(id);
    if (!parsed) return fsErr('Invalid entry id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    if (!mount.record.writeEnabled) return fsErr('Mount is read-only. Enable write access first.', 'read-only');
    if (!newName.trim()) return fsErr('Invalid name', 'invalid');

    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind === 'directory') {
      return fsErr('Renaming folders is not supported for local mounts in this version', 'not-supported');
    }

    const parentPath = parentRel(parsed.relPath);
    if (parentPath === null) return fsErr('Cannot rename mount root', 'invalid');
    const parentResolved = await this.resolveHandle(mount, parentPath === '' ? '/' : parentPath);
    if (!parentResolved.ok || parentResolved.value.kind !== 'directory') {
      return fsErr('Parent folder missing', 'not-found');
    }
    const parentDir = parentResolved.value.handle as FileSystemDirectoryHandle;
    const oldName = baseName(parsed.relPath, resolved.value.name);
    if (oldName === newName) return this.get(id);

    try {
      // Check collision
      try {
        await parentDir.getFileHandle(newName);
        return fsErr(`“${newName}” already exists`, 'already-exists');
      } catch {
        /* does not exist — good */
      }
      try {
        await parentDir.getDirectoryHandle(newName);
        return fsErr(`“${newName}” already exists`, 'already-exists');
      } catch {
        /* ok */
      }

      const file = await (resolved.value.handle as FileSystemFileHandle).getFile();
      const newHandle = await parentDir.getFileHandle(newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(await readBlobAsArrayBuffer(file));
      await writable.close();
      await parentDir.removeEntry(oldName);
      const newRel = joinRel(parentPath, newName);
      const newId = makeEntryId(BROWSER_LOCAL_PROVIDER_ID, encodeLocalId(mount.record.id, newRel));
      return this.get(newId);
    } catch {
      return fsErr('Rename failed', 'permission-denied');
    }
  }

  async remove(id: string): Promise<FSResult<void>> {
    const parsed = this.parseGlobal(id);
    if (!parsed) return fsErr('Invalid entry id', 'invalid');
    const mountR = this.ensureMount(parsed.mountId);
    if (!mountR.ok) return mountR;
    const mount = mountR.value;
    if (!mount.record.writeEnabled) return fsErr('Mount is read-only. Enable write access first.', 'read-only');

    const norm = normalizeRelPath(parsed.relPath);
    if (!norm || norm === '/') return fsErr('Cannot remove mount root', 'invalid');

    const resolved = await this.resolveHandle(mount, parsed.relPath);
    if (!resolved.ok) return resolved;

    if (resolved.value.kind === 'directory') {
      // Non-recursive only: fail if not empty
      const dir = resolved.value.handle as FileSystemDirectoryHandle;
      for await (const _ of dir.entries()) {
        return fsErr('Folder is not empty (recursive delete is disabled)', 'not-empty');
      }
    }

    const parentPath = parentRel(parsed.relPath);
    if (parentPath === null) return fsErr('Cannot remove mount root', 'invalid');
    const parentResolved = await this.resolveHandle(mount, parentPath === '' ? '/' : parentPath);
    if (!parentResolved.ok || parentResolved.value.kind !== 'directory') {
      return fsErr('Parent folder missing', 'not-found');
    }
    const name = baseName(parsed.relPath, resolved.value.name);
    try {
      await (parentResolved.value.handle as FileSystemDirectoryHandle).removeEntry(name);
      return fsOk(undefined);
    } catch {
      return fsErr('Delete failed', 'permission-denied');
    }
  }

  async getParent(id: string): Promise<FSResult<FSEntry | null>> {
    const entry = await this.get(id);
    if (!entry.ok) return entry;
    if (!entry.value.parentId) return fsOk(null);
    return this.get(entry.value.parentId);
  }

  async getBreadcrumbs(id: string): Promise<FSResult<FSEntry[]>> {
    const trail: FSEntry[] = [];
    let currentId: string | null = id;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const r = await this.get(currentId);
      if (!r.ok) return r;
      trail.unshift(r.value);
      currentId = r.value.parentId;
    }
    return fsOk(trail);
  }

  async canWrite(id: string): Promise<boolean> {
    const parsed = this.parseGlobal(id);
    if (!parsed) return false;
    const m = this.mounts.get(parsed.mountId);
    return !!m && m.record.writeEnabled && m.permissionState === 'connected';
  }

  private parseGlobal(id: string): { mountId: string; relPath: string } | null {
    if (!id.startsWith(`${BROWSER_LOCAL_PROVIDER_ID}:`)) return null;
    const local = id.slice(BROWSER_LOCAL_PROVIDER_ID.length + 1);
    return parseLocalId(local);
  }

  /** Snapshot mount records for persistence. */
  getMountRecords(): MountRecord[] {
    return [...this.mounts.values()].map((m) => m.record);
  }
}
