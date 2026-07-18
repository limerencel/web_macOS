/**
 * Unified filesystem types shared by virtual, browser-local, and future providers.
 *
 * Apps and Finder never call browser File System Access APIs directly — they go
 * through FileSystemProvider implementations only.
 */

export type FSEntryKind = 'file' | 'folder';

/** Connection / permission lifecycle for a mounted location. */
export type MountPermissionState =
  | 'connected'
  | 'permission-required'
  | 'unavailable'
  | 'disconnected';

export type FSProviderKind = 'virtual' | 'browser-local' | 'native';

export type FSErrorCode =
  | 'not-found'
  | 'permission-denied'
  | 'already-exists'
  | 'not-supported'
  | 'read-only'
  | 'unavailable'
  | 'user-cancelled'
  | 'invalid'
  | 'not-empty';

export interface FSEntry {
  /** Globally unique id: `${providerId}:${opaque}` */
  id: string;
  name: string;
  kind: FSEntryKind;
  /** Parent entry id, or null for a provider/mount root */
  parentId: string | null;
  providerId: string;
  /** Mount id when entry lives under a mounted location */
  mountId?: string;
  /** Logical path within the provider/mount, e.g. `/Documents/a.txt` or `/photo.png` */
  path: string;
  mime?: string;
  size?: number;
  createdAt?: number;
  updatedAt?: number;
  /** Whether this entry can be mutated given current mount settings + permissions */
  writable: boolean;
}

export type FSResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code?: FSErrorCode };

export function fsOk<T>(value: T): FSResult<T> {
  return { ok: true, value };
}

export function fsErr<T = never>(error: string, code?: FSErrorCode): FSResult<T> {
  return { ok: false, error, code };
}

export type SortKey = 'name' | 'kind' | 'modified' | 'size';
export type SortDirection = 'asc' | 'desc';

export interface ListOptions {
  sortBy?: SortKey;
  sortDir?: SortDirection;
}

/** Serializable mount metadata (handles stored separately). */
export interface MountRecord {
  id: string;
  name: string;
  providerId: string;
  writeEnabled: boolean;
  createdAt: number;
  lastAccessedAt: number;
  /** Display path / label hint */
  label?: string;
}

export interface MountView extends MountRecord {
  permissionState: MountPermissionState;
}

export interface RecentFileRecord {
  entryId: string;
  name: string;
  path: string;
  providerId: string;
  mountId?: string;
  mime?: string;
  openedAt: number;
}

export interface RecentMountRecord {
  mountId: string;
  name: string;
  openedAt: number;
}

/**
 * Provider contract. All filesystem I/O goes through this interface.
 * Implementations must be replaceable without changing Finder/apps.
 */
export interface FileSystemProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: FSProviderKind;

  /** Root entry for this provider (virtual home or a specific mount root). */
  getRoot(): Promise<FSResult<FSEntry>>;

  get(id: string): Promise<FSResult<FSEntry>>;

  list(folderId: string, options?: ListOptions): Promise<FSResult<FSEntry[]>>;

  readText(id: string): Promise<FSResult<string>>;

  readBlob(id: string): Promise<FSResult<Blob>>;

  /**
   * Create an object URL for media playback/preview.
   * Caller (or ObjectURLManager) must revoke when done.
   */
  createObjectURL(id: string): Promise<FSResult<string>>;

  writeText(id: string, content: string): Promise<FSResult<FSEntry>>;

  writeBlob(id: string, blob: Blob): Promise<FSResult<FSEntry>>;

  mkdir(parentId: string, name: string): Promise<FSResult<FSEntry>>;

  createFile(parentId: string, name: string, content?: string): Promise<FSResult<FSEntry>>;

  rename(id: string, newName: string): Promise<FSResult<FSEntry>>;

  /**
   * Delete a single file or empty folder.
   * Recursive deletion is intentionally unsupported in this milestone.
   */
  remove(id: string): Promise<FSResult<void>>;

  getParent(id: string): Promise<FSResult<FSEntry | null>>;

  /** Breadcrumb trail from root → entry (inclusive). */
  getBreadcrumbs(id: string): Promise<FSResult<FSEntry[]>>;

  canWrite(id: string): Promise<boolean>;
}

/** Parse a global entry id into provider + local parts. */
export function parseEntryId(id: string): { providerId: string; localId: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  return { providerId: id.slice(0, idx), localId: id.slice(idx + 1) };
}

export function makeEntryId(providerId: string, localId: string): string {
  return `${providerId}:${localId}`;
}

export function guessMime(name: string, fallback = 'application/octet-stream'): string {
  const lower = name.toLowerCase();
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.css': 'text/css',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
  };
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return fallback;
  return map[lower.slice(dot)] ?? fallback;
}

export function isImageName(name: string, mime?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name);
}

export function isVideoName(name: string, mime?: string): boolean {
  if (mime?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(name);
}

export function isTextName(name: string, mime?: string): boolean {
  if (mime?.startsWith('text/')) return true;
  if (mime === 'application/json' || mime === 'application/javascript') return true;
  return /\.(txt|md|json|js|ts|tsx|jsx|css|html?|xml|csv|log|yml|yaml|toml|ini|cfg|sh|bash|zsh|py|rs|go|java|c|cpp|h|hpp|rb|php|sql)$/i.test(
    name
  );
}

export function sortEntries(
  entries: FSEntry[],
  sortBy: SortKey = 'name',
  sortDir: SortDirection = 'asc'
): FSEntry[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    // Folders first always
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    let cmp = 0;
    switch (sortBy) {
      case 'kind':
        cmp = (a.mime ?? a.kind).localeCompare(b.mime ?? b.kind);
        break;
      case 'modified':
        cmp = (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        break;
      case 'size':
        cmp = (a.size ?? 0) - (b.size ?? 0);
        break;
      case 'name':
      default:
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return cmp * dir;
  });
}
