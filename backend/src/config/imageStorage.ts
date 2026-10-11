import { randomBytes } from 'crypto';
import ImageKit, { toFile } from '@imagekit/nodejs';
import multer from 'multer';
import path from 'path';

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Use JPEG, PNG, WebP, or GIF images.'));
    }
  },
});

export const uploadImage = async (file: Express.Multer.File, folder: string): Promise<string> => {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Image storage is not configured. Set IMAGEKIT_PRIVATE_KEY on the backend.');
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
  const uploaded = await imagekit.files.upload({
    file: await toFile(file.buffer, fileName),
    fileName,
    folder,
    useUniqueFileName: true,
  });

  if (!uploaded.url) {
    throw new Error('Image storage did not return a file URL.');
  }

  return uploaded.url;
};

const findImageKitFileId = async (url: string): Promise<string | null> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  if (!fileName || fileName.includes('"')) {
    return null;
  }

  const urlWithoutQuery = `${parsed.origin}${parsed.pathname}`;
  const files = await imagekit.assets.list({ searchQuery: `name = "${fileName}"`, limit: 10 });
  const match = files.find((file) => 'url' in file && file.url === urlWithoutQuery);
  return match && 'fileId' in match && match.fileId ? match.fileId : null;
};

export const deleteImages = async (urls: string[]): Promise<void> => {
  if (!process.env.IMAGEKIT_PRIVATE_KEY || urls.length === 0) {
    return;
  }

  try {
    const fileIds = (await Promise.all(urls.map(findImageKitFileId))).filter(
      (fileId): fileId is string => Boolean(fileId)
    );
    if (fileIds.length > 0) {
      await imagekit.files.bulk.delete({ fileIds });
    }
  } catch (err) {
    console.error('Failed to delete images from ImageKit:', err);
  }
};
