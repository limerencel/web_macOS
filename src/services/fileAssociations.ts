/**
 * Central file-type association registry.
 *
 * Maps extensions / MIME types → app ids. Finder, Desktop, Terminal, Spotlight,
 * and Quick Look all resolve opens through this registry — never ad-hoc regex
 * scattered across apps.
 */

import { isImageName, isTextName, isVideoName } from '../types/fs';

export interface FileAssociation {
  id: string;
  name: string;
  /** Lowercase extensions including the dot, e.g. '.png' */
  extensions: string[];
  /** MIME type prefixes or exact types, e.g. 'image/', 'video/mp4' */
  mimeTypes: string[];
  appId: string;
  /** Eligible for Quick Look overlay */
  quickLook: boolean;
  /** Higher wins when multiple match */
  priority: number;
}

const associations: FileAssociation[] = [];

export function registerAssociation(def: FileAssociation): void {
  const existing = associations.findIndex((a) => a.id === def.id);
  if (existing >= 0) associations[existing] = def;
  else associations.push(def);
}

export function clearAssociations(): void {
  associations.length = 0;
}

export function getAssociations(): readonly FileAssociation[] {
  return associations;
}

export function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0) return '';
  return name.slice(i).toLowerCase();
}

/**
 * Resolve the best association for a file name + optional mime.
 * Returns undefined when no handler is registered.
 */
export function resolveAssociation(
  name: string,
  mime?: string
): FileAssociation | undefined {
  const ext = getExtension(name);
  const mimeLower = mime?.toLowerCase() ?? '';

  const scored: { assoc: FileAssociation; score: number }[] = [];

  for (const assoc of associations) {
    let score = 0;
    if (ext && assoc.extensions.includes(ext)) score += 10 + assoc.priority;
    if (mimeLower) {
      for (const m of assoc.mimeTypes) {
        const ml = m.toLowerCase();
        if (ml.endsWith('/') && mimeLower.startsWith(ml)) {
          score += 8 + assoc.priority;
        } else if (mimeLower === ml) {
          score += 12 + assoc.priority;
        }
      }
    }
    if (score > 0) scored.push({ assoc, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.assoc;
}

/** App to open for a file, with sensible built-in fallbacks if registry empty mid-boot. */
export function resolveOpenAppId(name: string, mime?: string, kind?: 'file' | 'folder'): string {
  if (kind === 'folder') return 'finder';
  const assoc = resolveAssociation(name, mime);
  if (assoc) return assoc.appId;
  if (isImageName(name, mime)) return 'preview';
  if (isVideoName(name, mime)) return 'video-player';
  if (isTextName(name, mime)) return 'text-editor';
  return 'text-editor';
}

export function canQuickLook(name: string, mime?: string): boolean {
  const assoc = resolveAssociation(name, mime);
  if (assoc) return assoc.quickLook;
  return isImageName(name, mime) || isVideoName(name, mime) || isTextName(name, mime);
}

/** Register the default WebOS associations. Idempotent by id. */
export function registerDefaultAssociations(): void {
  registerAssociation({
    id: 'images',
    name: 'Images',
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'],
    mimeTypes: ['image/'],
    appId: 'preview',
    quickLook: true,
    priority: 10,
  });

  registerAssociation({
    id: 'video',
    name: 'Video',
    extensions: ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'],
    mimeTypes: ['video/'],
    appId: 'video-player',
    quickLook: true,
    priority: 10,
  });

  registerAssociation({
    id: 'text',
    name: 'Text',
    extensions: [
      '.txt',
      '.md',
      '.json',
      '.js',
      '.ts',
      '.tsx',
      '.jsx',
      '.css',
      '.html',
      '.htm',
      '.xml',
      '.csv',
      '.log',
      '.yml',
      '.yaml',
      '.toml',
      '.ini',
      '.cfg',
      '.sh',
      '.py',
      '.rs',
      '.go',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.rb',
      '.php',
      '.sql',
    ],
    mimeTypes: ['text/', 'application/json', 'application/javascript'],
    appId: 'text-editor',
    quickLook: true,
    priority: 5,
  });
}
