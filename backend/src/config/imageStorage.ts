import { randomBytes } from 'crypto';
import ImageKit, { toFile } from '@imagekit/nodejs';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { logError } from './logger';

const allowedImageTypes: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/gif': (buffer) => buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  'image/webp': (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
};
const safeImageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

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

export const validateImageContent = async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<void> => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : []),
  ];
  if (files.some((file) => !allowedImageTypes[file.mimetype]?.(file.buffer))) {
    res.status(400).json({ message: 'The uploaded file contents do not match a supported image type.' });
    return;
  }

  try {
    for (const file of files) {
      file.buffer = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
        animated: false,
      })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
      file.mimetype = 'image/webp';
      file.originalname = 'upload.webp';
    }
  } catch {
    res.status(400).json({ message: 'The uploaded file is not a valid, supported image.' });
    return;
  }
  next();
};

export const uploadImage = async (file: Express.Multer.File, folder: string): Promise<string> => {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Image storage is not configured. Set IMAGEKIT_PRIVATE_KEY on the backend.');
  }

  const extension = safeImageExtensions[file.mimetype] || path.extname(file.originalname).toLowerCase();
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
    logError('imagekit_delete_failed', err);
  }
};
