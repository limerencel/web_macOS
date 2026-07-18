/**
 * In-memory mock directory tree for unit tests and Playwright e2e.
 * Implements enough of FileSystemDirectoryHandle / FileSystemFileHandle
 * for BrowserLocalFolderProvider without a real picker.
 */

type MockNode =
  | { kind: 'file'; name: string; content: Uint8Array; type: string; lastModified: number }
  | { kind: 'directory'; name: string; children: Map<string, MockNode> };

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

class MockWritable {
  private chunks: Uint8Array[] = [];
  constructor(private readonly commit: (data: Uint8Array) => void) {}
  async write(data: BufferSource | Blob | string | { type?: string; data?: unknown }): Promise<void> {
    // Support WriteParams-shaped objects from the real API shape
    if (data && typeof data === 'object' && 'type' in data && (data as { type?: string }).type === 'write') {
      data = (data as { data?: BufferSource | Blob | string }).data as BufferSource | Blob | string;
    }
    if (typeof data === 'string') {
      this.chunks.push(encodeText(data));
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(data);
      });
      this.chunks.push(new Uint8Array(buf));
    } else if (ArrayBuffer.isView(data)) {
      this.chunks.push(
        new Uint8Array(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        )
      );
    } else if (data instanceof ArrayBuffer) {
      this.chunks.push(new Uint8Array(data));
    }
  }
  async seek(_p: number): Promise<void> {
    /* no-op for tests */
  }
  async truncate(_s: number): Promise<void> {
    this.chunks = [];
  }
  async close(): Promise<void> {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    this.commit(out);
  }
  // WritableStream stubs
  get locked() {
    return false;
  }
  abort(): Promise<void> {
    return Promise.resolve();
  }
  getWriter() {
    throw new Error('not implemented');
  }
}

export class MockFileHandle {
  readonly kind = 'file' as const;
  permission: PermissionState = 'granted';

  constructor(private node: Extract<MockNode, { kind: 'file' }>) {}

  get name(): string {
    return this.node.name;
  }

  async isSameEntry(other: { name: string; kind: string }): Promise<boolean> {
    return other.kind === 'file' && other.name === this.name;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async getFile(): Promise<File> {
    if (this.permission !== 'granted') throw new DOMException('Permission denied', 'NotAllowedError');
    const ab = toArrayBuffer(this.node.content);
    return new File([ab], this.node.name, {
      type: this.node.type || 'application/octet-stream',
      lastModified: this.node.lastModified,
    });
  }

  async createWritable(): Promise<MockWritable> {
    if (this.permission !== 'granted') throw new DOMException('Permission denied', 'NotAllowedError');
    return new MockWritable((data) => {
      this.node.content = data;
      this.node.lastModified = Date.now();
    });
  }
}

export class MockDirectoryHandle {
  readonly kind = 'directory' as const;
  permission: PermissionState = 'granted';

  constructor(private node: Extract<MockNode, { kind: 'directory' }>) {}

  get name(): string {
    return this.node.name;
  }

  async isSameEntry(other: { name: string; kind: string }): Promise<boolean> {
    return other.kind === 'directory' && other.name === this.name;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectoryHandle> {
    let child = this.node.children.get(name);
    if (!child) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      child = { kind: 'directory', name, children: new Map() };
      this.node.children.set(name, child);
    }
    if (child.kind !== 'directory') throw new DOMException('Type mismatch', 'TypeMismatchError');
    return new MockDirectoryHandle(child);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    let child = this.node.children.get(name);
    if (!child) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      child = {
        kind: 'file',
        name,
        content: new Uint8Array(),
        type: 'text/plain',
        lastModified: Date.now(),
      };
      this.node.children.set(name, child);
    }
    if (child.kind !== 'file') throw new DOMException('Type mismatch', 'TypeMismatchError');
    return new MockFileHandle(child);
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.node.children.has(name)) throw new DOMException('Not found', 'NotFoundError');
    this.node.children.delete(name);
  }

  async *entries(): AsyncGenerator<[string, MockFileHandle | MockDirectoryHandle]> {
    for (const [name, child] of this.node.children) {
      if (child.kind === 'directory') yield [name, new MockDirectoryHandle(child)];
      else yield [name, new MockFileHandle(child)];
    }
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of this.node.children.keys()) yield name;
  }

  async *values(): AsyncGenerator<MockFileHandle | MockDirectoryHandle> {
    for await (const [, h] of this.entries()) yield h;
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }

  async resolve(): Promise<string[] | null> {
    return null;
  }
}

export interface MockTreeSpec {
  name?: string;
  files?: Record<string, string | { content: string; type?: string }>;
  folders?: Record<string, MockTreeSpec>;
}

function buildNode(name: string, spec: MockTreeSpec): Extract<MockNode, { kind: 'directory' }> {
  const children = new Map<string, MockNode>();
  for (const [fname, val] of Object.entries(spec.files ?? {})) {
    if (typeof val === 'string') {
      children.set(fname, {
        kind: 'file',
        name: fname,
        content: encodeText(val),
        type: 'text/plain',
        lastModified: Date.now(),
      });
    } else {
      children.set(fname, {
        kind: 'file',
        name: fname,
        content: encodeText(val.content),
        type: val.type ?? 'text/plain',
        lastModified: Date.now(),
      });
    }
  }
  for (const [dname, childSpec] of Object.entries(spec.folders ?? {})) {
    children.set(dname, buildNode(dname, childSpec));
  }
  return { kind: 'directory', name, children };
}

/** Create a mock directory handle from a nested spec. */
export function createMockDirectory(spec: MockTreeSpec = {}): MockDirectoryHandle {
  const name = spec.name ?? 'MockFolder';
  return new MockDirectoryHandle(buildNode(name, spec));
}

/** Tiny 1x1 PNG as binary-ish text for image tests (valid enough for blob type). */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function tinyPngBytes(): Uint8Array {
  const bin = atob(TINY_PNG_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createDemoLocalTree(): MockDirectoryHandle {
  const root = createMockDirectory({
    name: 'DemoPhotos',
    files: {
      'readme.txt': 'Hello from a mounted local folder.\n',
      'note.md': '# Local note\n\nMounted via File System Access API.\n',
    },
    folders: {
      images: {
        files: {
          'dot.png': { content: '', type: 'image/png' },
          'banner.svg': {
            content:
              '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#3b82f6"/><text x="20" y="45" fill="white" font-size="16">WebOS</text></svg>',
            type: 'image/svg+xml',
          },
        },
      },
      videos: {
        files: {
          // Empty webm placeholder — UI still loads; browser may error on play
          'sample.webm': { content: '', type: 'video/webm' },
        },
      },
    },
  });

  // Patch PNG with real bytes
  void (async () => {
    try {
      const images = await root.getDirectoryHandle('images');
      const png = await images.getFileHandle('dot.png');
      const w = await png.createWritable();
      const bytes = tinyPngBytes();
      await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      await w.close();
    } catch {
      /* ignore */
    }
  })();

  return root;
}
