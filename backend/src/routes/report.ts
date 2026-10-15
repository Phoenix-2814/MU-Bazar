import express, { Response } from 'express';
import mongoose from 'mongoose';
import ListingReport, { REPORT_REASONS, REPORT_STATUSES } from '../models/ListingReport';
import Listing from '../models/Listing';
import User from '../models/User';
import { Conversation, Message } from '../models/Chat';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { deleteImages } from '../config/imageStorage';
import { logError, logInfo } from '../config/logger';

const router = express.Router();

const getAdminEmails = (): string[] => (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const isAdmin = async (userId: string): Promise<boolean> => {
  const adminEmails = getAdminEmails();
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
    logError('admin_access_check_failed', err);
    res.status(500).json({ message: 'Could not check report-admin access.' });
  }
});

router.get('/admin/overview', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const nonAdminUsers = { email: { $nin: getAdminEmails() } };
    const [totalUsers, newUsers, activeListings, hiddenListings, soldListings, openReports, recentReports] = await Promise.all([
      User.countDocuments(nonAdminUsers),
      User.countDocuments({ ...nonAdminUsers, createdAt: { $gte: sevenDaysAgo } }),
      Listing.countDocuments({ isHidden: false, isSold: false }),
      Listing.countDocuments({ isHidden: true, isSold: false }),
      Listing.countDocuments({ isSold: true }),
      ListingReport.countDocuments({ status: 'open' }),
      ListingReport.find().sort({ createdAt: -1 }).limit(5).select('reason status createdAt listing')
        .populate('listing', 'title category'),
    ]);

    res.json({
      metrics: { totalUsers, newUsers, activeListings, hiddenListings, soldListings, openReports },
      recentReports,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logError('admin_overview_failed', err);
    res.status(500).json({ message: 'Could not load the admin overview.' });
  }
});

router.get('/admin/listings', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const page = Number(req.query.page ?? 1);
  const status = req.query.status;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!Number.isSafeInteger(page) || page < 1 || !['hidden', 'sold'].includes(String(status))) {
    res.status(400).json({ message: 'Choose a valid product status and page.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const query: Record<string, unknown> = status === 'hidden'
      ? { isHidden: true, isSold: false }
      : { isSold: true };
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: safeSearch, $options: 'i' };
    }
    const pageSize = 20;
    const [listings, total] = await Promise.all([
      Listing.find(query)
        .populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber isSuspended')
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select('title description price category condition images seller isSold isHidden isHiddenBySuspension createdAt updatedAt'),
      Listing.countDocuments(query),
    ]);
    res.json({
      listings,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (err) {
    logError('admin_listing_archive_failed', err);
    res.status(500).json({ message: 'Could not load products.' });
  }
});

router.get('/admin/listings/:listingId/conversations', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const { listingId } = req.params;
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(listingId) || (userId && !mongoose.isValidObjectId(userId))) {
    res.status(400).json({ message: 'Invalid product or user ID.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const listing = await Listing.findById(listingId).select('_id seller');
    if (!listing || (userId && listing.seller.toString() !== userId)) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    const filter: Record<string, unknown> = { itemId: listingId };
    if (userId) filter.members = userId;
    const conversations = await Conversation.find(filter)
      .populate('members', 'name email')
      .sort({ updatedAt: -1 })
      .select('members itemId createdAt updatedAt')
      .lean();
    const counts = conversations.length
      ? await Message.aggregate([
        { $match: { conversationId: { $in: conversations.map((conversation) => conversation._id) } } },
        { $group: { _id: '$conversationId', count: { $sum: 1 } } },
      ])
      : [];
    const messageCounts = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
    logInfo('admin_chat_history_accessed', {
      adminId,
      listingId: String(listingId),
      targetUserId: userId || 'all_participants',
      conversations: conversations.length,
    });
    res.json({
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messageCount: messageCounts.get(conversation._id.toString()) || 0,
      })),
    });
  } catch (err) {
    logError('admin_listing_conversations_failed', err);
    res.status(500).json({ message: 'Could not load product conversations.' });
  }
});

router.get('/admin/conversations/:conversationId/messages', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const { conversationId } = req.params;
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 100);
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(conversationId) || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ message: 'Choose a valid conversation and message page.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const conversation = await Conversation.findById(conversationId).select('_id');
    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' });
      return;
    }
    const [messages, total] = await Promise.all([
      Message.find({ conversationId })
        .populate('sender', 'name email')
        .sort({ createdAt: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .select('sender text createdAt'),
      Message.countDocuments({ conversationId }),
    ]);
    logInfo('admin_chat_messages_accessed', { adminId, conversationId: String(conversationId), offset, limit });
    res.json({ messages, pagination: { offset, limit, total, hasMore: offset + messages.length < total } });
  } catch (err) {
    logError('admin_conversation_messages_failed', err);
    res.status(500).json({ message: 'Could not load chat messages.' });
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
    logError('listing_report_create_failed', err);
    res.status(500).json({ message: 'Could not submit the report.' });
  }
});

