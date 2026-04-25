/**
 * Downscale and re-encode photos before Storage upload so mobile camera
 * images (often multi-MB) upload faster on slower networks.
 */
export async function compressImageForUpload(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 380 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDim = Math.max(bitmap.width, bitmap.height);
      const scale = maxDim <= maxEdge ? 1 : maxEdge / maxDim;
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;

      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob || blob.size >= file.size * 0.92) return file;

      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
