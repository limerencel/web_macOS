export async function fileToSquareDataUrl(
  file: File,
  size = 256,
  quality = 0.86,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to read this image'));
      element.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable');
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const x = (image.naturalWidth - crop) / 2;
    const y = (image.naturalHeight - crop) / 2;
    context.drawImage(image, x, y, crop, crop, 0, 0, size, size);
    return canvas.toDataURL('image/webp', quality);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function fileToWallpaperDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to read this image'));
      element.src = source;
    });
    const scale = Math.min(1, 1920 / image.naturalWidth, 1080 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(source);
  }
}
