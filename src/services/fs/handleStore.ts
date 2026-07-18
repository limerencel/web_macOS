/**
 * Persistence for FileSystemDirectoryHandle objects and mount metadata.
 *
 * Handles are stored in IndexedDB (structured-clone supported in Chromium).
 * Metadata (name, write toggle, timestamps) is stored as JSON-serializable records.
 */

import type { MountRecord, RecentFileRecord, RecentMountRecord } from '../../types/fs';

const DB_NAME = 'webos-fs-handles';
const DB_VERSION = 1;
const HANDLE_STORE = 'handles';
const META_STORE = 'meta';

const MOUNTS_KEY = 'mounts-v1';
const RECENT_FILES_KEY = 'recent-files-v1';
const RECENT_MOUNTS_KEY = 'recent-mounts-v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

async function metaGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function metaPut<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[fs-idb] meta put failed', e);
  }
}

export async function saveDirectoryHandle(
  mountId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, mountId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[fs-idb] handle save failed', e);
    throw e;
  }
}

export async function loadDirectoryHandle(
  mountId: string
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await openDB();
    return await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(mountId);
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function deleteDirectoryHandle(mountId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(mountId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function loadMountRecords(): Promise<MountRecord[]> {
  return (await metaGet<MountRecord[]>(MOUNTS_KEY)) ?? [];
}

export async function saveMountRecords(mounts: MountRecord[]): Promise<void> {
  await metaPut(MOUNTS_KEY, mounts);
}

export async function loadRecentFiles(): Promise<RecentFileRecord[]> {
  return (await metaGet<RecentFileRecord[]>(RECENT_FILES_KEY)) ?? [];
}

export async function saveRecentFiles(items: RecentFileRecord[]): Promise<void> {
  await metaPut(RECENT_FILES_KEY, items);
}

export async function loadRecentMounts(): Promise<RecentMountRecord[]> {
  return (await metaGet<RecentMountRecord[]>(RECENT_MOUNTS_KEY)) ?? [];
}

export async function saveRecentMounts(items: RecentMountRecord[]): Promise<void> {
  await metaPut(RECENT_MOUNTS_KEY, items);
}

/** Test helper — reset module DB promise (after deleting the database). */
export function resetHandleDbForTests(): void {
  dbPromise = null;
}

export const FS_HANDLES_DB_NAME = DB_NAME;
