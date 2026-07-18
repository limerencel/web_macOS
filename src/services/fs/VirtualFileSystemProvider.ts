/**
 * VirtualFileSystemProvider — adapts the existing pure VFS tree to FileSystemProvider.
 *
 * The VFS remains the source of truth for in-browser files (IndexedDB-backed via
 * vfsStore). This provider never touches the File System Access API.
 */

import type {
  FileSystemProvider,
  FSEntry,
  FSResult,
  ListOptions,
} from '../../types/fs';
import {
  fsOk,
  fsErr,
  makeEntryId,
  guessMime,
  sortEntries,
} from '../../types/fs';
import type { VFSNode, VFSTree } from '../../types/vfs';
import * as vfs from '../vfs';

export const VIRTUAL_PROVIDER_ID = 'vfs';

export type VFSTreeAccessor = () => VFSTree;
export type VFSMutator = {
  mkdir: (parentId: string, name: string) => { ok: true; value: VFSNode } | { ok: false; error: string };
  touch: (parentId: string, name: string) => { ok: true; value: VFSNode } | { ok: false; error: string };
  write: (id: string, content: string) => { ok: true; value: VFSNode } | { ok: false; error: string };
  rename: (id: string, name: string) => { ok: true; value: VFSNode } | { ok: false; error: string };
  remove: (id: string) => { ok: true; value: void } | { ok: false; error: string };
  setMime?: (id: string, mime: string) => void;
};

function toLocalId(globalId: string): string | null {
  if (!globalId.startsWith(`${VIRTUAL_PROVIDER_ID}:`)) return null;
  return globalId.slice(VIRTUAL_PROVIDER_ID.length + 1);
}

function toGlobalId(nodeId: string): string {
  return makeEntryId(VIRTUAL_PROVIDER_ID, nodeId);
}

function nodeToEntry(tree: VFSTree, node: VFSNode): FSEntry {
  const path = vfs.getPath(tree, node.id) || '/';
  const mime =
    node.kind === 'file'
      ? node.mime || guessMime(node.name, node.content?.startsWith('data:') ? undefined : 'text/plain')
      : undefined;
  return {
    id: toGlobalId(node.id),
    name: node.name || 'Home',
    kind: node.kind,
    parentId: node.parentId ? toGlobalId(node.parentId) : null,
    providerId: VIRTUAL_PROVIDER_ID,
    path: path === '' ? '/' : path,
    mime,
    size: node.kind === 'file' ? (node.content?.length ?? 0) : undefined,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    writable: true,
  };
}

/**
 * Decode data-URL or raw content into a Blob for media APIs.
 */
function contentToBlob(content: string, mime: string): Blob {
  if (content.startsWith('data:')) {
    const comma = content.indexOf(',');
    if (comma < 0) return new Blob([content], { type: mime });
    const header = content.slice(0, comma);
    const data = content.slice(comma + 1);
    const isBase64 = /;base64/i.test(header);
    const headerMime = header.match(/^data:([^;,]+)/i)?.[1] || mime;
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: headerMime });
    }
    return new Blob([decodeURIComponent(data)], { type: headerMime });
  }
  return new Blob([content], { type: mime });
}

export class VirtualFileSystemProvider implements FileSystemProvider {
  readonly id = VIRTUAL_PROVIDER_ID;
  readonly name = 'WebOS Files';
  readonly kind = 'virtual' as const;

  constructor(
    private readonly getTree: VFSTreeAccessor,
    private readonly mutator: VFSMutator
  ) {}

  async getRoot(): Promise<FSResult<FSEntry>> {
    const tree = this.getTree();
    const root = vfs.getRoot(tree);
    return fsOk(nodeToEntry(tree, root));
  }

