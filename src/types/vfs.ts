/**
 * Virtual Filesystem types
 *
 * The VFS is a tree of nodes rooted at "/". Each node has a unique id, a name,
 * a parent id (null for root), a kind (file | folder), and optional content.
 */

export type NodeKind = 'file' | 'folder';

export interface VFSNode {
  id: string;
  name: string;
  parentId: string | null;
  kind: NodeKind;
  /** File content (empty string for folders) */
  content?: string;
  /** MIME type hint for files (e.g. image/png, text/plain) */
  mime?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VFSTree {
  nodes: Record<string, VFSNode>;
  rootId: string;
}

/** Result of a VFS operation that can fail. */
export type VFSResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): VFSResult<T> {
  return { ok: true, value };
}

export function err<T = never>(error: string): VFSResult<T> {
  return { ok: false, error };
}
