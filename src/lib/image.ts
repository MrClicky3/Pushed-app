// Client-side resize before uploading a profile photo — keeps storage small
// and avatars are only ever rendered at a few dozen px, so there's no need
// to ship a full-resolution photo.
export async function resizeImage(
  file: File,
  maxDim = 512,
  quality = 0.85,
): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Keep transparency for png/gif sources, re-encode everything else as jpeg.
  const preserveAlpha = file.type === 'image/png' || file.type === 'image/gif';
  const mime = preserveAlpha ? 'image/png' : 'image/jpeg';
  const ext = preserveAlpha ? 'png' : 'jpg';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to encode image'))), mime, quality);
  });

  return { blob, ext };
}
