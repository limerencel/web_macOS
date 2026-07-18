import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystemProvider } from '../../src/services/fs/VirtualFileSystemProvider';
import { BrowserLocalFolderProvider } from '../../src/services/fs/BrowserLocalFolderProvider';
import * as vfs from '../../src/services/vfs';
import type { VFSTree } from '../../src/types/vfs';
import { createMockDirectory, createDemoLocalTree } from '../../src/services/fs/mockDirectory';
import { encodeLocalId, parseLocalId } from '../../src/services/fs/BrowserLocalFolderProvider';

function makeVirtualProvider(tree: VFSTree) {
  return new VirtualFileSystemProvider(
    () => tree,
    {
      mkdir: (p, n) => vfs.mkdir(tree, p, n),
      touch: (p, n) => vfs.touch(tree, p, n),
      write: (id, c) => vfs.write(tree, id, c),
      rename: (id, n) => vfs.rename(tree, id, n),
      remove: (id) => vfs.remove(tree, id),
      setMime: (id, mime) => {
        const node = tree.nodes[id];
        if (node) node.mime = mime;
      },
    }
  );
}

describe('VirtualFileSystemProvider', () => {
  let tree: VFSTree;
  let provider: VirtualFileSystemProvider;

  beforeEach(() => {
    tree = vfs.createDefaultTree();
    provider = makeVirtualProvider(tree);
  });

  it('lists root folders', async () => {
    const root = await provider.getRoot();
    expect(root.ok).toBe(true);
    if (!root.ok) return;
    const list = await provider.list(root.value.id);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const names = list.value.map((e) => e.name);
    expect(names).toContain('Documents');
    expect(names).toContain('Desktop');
  });

  it('reads and writes text files', async () => {
    const root = await provider.getRoot();
    if (!root.ok) return;
    const docs = (await provider.list(root.value.id)).ok
      ? (await provider.list(root.value.id)).ok &&
        (await provider.list(root.value.id))
      : null;
    if (!docs || !docs.ok) return;
    const documents = docs.value.find((e) => e.name === 'Documents');
    expect(documents).toBeTruthy();
    if (!documents) return;

    const created = await provider.createFile(documents.id, 'hello.txt', 'hi');
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const text = await provider.readText(created.value.id);
    expect(text.ok && text.value).toBe('hi');

    const written = await provider.writeText(created.value.id, 'updated');
    expect(written.ok).toBe(true);
    const again = await provider.readText(created.value.id);
    expect(again.ok && again.value).toBe('updated');
  });

  it('renames and removes', async () => {
    const root = await provider.getRoot();
    if (!root.ok) return;
    const file = await provider.createFile(root.value.id, 'a.txt', 'x');
    if (!file.ok) return;
    const ren = await provider.rename(file.value.id, 'b.txt');
    expect(ren.ok).toBe(true);
    if (!ren.ok) return;
    expect(ren.value.name).toBe('b.txt');
    const rm = await provider.remove(file.value.id);
    expect(rm.ok).toBe(true);
  });

  it('provides breadcrumbs', async () => {
    const welcome = vfs.resolvePath(tree, '/Documents/Welcome.txt');
    expect(welcome).toBeTruthy();
    if (!welcome) return;
    const crumbs = await provider.getBreadcrumbs(`vfs:${welcome.id}`);
    expect(crumbs.ok).toBe(true);
    if (!crumbs.ok) return;
    expect(crumbs.value.map((c) => c.name).join('/')).toContain('Documents');
    expect(crumbs.value[crumbs.value.length - 1].name).toBe('Welcome.txt');
  });

  it('createObjectURL returns a blob url for files', async () => {
    const root = await provider.getRoot();
    if (!root.ok) return;
    const file = await provider.createFile(root.value.id, 'pic.svg', '<svg></svg>');
    if (!file.ok) return;
    const orig = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:virtual-test';
    try {
      const url = await provider.createObjectURL(file.value.id);
      expect(url.ok && url.value).toBe('blob:virtual-test');
    } finally {
      URL.createObjectURL = orig;
    }
  });
});

