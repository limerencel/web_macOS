/**
 * Virtual Filesystem (VFS) service
 *
 * A pure, in-memory tree of VFSNode objects. All mutation operations return
 * VFSResult so callers can surface errors to the user. Persistence is handled
 * separately by the IndexedDB store, which snapshots the whole tree.
 *
 * The tree uses a flat record keyed by id for O(1) lookups; parent/child
 * relationships are derived from `parentId`.
 */

import type { VFSNode, VFSTree, VFSResult } from '../types/vfs';
import { ok, err } from '../types/vfs';

const ROOT_ID = 'root';

function makeId(): string {
  return `n_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function now(): number {
  return Date.now();
}

/** Create a fresh tree with a root folder. */
export function createTree(): VFSTree {
  const root: VFSNode = {
    id: ROOT_ID,
    name: '',
    parentId: null,
    kind: 'folder',
    createdAt: 0,
    updatedAt: 0,
  };
  return { nodes: { [ROOT_ID]: root }, rootId: ROOT_ID };
}

/** Create a populated default tree with sample folders and files. */
export function createDefaultTree(): VFSTree {
  const tree = createTree();
  mkdir(tree, ROOT_ID, 'Desktop');
  mkdir(tree, ROOT_ID, 'Documents');
  mkdir(tree, ROOT_ID, 'Pictures');
  mkdir(tree, ROOT_ID, 'Downloads');
  const docs = findByName(tree, ROOT_ID, 'Documents');
  if (docs) {
    const created = touch(tree, docs.id, 'Welcome.txt');
    if (created.ok) {
      write(tree, created.value.id, 'Welcome to WebOS!\n\nThis is a fully in-browser desktop environment.\nDouble-click apps in the dock or use Spotlight (top-right) to search.\n\nTips:\n- Files you create are saved to IndexedDB and persist across reloads.\n- Open the Terminal and type "help" for available commands.\n- The Text Editor can open, edit, and save files.\n- Right-click the desktop for a context menu.\n');
    }
  }
  return tree;
}

/** Get a node by id. */
export function getNode(tree: VFSTree, id: string): VFSNode | undefined {
  return tree.nodes[id];
}

/** Get the root node. */
export function getRoot(tree: VFSTree): VFSNode {
  return tree.nodes[tree.rootId];
}

/** List children of a folder, sorted: folders first then files, alphabetical. */
export function listChildren(tree: VFSTree, folderId: string): VFSNode[] {
  const children: VFSNode[] = [];
  for (const id in tree.nodes) {
    const node = tree.nodes[id];
    if (node.parentId === folderId) children.push(node);
  }
  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return children;
}

/** Find a direct child by name (case-insensitive). */
export function findByName(tree: VFSTree, folderId: string, name: string): VFSNode | undefined {
  return listChildren(tree, folderId).find((c) => c.name.toLowerCase() === name.toLowerCase());
}

/** Resolve a path like "/Documents/Notes.txt" to a node. */
export function resolvePath(tree: VFSTree, path: string): VFSNode | undefined {
  const parts = path.split('/').filter(Boolean);
  let current = getRoot(tree);
  for (const part of parts) {
    if (current.kind !== 'folder') return undefined;
    const next = findByName(tree, current.id, part);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

/** Get the full path of a node, e.g. "/Documents/Notes.txt". */
export function getPath(tree: VFSTree, id: string): string {
  const parts: string[] = [];
  let current = tree.nodes[id];
  while (current && current.parentId !== null) {
    parts.unshift(current.name);
    current = tree.nodes[current.parentId];
  }
  return '/' + parts.join('/');
}

/** Create a folder inside `parentId`. Fails if a sibling with the same name exists. */
export function mkdir(tree: VFSTree, parentId: string, name: string): VFSResult<VFSNode> {
  const parent = tree.nodes[parentId];
  if (!parent || parent.kind !== 'folder') return err('Parent folder does not exist');
  if (findByName(tree, parentId, name)) return err(`"${name}" already exists`);
  const node: VFSNode = {
    id: makeId(),
    name,
    parentId,
    kind: 'folder',
    createdAt: now(),
    updatedAt: now(),
  };
  tree.nodes[node.id] = node;
  return ok(node);
}

/** Create an empty file. Fails on duplicate name. */
export function touch(tree: VFSTree, parentId: string, name: string): VFSResult<VFSNode> {
  const parent = tree.nodes[parentId];
  if (!parent || parent.kind !== 'folder') return err('Parent folder does not exist');
  if (findByName(tree, parentId, name)) return err(`"${name}" already exists`);
  const node: VFSNode = {
    id: makeId(),
    name,
    parentId,
    kind: 'file',
    content: '',
    mime: 'text/plain',
    createdAt: now(),
    updatedAt: now(),
  };
  tree.nodes[node.id] = node;
  return ok(node);
}

/** Write content to a file. */
export function write(tree: VFSTree, id: string, content: string): VFSResult<VFSNode> {
  const node = tree.nodes[id];
  if (!node) return err('File not found');
  if (node.kind !== 'file') return err('Not a file');
  node.content = content;
  node.updatedAt = now();
  return ok(node);
}

/** Rename a node (rejects duplicate sibling names). */
export function rename(tree: VFSTree, id: string, name: string): VFSResult<VFSNode> {
  const node = tree.nodes[id];
  if (!node || !node.parentId) return err('Cannot rename root');
  if (findByName(tree, node.parentId, name)) return err(`"${name}" already exists`);
  node.name = name;
  node.updatedAt = now();
  return ok(node);
}

/** Move a node into another folder. */
export function move(tree: VFSTree, id: string, destFolderId: string): VFSResult<VFSNode> {
  const node = tree.nodes[id];
  const dest = tree.nodes[destFolderId];
  if (!node || !dest) return err('Node or destination not found');
  if (dest.kind !== 'folder') return err('Destination is not a folder');
  if (id === destFolderId) return err('Cannot move a folder into itself');
  // Prevent moving into own descendant
  let cursor: VFSNode | undefined = dest;
  while (cursor) {
    if (cursor.id === id) return err('Cannot move a folder into its own descendant');
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }
  if (findByName(tree, destFolderId, node.name)) return err(`"${node.name}" already exists in destination`);
  node.parentId = destFolderId;
  node.updatedAt = now();
  return ok(node);
}

/** Remove a node and all its descendants. */
export function remove(tree: VFSTree, id: string): VFSResult<void> {
  const node = tree.nodes[id];
  if (!node || !node.parentId) return err('Cannot remove root');
  const toDelete: string[] = [];
  const collect = (nid: string) => {
    toDelete.push(nid);
    for (const otherId in tree.nodes) {
      if (tree.nodes[otherId].parentId === nid) collect(otherId);
    }
  };
  collect(id);
  for (const nid of toDelete) delete tree.nodes[nid];
  return ok(undefined);
}

/** Create a deep clone of a tree (used for snapshots and tests). */
export function cloneTree(tree: VFSTree): VFSTree {
  const nodes: Record<string, VFSNode> = {};
  for (const id in tree.nodes) {
    nodes[id] = { ...tree.nodes[id] };
  }
  return { nodes, rootId: tree.rootId };
}

/** Find all file nodes whose name matches a case-insensitive substring. */
export function search(tree: VFSTree, query: string): VFSNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: VFSNode[] = [];
  for (const id in tree.nodes) {
    const node = tree.nodes[id];
    if (node.parentId && node.name.toLowerCase().includes(q)) results.push(node);
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
