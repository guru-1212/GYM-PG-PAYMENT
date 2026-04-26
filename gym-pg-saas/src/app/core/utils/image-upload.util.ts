/**
 * Downscale and re-encode photos before Storage upload so mobile camera
 * images upload faster. Sequential use in the UI avoids decoding several
 * huge images at once (which can freeze low-RAM phones for minutes).
 */
const COMPRESS_TIMEOUT_MS = 26_000;

export async function compressImageForUpload(
  file: File,
  maxEdge = 1280,
  quality = 0.74,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  // Tiny JPEGs: skip work
  if (file.size < 95 * 1024 && file.type === 'image/jpeg') return file;

  const run = async (): Promise<File> => {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDim = Math.max(bitmap.width, bitmap.height);
      const scale = maxDim <= maxEdge ? 1 : maxEdge / maxDim;

      // Small dimensions and modest JPEG: skip re-encode
      if (scale >= 0.999 && file.size < 260 * 1024 && file.type === 'image/jpeg') {
        return file;
      }

      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return file;

      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob || blob.size >= file.size * 0.94) return file;

      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  };

  try {
    return await Promise.race([
      run(),
      new Promise<File>((_, reject) =>
        setTimeout(() => reject(new Error('COMPRESS_TIMEOUT')), COMPRESS_TIMEOUT_MS),
      ),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message === 'COMPRESS_TIMEOUT') {
      throw e;
    }
    return file;
  }
}
