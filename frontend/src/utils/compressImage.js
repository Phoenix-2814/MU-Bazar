const MAX_DIMENSION = 1600;
const COMPRESS_ABOVE_BYTES = 500 * 1024;

export default async function compressImage(file) {
  if (!file || !file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  if (typeof createImageBitmap !== 'function') return file;

  const bitmap = await createImageBitmap(file);
  try {
    const needsResize = bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION;
    if (!needsResize && file.size <= COMPRESS_ABOVE_BYTES) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Could not compress selected image.'))),
        'image/webp',
        0.82
      );
    });
    if (blob.size >= file.size) return file;

    const compressedName = `${file.name.replace(/\.[^.]+$/, '')}.webp`;
    return new File([blob], compressedName, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
