import validateImageFiles from './validateImageFiles';

test('accepts supported image types within the per-file size and count limits', () => {
  const image = new File(['image data'], 'book.webp', { type: 'image/webp' });

  expect(validateImageFiles([image], 5)).toBe('');
});

test('rejects unsupported image types', () => {
  const image = new File(['svg data'], 'image.svg', { type: 'image/svg+xml' });

  expect(validateImageFiles([image], 1)).toBe('Use JPEG, PNG, WebP, or GIF images.');
});

test('rejects oversized images and selections over the allowed count', () => {
  const oversizedImage = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
    type: 'image/png',
  });
  const images = Array.from({ length: 6 }, (_, index) => (
    new File(['image data'], `image-${index}.png`, { type: 'image/png' })
  ));

  expect(validateImageFiles([oversizedImage], 1)).toBe('Each image must be 5 MB or smaller.');
  expect(validateImageFiles(images, 5)).toBe('Choose no more than 5 images.');
});
