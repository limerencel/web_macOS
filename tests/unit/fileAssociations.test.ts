import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAssociation,
  clearAssociations,
  resolveAssociation,
  resolveOpenAppId,
  canQuickLook,
  registerDefaultAssociations,
  getExtension,
} from '../../src/services/fileAssociations';
import {
  sortEntries,
  makeEntryId,
  parseEntryId,
  guessMime,
  isImageName,
  isVideoName,
  isTextName,
  type FSEntry,
} from '../../src/types/fs';
import {
  trackObjectURL,
  createTrackedObjectURL,
  revokeObjectURL,
  revokeOwnerObjectURLs,
  trackedObjectURLCount,
  clearObjectURLTracking,
} from '../../src/services/objectUrlManager';

describe('fileAssociations', () => {
  beforeEach(() => {
    clearAssociations();
    registerDefaultAssociations();
  });

  it('getExtension returns lowercase extension with dot', () => {
    expect(getExtension('Photo.PNG')).toBe('.png');
    expect(getExtension('noext')).toBe('');
  });

  it('resolves image association to preview', () => {
    const a = resolveAssociation('shot.jpg', 'image/jpeg');
    expect(a?.appId).toBe('preview');
    expect(a?.quickLook).toBe(true);
  });

  it('resolves video association to video-player', () => {
    expect(resolveOpenAppId('clip.webm', 'video/webm')).toBe('video-player');
  });

  it('resolves text association to text-editor', () => {
    expect(resolveOpenAppId('notes.md')).toBe('text-editor');
  });

  it('folders always open in finder', () => {
    expect(resolveOpenAppId('Docs', undefined, 'folder')).toBe('finder');
  });

  it('canQuickLook is true for images and text', () => {
    expect(canQuickLook('a.png')).toBe(true);
    expect(canQuickLook('a.txt')).toBe(true);
    expect(canQuickLook('a.unknownext123')).toBe(false);
  });

  it('priority prefers exact mime matches', () => {
    registerAssociation({
      id: 'custom-png',
      name: 'Custom PNG',
      extensions: ['.png'],
      mimeTypes: ['image/png'],
      appId: 'custom-app',
      quickLook: false,
      priority: 100,
    });
    expect(resolveAssociation('x.png', 'image/png')?.appId).toBe('custom-app');
  });
});

describe('fs helpers', () => {
  it('makeEntryId and parseEntryId round-trip', () => {
    const id = makeEntryId('local', 'm1:/a/b.txt');
    expect(id).toBe('local:m1:/a/b.txt');
    expect(parseEntryId(id)).toEqual({ providerId: 'local', localId: 'm1:/a/b.txt' });
  });

  it('guessMime covers common types', () => {
    expect(guessMime('a.png')).toBe('image/png');
    expect(guessMime('a.mp4')).toBe('video/mp4');
    expect(guessMime('a.txt')).toBe('text/plain');
  });

  it('kind detectors', () => {
    expect(isImageName('x.SVG')).toBe(true);
    expect(isVideoName('x.webm')).toBe(true);
    expect(isTextName('x.json')).toBe(true);
  });

  it('sortEntries keeps folders first and sorts by name', () => {
    const entries: FSEntry[] = [
      {
        id: '1',
        name: 'b.txt',
        kind: 'file',
        parentId: null,
        providerId: 'vfs',
        path: '/b.txt',
        writable: true,
      },
      {
        id: '2',
        name: 'A',
        kind: 'folder',
        parentId: null,
        providerId: 'vfs',
        path: '/A',
        writable: true,
      },
      {
        id: '3',
        name: 'a.txt',
        kind: 'file',
        parentId: null,
        providerId: 'vfs',
        path: '/a.txt',
        writable: true,
        size: 10,
      },
    ];
    const sorted = sortEntries(entries, 'name', 'asc');
    expect(sorted.map((e) => e.name)).toEqual(['A', 'a.txt', 'b.txt']);
  });
});

describe('objectUrlManager', () => {
  beforeEach(() => {
    clearObjectURLTracking();
  });

  it('tracks and revokes per owner', () => {
    // jsdom may not fully implement createObjectURL — stub if needed
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const revoked: string[] = [];
    URL.createObjectURL = () => 'blob:test-1';
    URL.revokeObjectURL = (u: string) => {
      revoked.push(u);
    };

    try {
      const url = createTrackedObjectURL('win1', new Blob(['x']));
      expect(url).toBe('blob:test-1');
      expect(trackedObjectURLCount('win1')).toBe(1);
      trackObjectURL('win1', 'blob:extra');
      expect(trackedObjectURLCount('win1')).toBe(2);
      revokeOwnerObjectURLs('win1');
      expect(trackedObjectURLCount('win1')).toBe(0);
      expect(revoked).toContain('blob:test-1');
      expect(revoked).toContain('blob:extra');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('revokeObjectURL removes single url', () => {
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = () => undefined;
    try {
      trackObjectURL('w', 'blob:a');
      trackObjectURL('w', 'blob:b');
      revokeObjectURL('blob:a');
      expect(trackedObjectURLCount('w')).toBe(1);
      revokeOwnerObjectURLs('w');
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });
});
