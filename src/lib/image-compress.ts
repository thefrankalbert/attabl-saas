/**
 * Client-side image compression utility.
 * Used to compress camera photos before uploading to Supabase Storage.
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  type?: string;
}

/**
 * Compress an image file/blob to a smaller JPEG (or specified type).
 * Uses OffscreenCanvas when available, falls back to HTMLCanvasElement.
 */
export async function compressImage(
  file: File | Blob,
  options: CompressOptions = {},
): Promise<Blob> {
  const { maxWidth = 1024, maxHeight = 1024, quality = 0.8, type = 'image/jpeg' } = options;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Prefer OffscreenCanvas (supported in modern browsers)
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.convertToBlob({ type, quality });
  }

  // Fallback for older browsers
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      type,
      quality,
    );
  });
}
