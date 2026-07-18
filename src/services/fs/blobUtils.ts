/**
 * Read Blob/File contents in environments where Blob.arrayBuffer()/text()
 * are missing (notably older jsdom used by Vitest).
 */

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    try {
      return await blob.text();
    } catch {
      /* fall through */
    }
  }
  try {
    const buf = await readBlobAsArrayBuffer(blob);
    return new TextDecoder().decode(buf);
  } catch {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsText(blob);
    });
  }
}

/** Encode a Blob as a data URL (persists across reload; object URLs do not). */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
