import express, { Response } from 'express';
import mongoose from 'mongoose';
import ListingReport, { REPORT_REASONS, REPORT_STATUSES } from '../models/ListingReport';
import Listing from '../models/Listing';
import User from '../models/User';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const isAdmin = async (userId: string): Promise<boolean> => {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.length) return false;

  const user = await User.findById(userId).select('email');
  return Boolean(user?.email && adminEmails.includes(user.email.toLowerCase()));
};

router.get('/admin/access', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  try {
    res.json({ isAdmin: await isAdmin(userId) });
  } catch (err) {
    console.error('Failed to check report-admin access:', err);
    res.status(500).json({ message: 'Could not check report-admin access.' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const reporterId = req.user?.id;
  const { listingId, reason, details = '' } = req.body || {};
  if (!reporterId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(listingId)) {
    res.status(400).json({ message: 'A valid listing is required.' });
    return;
  }
  if (!REPORT_REASONS.includes(reason)) {
    res.status(400).json({ message: 'Choose a valid reason for this report.' });
    return;
  }
  if (typeof details !== 'string' || details.trim().length > 1000) {
    res.status(400).json({ message: 'Report details must be 1000 characters or fewer.' });
    return;
  }

  try {
    const listing = await Listing.findById(listingId).select('seller');
    if (!listing) {
      res.status(404).json({ message: 'Listing not found.' });
      return;
    }
    if (listing.seller.toString() === reporterId) {
      res.status(403).json({ message: 'You cannot report your own listing.' });
      return;
    }

    await ListingReport.create({
      listing: listingId,
      reporter: reporterId,
      reason,
      details: details.trim(),
    });
    res.status(201).json({ message: 'Report submitted. Thank you for helping keep MU Bazar safe.' });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      res.status(409).json({ message: 'You have already reported this listing.' });
      return;
    }
    console.error('Failed to submit listing report:', err);
    res.status(500).json({ message: 'Could not submit the report.' });
  }
});

router.get('/admin', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  try {
    if (!(await isAdmin(userId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const reports = await ListingReport.find()
      .populate({
        path: 'listing',
        select: 'title price images seller isHidden',
        populate: {
          path: 'seller',
          select: 'name email phone residencyType hostelName hostelBlock roomNumber',
        },
      })
      .populate('reporter', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(reports);
  } catch (err) {
    console.error('Failed to fetch listing reports:', err);
    res.status(500).json({ message: 'Could not fetch listing reports.' });
  }
});

router.patch(
  '/admin/listings/:listingId/visibility',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const { listingId } = req.params;
    const { isHidden } = req.body || {};

    if (!userId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    if (!mongoose.isValidObjectId(listingId)) {
      res.status(400).json({ message: 'Invalid listing ID.' });
      return;
    }
    if (typeof isHidden !== 'boolean') {
      res.status(400).json({ message: 'isHidden must be true or false.' });
      return;
    }

    try {
      if (!(await isAdmin(userId))) {
        res.status(403).json({ message: 'Admin access required.' });
        return;
      }
      const listing = await Listing.findByIdAndUpdate(
        listingId,
        { $set: { isHidden } },
        { new: true, runValidators: true }
      ).populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber');

      if (!listing) {
        res.status(404).json({ message: 'Listing not found.' });
        return;
      }
      res.json({
        message: isHidden ? 'Listing hidden from the marketplace.' : 'Listing restored to the marketplace.',
        listing,
      });
    } catch (err) {
      console.error('Failed to change listing visibility:', err);
      res.status(500).json({ message: 'Could not update listing visibility.' });
    }
  }
);

router.patch('/admin/:reportId', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { reportId } = req.params;
  const { status, adminNote = '' } = req.body || {};

  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(reportId)) {
    res.status(400).json({ message: 'Invalid report ID.' });
    return;
  }
  if (!REPORT_STATUSES.includes(status) || status === 'open') {
    res.status(400).json({ message: 'Choose resolved or dismissed as the report status.' });
    return;
  }
  if (typeof adminNote !== 'string' || adminNote.trim().length > 1000) {
    res.status(400).json({ message: 'Admin notes must be 1000 characters or fewer.' });
    return;
  }

  try {
    if (!(await isAdmin(userId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const report = await ListingReport.findByIdAndUpdate(
      reportId,
      { $set: { status, adminNote: adminNote.trim(), reviewedBy: userId } },
      { new: true, runValidators: true }
    )
      .populate({
        path: 'listing',
        select: 'title price images seller isHidden',
        populate: {
          path: 'seller',
          select: 'name email phone residencyType hostelName hostelBlock roomNumber',
        },
      })
      .populate('reporter', 'name email')
      .populate('reviewedBy', 'name email');
    if (!report) {
      res.status(404).json({ message: 'Report not found.' });
      return;
    }
    res.json(report);
  } catch (err) {
    console.error('Failed to update listing report:', err);
    res.status(500).json({ message: 'Could not update the report.' });
  }
});

export default router;
