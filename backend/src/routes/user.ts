import express, { Request, Response, Router } from 'express';
import User from '../models/User';
import authMiddleware from '../middleware/auth';
import { deleteImages, imageUpload, uploadImage } from '../config/imageStorage';

const router: Router = express.Router();

interface AuthRequest extends Request {
  user?: {
    id?: string;
    _id?: string;
  };
  file?: Express.Multer.File;
}

// PUT /api/user/profile
router.put(
  '/profile',
  authMiddleware,
  imageUpload.single('profilePic'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, phone, residencyType, hostelName, hostelBlock, roomNumber } = req.body || {};

      const updateFields: Record<string, string> = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
          res.status(400).json({ message: 'Name must be between 2 and 100 characters.' });
          return;
        }
        updateFields.name = name.trim();
      }
      if (phone !== undefined) {
        if (typeof phone !== 'string' || phone.trim().length > 30) {
          res.status(400).json({ message: 'Phone number must be 30 characters or fewer.' });
          return;
        }
        updateFields.phone = phone.trim();
      }
      if (residencyType !== undefined) {
        if (typeof residencyType !== 'string' || !['hosteler', 'outsider'].includes(residencyType)) {
          res.status(400).json({ message: 'Choose whether you are a hosteler or outsider.' });
          return;
        }

        if (
          residencyType === 'hosteler' &&
          (
            typeof hostelName !== 'string' ||
            !hostelName.trim() ||
            typeof hostelBlock !== 'string' ||
            !hostelBlock.trim() ||
            typeof roomNumber !== 'string' ||
            !roomNumber.trim()
          )
        ) {
          res.status(400).json({ message: 'Hostel name, block, and room number are required for hostelers.' });
          return;
        }

        updateFields.residencyType = residencyType;
        updateFields.hostelName = residencyType === 'hosteler' ? hostelName.trim() : '';
        updateFields.hostelBlock = residencyType === 'hosteler' ? hostelBlock.trim() : '';
        updateFields.roomNumber = residencyType === 'hosteler' ? roomNumber.trim() : '';
      } else {
        if (hostelName !== undefined) {
          if (typeof hostelName !== 'string') {
            res.status(400).json({ message: 'Hostel name must be text.' });
            return;
          }
          updateFields.hostelName = hostelName.trim();
        }
        if (hostelBlock !== undefined) {
          if (typeof hostelBlock !== 'string') {
            res.status(400).json({ message: 'Hostel block must be text.' });
            return;
          }
          updateFields.hostelBlock = hostelBlock.trim();
        }
        if (roomNumber !== undefined) {
          if (typeof roomNumber !== 'string') {
            res.status(400).json({ message: 'Room number must be text.' });
            return;
          }
          updateFields.roomNumber = roomNumber.trim();
        }
      }

      const userId = req.user?.id || req.user?._id;
      let previousProfilePic: string | undefined;

      if (req.file) {
        previousProfilePic = (await User.findById(userId).select('profilePic'))?.profilePic;
        updateFields.profilePic = await uploadImage(req.file, '/mubazar/profiles');
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { returnDocument: 'after' }
      ).select('-password');

      if (!updatedUser) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.json({ message: 'Profile updated successfully', user: updatedUser });

      if (previousProfilePic && previousProfilePic !== updatedUser.profilePic) {
        void deleteImages([previousProfilePic]);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ message: 'Server error while updating profile' });
    }
  }
);

export default router;