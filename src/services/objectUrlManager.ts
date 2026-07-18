/**
 * Tracks object URLs created for media preview/playback and revokes them
 * when the owning window closes (or when explicitly released).
 */

type OwnerKey = string; // typically windowId

const byOwner = new Map<OwnerKey, Set<string>>();
const urlToOwner = new Map<string, OwnerKey>();

/** Register an object URL under an owner (window). */
export function trackObjectURL(ownerId: string, url: string): string {
  let set = byOwner.get(ownerId);
  if (!set) {
    set = new Set();
    byOwner.set(ownerId, set);
  }
  set.add(url);
  urlToOwner.set(url, ownerId);
  return url;
}

/** Create + track an object URL from a Blob. */
export function createTrackedObjectURL(ownerId: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  return trackObjectURL(ownerId, url);
}

/** Revoke a single URL if tracked. */
export function revokeObjectURL(url: string): void {
  const owner = urlToOwner.get(url);
  if (owner) {
    byOwner.get(owner)?.delete(url);
    urlToOwner.delete(url);
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/** Revoke every URL owned by a window (call on window close). */
export function revokeOwnerObjectURLs(ownerId: string): void {
  const set = byOwner.get(ownerId);
  if (!set) return;
  for (const url of set) {
    urlToOwner.delete(url);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  byOwner.delete(ownerId);
}

/** Test helper: number of tracked URLs (optionally for one owner). */
export function trackedObjectURLCount(ownerId?: string): number {
  if (ownerId) return byOwner.get(ownerId)?.size ?? 0;
  let n = 0;
  for (const set of byOwner.values()) n += set.size;
  return n;
}

/** Test helper: clear all tracking without revoking (jsdom). */
export function clearObjectURLTracking(): void {
  byOwner.clear();
  urlToOwner.clear();
}
