import express, { Request, Response, Router } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'path';
import User from '../models/User';
import authMiddleware from '../middleware/auth';
import { publicApiUrl } from '../config/urls';

const router: Router = express.Router();
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));

interface AuthRequest extends Request {
  user?: {
    id?: string;
    _id?: string;
  };
  file?: Express.Multer.File;
}

// Multer Disk Storage Configuration
const storage: StorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

// PUT /api/user/profile
router.put(
  '/profile',
  authMiddleware,
  upload.single('profilePic'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, phone, residencyType, hostelName, hostelBlock, roomNumber } = req.body;

      const updateFields: Record<string, any> = {};
      if (typeof name === 'string' && name.trim()) updateFields.name = name.trim();
      if (typeof phone === 'string') updateFields.phone = phone.trim();
      if (residencyType !== undefined) {
        if (!['hosteler', 'outsider'].includes(residencyType)) {
          res.status(400).json({ message: 'Choose whether you are a hosteler or outsider.' });
          return;
        }

        if (
          residencyType === 'hosteler' &&
          (!hostelName?.trim() || !hostelBlock?.trim() || !roomNumber?.trim())
        ) {
          res.status(400).json({ message: 'Hostel name, block, and room number are required for hostelers.' });
          return;
        }

        updateFields.residencyType = residencyType;
        updateFields.hostelName = residencyType === 'hosteler' ? hostelName.trim() : '';
        updateFields.hostelBlock = residencyType === 'hosteler' ? hostelBlock.trim() : '';
        updateFields.roomNumber = residencyType === 'hosteler' ? roomNumber.trim() : '';
      } else if (typeof hostelBlock === 'string') {
        updateFields.hostelBlock = hostelBlock.trim();
      }

      if (req.file) {
        updateFields.profilePic = `${publicApiUrl}/uploads/${req.file.filename}`;
      }

      const userId = req.user?.id || req.user?._id;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ message: 'Server error while updating profile' });
    }
  }
);

export default router;