router.get('/admin', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const pageValue = Number(req.query.page ?? 1);
  const pageSize = 50;
  const statusFilter = req.query.status;
  if (!Number.isSafeInteger(pageValue) || pageValue < 1) {
    res.status(400).json({ message: 'Page must be a positive integer.' });
    return;
  }
  if (
    statusFilter !== undefined &&
    (typeof statusFilter !== 'string' ||
      (statusFilter !== 'all' && !REPORT_STATUSES.includes(statusFilter as typeof REPORT_STATUSES[number])))
  ) {
    res.status(400).json({ message: 'Choose a valid report status filter.' });
    return;
  }

  try {
    if (!(await isAdmin(userId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const query: { status?: typeof REPORT_STATUSES[number] } = {};
    if (typeof statusFilter === 'string' && statusFilter !== 'all') {
      query.status = statusFilter as typeof REPORT_STATUSES[number];
    }
    const [reports, total, openCount, resolvedCount, dismissedCount] = await Promise.all([
      ListingReport.find(query)
        .populate({
          path: 'listing',
          select: 'title price images seller isHidden category',
          populate: {
            path: 'seller',
            select: 'name email phone residencyType hostelName hostelBlock roomNumber',
          },
        })
        .populate('reporter', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip((pageValue - 1) * pageSize)
        .limit(pageSize),
      ListingReport.countDocuments(query),
      ListingReport.countDocuments({ status: 'open' }),
      ListingReport.countDocuments({ status: 'resolved' }),
      ListingReport.countDocuments({ status: 'dismissed' }),
    ]);
    res.json({
      reports,
      pagination: {
        page: pageValue,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: {
        all: openCount + resolvedCount + dismissedCount,
        open: openCount,
        resolved: resolvedCount,
        dismissed: dismissedCount,
      },
    });
  } catch (err) {
    logError('admin_report_list_failed', err);
    res.status(500).json({ message: 'Could not fetch listing reports.' });
  }
});

router.get('/admin/users', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const page = Number(req.query.page ?? 1);
  const pageSize = 25;
  const status = req.query.status ?? 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const validStatuses = ['all', 'new', 'high-posted', 'suspended'];

  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    res.status(400).json({ message: 'Page must be a positive integer.' });
    return;
  }
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    res.status(400).json({ message: 'Choose a valid user filter.' });
    return;
  }
  if (search.length > 100) {
    res.status(400).json({ message: 'Search must be 100 characters or fewer.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userMatch: Record<string, unknown> = { email: { $nin: getAdminEmails() } };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userMatch.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const resultMatch: Record<string, unknown> = {};
    if (status === 'new') resultMatch.createdAt = { $gte: thirtyDaysAgo };
    if (status === 'suspended') resultMatch.isSuspended = true;
    const selectedUserMatch = { ...userMatch, ...resultMatch };
    const listPipeline: mongoose.PipelineStage[] = [
      { $match: selectedUserMatch },
      {
        $lookup: {
          from: 'listings',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$seller', '$$userId'] } } },
            { $count: 'count' },
          ],
          as: 'listingStats',
        },
      },
      {
        $addFields: {
          listingCount: { $ifNull: [{ $arrayElemAt: ['$listingStats.count', 0] }, 0] },
        },
      },
      { $sort: status === 'high-posted' ? { listingCount: -1, createdAt: -1 } : { createdAt: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      {
        $project: {
          name: 1,
          email: 1,
          phone: 1,
          residencyType: 1,
          hostelName: 1,
          hostelBlock: 1,
          roomNumber: 1,
          emailVerified: 1,
          isSuspended: 1,
          suspensionReason: 1,
          suspendedAt: 1,
          suspendedBy: 1,
          createdAt: 1,
          listingCount: 1,
        },
      },
    ];
    const [users, total, allCount, newCount, suspendedCount] = await Promise.all([
      User.aggregate(listPipeline),
      User.countDocuments(selectedUserMatch),
      User.countDocuments(userMatch),
      User.countDocuments({ ...userMatch, createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ ...userMatch, isSuspended: true }),
    ]);
    res.json({
      users,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: { all: allCount, new: newCount, suspended: suspendedCount },
    });
  } catch (err) {
    logError('admin_user_list_failed', err);
    res.status(500).json({ message: 'Could not fetch users.' });
  }
});

router.get('/admin/users/:userId', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const { userId } = req.params;
  const page = Number(req.query.page ?? 1);
  const listingStatus = typeof req.query.listingStatus === 'string' ? req.query.listingStatus : 'all';
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400).json({ message: 'Invalid user ID.' });
    return;
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    res.status(400).json({ message: 'Page must be a positive integer.' });
    return;
  }
  if (!['all', 'active', 'sold'].includes(listingStatus)) {
    res.status(400).json({ message: 'Choose a valid product filter.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const adminEmails = getAdminEmails();
    const pageSize = 25;
    const listingMatch: Record<string, unknown> = { seller: userId };
    if (listingStatus === 'active') listingMatch.isSold = false;
    if (listingStatus === 'sold') listingMatch.isSold = true;
    const [user, listings, listingCount, activeListingCount, soldListingCount] = await Promise.all([
      User.findById(userId)
        .select('name email phone residencyType hostelName hostelBlock roomNumber emailVerified isSuspended suspensionReason suspendedAt suspendedBy createdAt updatedAt')
        .populate('suspendedBy', 'name email'),
      Listing.find(listingMatch)
        .select('title description price category condition images isSold isHidden createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Listing.countDocuments(listingMatch),
      Listing.countDocuments({ seller: userId, isSold: false }),
      Listing.countDocuments({ seller: userId, isSold: true }),
    ]);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    if (adminEmails.includes(user.email.toLowerCase())) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({
      user,
      listings,
      listingCounts: { all: activeListingCount + soldListingCount, active: activeListingCount, sold: soldListingCount },
      pagination: {
        page,
        pageSize,
        total: listingCount,
        totalPages: Math.max(1, Math.ceil(listingCount / pageSize)),
      },
    });
  } catch (err) {
    logError('admin_user_detail_failed', err);
    res.status(500).json({ message: 'Could not fetch this user profile.' });
  }
});

router.patch('/admin/users/:userId/status', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  const { userId } = req.params;
  const { isSuspended, reason } = req.body || {};

  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400).json({ message: 'Invalid user ID.' });
    return;
  }
  if (typeof isSuspended !== 'boolean') {
    res.status(400).json({ message: 'isSuspended must be true or false.' });
    return;
  }
  if (isSuspended && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000)) {
    res.status(400).json({ message: 'Provide a suspension reason of 1 to 1000 characters.' });
    return;
  }

  try {
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    if (adminId === userId) {
      res.status(400).json({ message: 'You cannot suspend your own admin account.' });
      return;
    }

    const target = await User.findById(userId).select('email');
    if (!target) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const adminEmails = getAdminEmails();
    if (adminEmails.includes(target.email.toLowerCase())) {
      res.status(403).json({ message: 'Admin accounts cannot be suspended through user management.' });
      return;
    }

    const update = isSuspended
      ? {
        $set: {
          isSuspended: true,
          suspensionReason: reason.trim(),
          suspendedAt: new Date(),
          suspendedBy: adminId,
        },
        $inc: { tokenVersion: 1 },
      }
      : {
        $set: { isSuspended: false, suspensionReason: '' },
        $unset: { suspendedAt: 1, suspendedBy: 1 },
      };
    const updatedUser = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after', runValidators: true })
      .select('name email isSuspended suspensionReason suspendedAt');
    if (!updatedUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    if (isSuspended) {
      await Listing.updateMany(
        { seller: userId, isHidden: { $ne: true } },
        { $set: { isHidden: true, isHiddenBySuspension: true } }
      );
      const io = req.app.get('io');
      io?.in(`user:${userId}`).disconnectSockets(true);
    } else {
      await Listing.updateMany(
        { seller: userId, isHiddenBySuspension: true },
        { $set: { isHidden: false, isHiddenBySuspension: false } }
      );
    }

    res.json({
      message: isSuspended ? 'User suspended.' : 'User reactivated.',
      user: updatedUser,
    });
  } catch (err) {
    logError('admin_user_status_update_failed', err);
    res.status(500).json({ message: 'Could not update user status.' });
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
      const existingListing = await Listing.findById(listingId).select('seller');
      if (!existingListing) {
        res.status(404).json({ message: 'Listing not found.' });
        return;
      }
      if (!isHidden) {
        const seller = await User.findById(existingListing.seller).select('isSuspended');
        if (seller?.isSuspended) {
          res.status(409).json({ message: 'Reactivate the seller before restoring their listings.' });
          return;
        }
      }
      const listing = await Listing.findByIdAndUpdate(
        listingId,
        { $set: { isHidden, isHiddenBySuspension: false } },
        { returnDocument: 'after', runValidators: true }
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
      logError('admin_listing_visibility_update_failed', err);
      res.status(500).json({ message: 'Could not update listing visibility.' });
    }
  }
);

router.delete(
  '/admin/listings/:listingId',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const adminId = req.user?.id;
    const { listingId } = req.params;
    if (!adminId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    if (!mongoose.isValidObjectId(listingId)) {
      res.status(400).json({ message: 'Invalid listing ID.' });
      return;
    }

    try {
      if (!(await isAdmin(adminId))) {
        res.status(403).json({ message: 'Admin access required.' });
        return;
      }
      const listing = await Listing.findByIdAndDelete(listingId).select('_id title seller images');
      if (!listing) {
        res.status(404).json({ message: 'Listing not found.' });
        return;
      }
      await ListingReport.updateMany(
        { listing: listing._id, status: 'open' },
        { $set: { status: 'resolved', adminNote: 'Listing deleted by an admin.', reviewedBy: adminId } }
      );
      res.json({ message: 'Listing deleted.', listingId: listing._id });
      void deleteImages(listing.images);
    } catch (err) {
      logError('admin_listing_delete_failed', err);
      res.status(500).json({ message: 'Could not delete this listing.' });
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
      { returnDocument: 'after', runValidators: true }
    )
      .populate({
        path: 'listing',
        select: 'title price images seller isHidden category',
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
    logError('admin_report_update_failed', err);
    res.status(500).json({ message: 'Could not update the report.' });
  }
});

export default router;
