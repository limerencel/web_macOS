/**
 * VFS Store — reactive wrapper around the pure VFS service
 *
 * Holds the current tree in Zustand so React components can subscribe to
 * filesystem changes. On every mutation we persist a snapshot to IndexedDB.
 */

import { create } from 'zustand';
import type { VFSNode, VFSTree, VFSResult } from '../types/vfs';
import * as vfs from '../services/vfs';
import { load, persist } from '../services/db';

const VFS_KEY = 'vfs-tree-v1';

interface VFSStoreState {
  tree: VFSTree;
  ready: boolean;
  init: () => Promise<void>;
  listChildren: (folderId: string) => VFSNode[];
  getNode: (id: string) => VFSNode | undefined;
  resolvePath: (path: string) => VFSNode | undefined;
  getPath: (id: string) => string;
  findByName: (folderId: string, name: string) => VFSNode | undefined;
  mkdir: (parentId: string, name: string) => VFSResult<VFSNode>;
  touch: (parentId: string, name: string) => VFSResult<VFSNode>;
  write: (id: string, content: string) => VFSResult<VFSNode>;
  rename: (id: string, name: string) => VFSResult<VFSNode>;
  move: (id: string, destFolderId: string) => VFSResult<VFSNode>;
  remove: (id: string) => VFSResult<void>;
  search: (query: string) => VFSNode[];
}

function commit(tree: VFSTree, set: (partial: Partial<VFSStoreState>) => void, get: () => VFSStoreState): void {
  set({ tree });
  void persist(VFS_KEY, get().tree);
}

export const useVFS = create<VFSStoreState>((set, get) => ({
  tree: vfs.createTree(),
  ready: false,

  init: async () => {
    const saved = await load<VFSTree>(VFS_KEY);
    if (saved && saved.nodes && saved.rootId) {
      set({ tree: saved, ready: true });
    } else {
      const fresh = vfs.createDefaultTree();
      set({ tree: fresh, ready: true });
      await persist(VFS_KEY, fresh);
    }
  },

  listChildren: (folderId) => vfs.listChildren(get().tree, folderId),
  getNode: (id) => vfs.getNode(get().tree, id),
  resolvePath: (path) => vfs.resolvePath(get().tree, path),
  getPath: (id) => vfs.getPath(get().tree, id),
  findByName: (folderId, name) => vfs.findByName(get().tree, folderId, name),

  mkdir: (parentId, name) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.mkdir(tree, parentId, name);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  touch: (parentId, name) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.touch(tree, parentId, name);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  write: (id, content) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.write(tree, id, content);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  rename: (id, name) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.rename(tree, id, name);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  move: (id, destFolderId) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.move(tree, id, destFolderId);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  remove: (id) => {
    const tree = vfs.cloneTree(get().tree);
    const result = vfs.remove(tree, id);
    if (result.ok) commit(tree, set, get);
    return result;
  },

  search: (query) => vfs.search(get().tree, query),
}));
