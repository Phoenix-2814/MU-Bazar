const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default function validateImageFiles(files, maxFiles = 5) {
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length > maxFiles) {
    return `Choose no more than ${maxFiles} image${maxFiles === 1 ? '' : 's'}.`;
  }

  const invalidType = selectedFiles.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
  if (invalidType) {
    return 'Use JPEG, PNG, WebP, or GIF images.';
  }

  if (selectedFiles.some((file) => file.size > MAX_IMAGE_SIZE)) {
    return 'Each image must be 5 MB or smaller.';
  }

  return '';
}
