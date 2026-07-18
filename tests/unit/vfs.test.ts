import { describe, it, expect, beforeEach } from 'vitest';
import * as vfs from '../../src/services/vfs';

describe('VFS', () => {
  let tree: ReturnType<typeof vfs.createTree>;

  beforeEach(() => {
    tree = vfs.createTree();
  });

  it('creates a root folder', () => {
    const root = vfs.getRoot(tree);
    expect(root.kind).toBe('folder');
    expect(root.parentId).toBeNull();
  });

  it('mkdir and listChildren', () => {
    const r = vfs.mkdir(tree, tree.rootId, 'Docs');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kids = vfs.listChildren(tree, tree.rootId);
    expect(kids.map((k) => k.name)).toContain('Docs');
  });

  it('rejects duplicate names', () => {
    vfs.mkdir(tree, tree.rootId, 'A');
    const r = vfs.mkdir(tree, tree.rootId, 'A');
    expect(r.ok).toBe(false);
  });

  it('touch, write, and cat via getPath/resolvePath', () => {
    const f = vfs.touch(tree, tree.rootId, 'note.txt');
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    vfs.write(tree, f.value.id, 'hello');
    const path = vfs.getPath(tree, f.value.id);
    expect(path).toBe('/note.txt');
    const found = vfs.resolvePath(tree, '/note.txt');
    expect(found?.content).toBe('hello');
  });

  it('rename and remove', () => {
    const f = vfs.touch(tree, tree.rootId, 'a.txt');
    if (!f.ok) return;
    const ren = vfs.rename(tree, f.value.id, 'b.txt');
    expect(ren.ok).toBe(true);
    expect(vfs.findByName(tree, tree.rootId, 'b.txt')).toBeTruthy();
    const rm = vfs.remove(tree, f.value.id);
    expect(rm.ok).toBe(true);
    expect(vfs.findByName(tree, tree.rootId, 'b.txt')).toBeUndefined();
  });

  it('cannot remove root', () => {
    const r = vfs.remove(tree, tree.rootId);
    expect(r.ok).toBe(false);
  });

  it('move into folder', () => {
    const folder = vfs.mkdir(tree, tree.rootId, 'Box');
    const file = vfs.touch(tree, tree.rootId, 'x.txt');
    if (!folder.ok || !file.ok) return;
    const m = vfs.move(tree, file.value.id, folder.value.id);
    expect(m.ok).toBe(true);
    expect(vfs.getPath(tree, file.value.id)).toBe('/Box/x.txt');
  });

  it('prevents moving folder into descendant', () => {
    const a = vfs.mkdir(tree, tree.rootId, 'A');
    if (!a.ok) return;
    const b = vfs.mkdir(tree, a.value.id, 'B');
    if (!b.ok) return;
    const m = vfs.move(tree, a.value.id, b.value.id);
    expect(m.ok).toBe(false);
  });

  it('search finds by substring', () => {
    vfs.touch(tree, tree.rootId, 'Report-2024.txt');
    vfs.touch(tree, tree.rootId, 'Notes.md');
    const hits = vfs.search(tree, 'report');
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe('Report-2024.txt');
  });

  it('createDefaultTree has Desktop and Documents', () => {
    const d = vfs.createDefaultTree();
    expect(vfs.findByName(d, d.rootId, 'Desktop')).toBeTruthy();
    expect(vfs.findByName(d, d.rootId, 'Documents')).toBeTruthy();
    const docs = vfs.findByName(d, d.rootId, 'Documents')!;
    expect(vfs.findByName(d, docs.id, 'Welcome.txt')).toBeTruthy();
  });

  it('cloneTree deep-copies nodes', () => {
    vfs.touch(tree, tree.rootId, 'a.txt');
    const clone = vfs.cloneTree(tree);
    const f = vfs.findByName(tree, tree.rootId, 'a.txt')!;
    vfs.write(tree, f.id, 'changed');
    const cf = vfs.findByName(clone, clone.rootId, 'a.txt')!;
    expect(cf.content).toBe('');
  });
});