describe('BrowserLocalFolderProvider', () => {
  let provider: BrowserLocalFolderProvider;

  beforeEach(() => {
    provider = new BrowserLocalFolderProvider();
  });

  it('encodes and parses local ids', () => {
    const enc = encodeLocalId('m1', 'images/dot.png');
    expect(enc).toBe('m1:images/dot.png');
    expect(parseLocalId(enc)).toEqual({ mountId: 'm1', relPath: 'images/dot.png' });
  });

  it('mounts a mock directory and lists contents', async () => {
    const dir = createMockDirectory({
      name: 'TestMount',
      files: { 'readme.txt': 'hello local' },
      folders: {
        sub: { files: { 'nested.md': '# hi' } },
      },
    });
    const mount = await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_test',
      writeEnabled: false,
      persist: false,
    });
    expect(mount.ok).toBe(true);
    if (!mount.ok) return;
    expect(mount.value.permissionState).toBe('connected');
    expect(mount.value.writeEnabled).toBe(false);

    const rootId = provider.mountRootId('m_test');
    const list = await provider.list(rootId);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const names = list.value.map((e) => e.name).sort();
    expect(names).toEqual(['readme.txt', 'sub']);

    const readme = list.value.find((e) => e.name === 'readme.txt');
    expect(readme).toBeTruthy();
    if (!readme) return;
    const text = await provider.readText(readme.id);
    expect(text.ok && text.value).toBe('hello local');
  });

  it('defaults to read-only writes blocked', async () => {
    const dir = createMockDirectory({ name: 'RO', files: { 'a.txt': 'x' } });
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_ro',
      writeEnabled: false,
      persist: false,
    });
    const rootId = provider.mountRootId('m_ro');
    const list = await provider.list(rootId);
    if (!list.ok) return;
    const file = list.value[0];
    const w = await provider.writeText(file.id, 'nope');
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.code).toBe('read-only');
  });

  it('allows write when enabled', async () => {
    const dir = createMockDirectory({ name: 'RW', files: { 'a.txt': 'old' } });
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_rw',
      writeEnabled: true,
      persist: false,
    });
    const rootId = provider.mountRootId('m_rw');
    const list = await provider.list(rootId);
    if (!list.ok) return;
    const file = list.value.find((e) => e.name === 'a.txt');
    if (!file) return;
    const w = await provider.writeText(file.id, 'new');
    expect(w.ok).toBe(true);
    const text = await provider.readText(file.id);
    expect(text.ok && text.value).toBe('new');
  });

  it('blocks recursive delete of non-empty folder', async () => {
    const dir = createMockDirectory({
      name: 'Del',
      folders: { keep: { files: { 'x.txt': '1' } } },
    });
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_del',
      writeEnabled: true,
      persist: false,
    });
    const rootId = provider.mountRootId('m_del');
    const list = await provider.list(rootId);
    if (!list.ok) return;
    const folder = list.value.find((e) => e.name === 'keep');
    if (!folder) return;
    const rm = await provider.remove(folder.id);
    expect(rm.ok).toBe(false);
    if (!rm.ok) expect(rm.code).toBe('not-empty');
  });

  it('surfaces permission-required when handle denies', async () => {
    const dir = createMockDirectory({ name: 'Perm', files: { 'a.txt': 'z' } });
    dir.permission = 'prompt';
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_perm',
      persist: false,
    });
    // Force permission state
    const rt = (
      provider as unknown as {
        mounts: Map<string, { permissionState: string; handle: { permission: string } }>;
      }
    ).mounts.get('m_perm');
    if (rt) {
      rt.permissionState = 'permission-required';
      rt.handle.permission = 'denied';
    }
    const rootId = provider.mountRootId('m_perm');
    const list = await provider.list(rootId);
    expect(list.ok).toBe(false);
    if (!list.ok) expect(list.code).toBe('permission-denied');
  });

  it('navigates nested folders and reads demo tree', async () => {
    const dir = createDemoLocalTree();
    // Wait for async PNG patch
    await new Promise((r) => setTimeout(r, 20));
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_demo',
      persist: false,
    });
    const rootId = provider.mountRootId('m_demo');
    const list = await provider.list(rootId);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const images = list.value.find((e) => e.name === 'images');
    expect(images?.kind).toBe('folder');
    if (!images) return;
    const imgs = await provider.list(images.id);
    expect(imgs.ok).toBe(true);
    if (!imgs.ok) return;
    expect(imgs.value.some((e) => e.name === 'banner.svg')).toBe(true);
    const svg = imgs.value.find((e) => e.name === 'banner.svg');
    if (!svg) return;
    const text = await provider.readText(svg.id);
    expect(text.ok && text.value).toContain('<svg');
  });

  it('rename file when writable', async () => {
    const dir = createMockDirectory({ name: 'Rn', files: { 'old.txt': 'data' } });
    await provider.mountHandle(dir as unknown as FileSystemDirectoryHandle, {
      id: 'm_rn',
      writeEnabled: true,
      persist: false,
    });
    const rootId = provider.mountRootId('m_rn');
    const list = await provider.list(rootId);
    if (!list.ok) return;
    const file = list.value[0];
    const ren = await provider.rename(file.id, 'new.txt');
    expect(ren.ok).toBe(true);
    if (!ren.ok) return;
    expect(ren.value.name).toBe('new.txt');
    const list2 = await provider.list(rootId);
    if (!list2.ok) return;
    expect(list2.value.map((e) => e.name)).toContain('new.txt');
  });
});