  async get(id: string): Promise<FSResult<FSEntry>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid virtual entry id', 'invalid');
    const tree = this.getTree();
    const node = vfs.getNode(tree, local);
    if (!node) return fsErr('File not found', 'not-found');
    return fsOk(nodeToEntry(tree, node));
  }

  async list(folderId: string, options?: ListOptions): Promise<FSResult<FSEntry[]>> {
    const local = toLocalId(folderId);
    if (!local) return fsErr('Invalid folder id', 'invalid');
    const tree = this.getTree();
    const folder = vfs.getNode(tree, local);
    if (!folder) return fsErr('Folder not found', 'not-found');
    if (folder.kind !== 'folder') return fsErr('Not a folder', 'invalid');
    const children = vfs.listChildren(tree, local).map((n) => nodeToEntry(tree, n));
    return fsOk(sortEntries(children, options?.sortBy ?? 'name', options?.sortDir ?? 'asc'));
  }

  async readText(id: string): Promise<FSResult<string>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    const tree = this.getTree();
    const node = vfs.getNode(tree, local);
    if (!node) return fsErr('File not found', 'not-found');
    if (node.kind !== 'file') return fsErr('Not a file', 'invalid');
    const content = node.content ?? '';
    // Avoid dumping huge binary data-URLs as "text"
    if (content.startsWith('data:') && !content.startsWith('data:text') && !content.startsWith('data:image/svg')) {
      return fsErr('File is binary; use readBlob', 'not-supported');
    }
    if (content.startsWith('data:text') || content.startsWith('data:image/svg')) {
      const comma = content.indexOf(',');
      if (comma >= 0) {
        const header = content.slice(0, comma);
        const data = content.slice(comma + 1);
        if (/;base64/i.test(header)) {
          try {
            return fsOk(atob(data));
          } catch {
            return fsOk(data);
          }
        }
        return fsOk(decodeURIComponent(data));
      }
    }
    return fsOk(content);
  }

  async readBlob(id: string): Promise<FSResult<Blob>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    const tree = this.getTree();
    const node = vfs.getNode(tree, local);
    if (!node) return fsErr('File not found', 'not-found');
    if (node.kind !== 'file') return fsErr('Not a file', 'invalid');
    const mime = node.mime || guessMime(node.name);
    return fsOk(contentToBlob(node.content ?? '', mime));
  }

  async createObjectURL(id: string): Promise<FSResult<string>> {
    const blobResult = await this.readBlob(id);
    if (!blobResult.ok) return blobResult;
    return fsOk(URL.createObjectURL(blobResult.value));
  }

  async writeText(id: string, content: string): Promise<FSResult<FSEntry>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    const r = this.mutator.write(local, content);
    if (!r.ok) return fsErr(r.error, 'not-found');
    return this.get(id);
  }

  async writeBlob(id: string, blob: Blob): Promise<FSResult<FSEntry>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    const dataUrl = await blobToDataURL(blob);
    const r = this.mutator.write(local, dataUrl);
    if (!r.ok) return fsErr(r.error, 'not-found');
    this.mutator.setMime?.(local, blob.type || guessMime(r.value.name));
    return this.get(id);
  }

  async mkdir(parentId: string, name: string): Promise<FSResult<FSEntry>> {
    const local = toLocalId(parentId);
    if (!local) return fsErr('Invalid parent id', 'invalid');
    const r = this.mutator.mkdir(local, name);
    if (!r.ok) {
      const code = r.error.includes('already exists') ? 'already-exists' : 'invalid';
      return fsErr(r.error, code);
    }
    return this.get(toGlobalId(r.value.id));
  }

  async createFile(parentId: string, name: string, content = ''): Promise<FSResult<FSEntry>> {
    const local = toLocalId(parentId);
    if (!local) return fsErr('Invalid parent id', 'invalid');
    const r = this.mutator.touch(local, name);
    if (!r.ok) {
      const code = r.error.includes('already exists') ? 'already-exists' : 'invalid';
      return fsErr(r.error, code);
    }
    if (content) {
      this.mutator.write(r.value.id, content);
    }
    this.mutator.setMime?.(r.value.id, guessMime(name, 'text/plain'));
    return this.get(toGlobalId(r.value.id));
  }

  async rename(id: string, newName: string): Promise<FSResult<FSEntry>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    const r = this.mutator.rename(local, newName);
    if (!r.ok) {
      const code = r.error.includes('already exists') ? 'already-exists' : 'invalid';
      return fsErr(r.error, code);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<FSResult<void>> {
    const local = toLocalId(id);
    if (!local) return fsErr('Invalid entry id', 'invalid');
    // VFS remove is recursive historically — for provider contract we still allow
    // it on the virtual tree (in-browser only) but surface the same API.
    const r = this.mutator.remove(local);
    if (!r.ok) return fsErr(r.error, 'invalid');
    return fsOk(undefined);
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

  async canWrite(_id: string): Promise<boolean> {
    return true;
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Build a VirtualFileSystemProvider bound to the live vfsStore state. */
export function createVirtualProviderFromStore(store: {
  getState: () => {
    tree: VFSTree;
    mkdir: VFSMutator['mkdir'];
    touch: VFSMutator['touch'];
    write: VFSMutator['write'];
    rename: VFSMutator['rename'];
    remove: VFSMutator['remove'];
  };
  setState: (
    partial:
      | Partial<{ tree: VFSTree }>
      | ((s: { tree: VFSTree }) => Partial<{ tree: VFSTree }>)
  ) => void;
}): VirtualFileSystemProvider {
  return new VirtualFileSystemProvider(
    () => store.getState().tree,
    {
      mkdir: (p, n) => store.getState().mkdir(p, n),
      touch: (p, n) => store.getState().touch(p, n),
      write: (id, c) => store.getState().write(id, c),
      rename: (id, n) => store.getState().rename(id, n),
      remove: (id) => store.getState().remove(id),
      setMime: (id, mime) => {
        store.setState((s) => {
          const node = s.tree.nodes[id];
          if (!node) return {};
          return {
            tree: {
              ...s.tree,
              nodes: {
                ...s.tree.nodes,
                [id]: { ...node, mime },
              },
            },
          };
        });
      },
    }
  );
}
