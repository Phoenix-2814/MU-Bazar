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
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
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
