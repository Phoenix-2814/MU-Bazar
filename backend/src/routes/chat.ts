import express, { Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Conversation, Message } from '../models/Chat';
import Listing from '../models/Listing';
import { logError } from '../config/logger';

const router = express.Router();
const MAX_MESSAGE_PAGE_SIZE = 100;

router.post('/conversation', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const buyerId = req.user?.id;
  const { itemId } = req.body;

  if (!buyerId || !mongoose.isValidObjectId(itemId)) {
    res.status(400).json({ message: 'A valid itemId is required.' });
    return;
  }

  try {
    const listing = await Listing.findById(itemId).select('seller title price images isSold isHidden');
    if (!listing) {
      res.status(404).json({ message: 'Listing not found.' });
      return;
    }
    if (listing.isHidden) {
      res.status(410).json({ message: 'This listing is temporarily unavailable for new conversations.' });
      return;
    }
    if (listing.isSold) {
      res.status(410).json({ message: 'This listing has been sold and is no longer available for new conversations.' });
      return;
    }

    const sellerId = listing.seller.toString();
    if (sellerId === buyerId) {
      res.status(400).json({ message: 'You cannot start a conversation with yourself.' });
      return;
    }

    let conversation = await Conversation.findOne({
      members: { $all: [buyerId, sellerId], $size: 2 },
      itemId: listing._id,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        members: [buyerId, sellerId],
        itemId: listing._id,
      });
    }

    await conversation.populate([
      { path: 'members', select: 'name profilePic' },
      { path: 'itemId', select: 'title price images' },
    ]);
    res.status(200).json(conversation);
  } catch (err) {
    logError('conversation_create_failed', err);
    res.status(500).json({ message: 'Failed to create conversation.' });
  }
});

router.get('/conversations', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  try {
    const conversations = await Conversation.find({ members: userId })
      .populate('members', 'name profilePic')
      .populate('itemId', 'title price images')
      .sort({ updatedAt: -1 })
      .limit(100);

    res.json(conversations);
  } catch (err) {
    logError('conversation_list_failed', err);
    res.status(500).json({ message: 'Failed to fetch conversations.' });
  }
});

router.get('/unread-count', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  try {
    const conversationIds = await Conversation.find({ members: userId }).distinct('_id');
    const unreadCount = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      sender: { $ne: userId },
      readBy: { $ne: userId },
    });
    res.json({ unreadCount });
  } catch (err) {
    logError('unread_count_failed', err);
    res.status(500).json({ message: 'Failed to fetch unread message count.' });
  }
});

router.patch('/conversations/:conversationId/read', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { conversationId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.isValidObjectId(conversationId)) {
    res.status(400).json({ message: 'Invalid conversation ID.' });
    return;
  }

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: userId,
    }).select('_id');
    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' });
      return;
    }

    await Message.updateMany(
      {
        conversationId,
        sender: { $ne: userId },
        readBy: { $ne: userId },
      },
      { $addToSet: { readBy: userId } }
    );
    const io = req.app.get('io');
    io.to(conversationId).emit('messages_read', { conversationId, readerId: userId });

    const conversationIds = await Conversation.find({ members: userId }).distinct('_id');
    const unreadCount = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      sender: { $ne: userId },
      readBy: { $ne: userId },
    });
    res.json({ unreadCount });
  } catch (err) {
    logError('mark_messages_read_failed', err);
    res.status(500).json({ message: 'Failed to mark messages as read.' });
  }
});

router.get('/messages/:conversationId', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { conversationId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.isValidObjectId(conversationId)) {
    res.status(400).json({ message: 'Invalid conversation ID.' });
    return;
  }

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      members: userId,
    });
    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' });
      return;
    }

    const requestedLimit = Number(req.query.limit ?? 50);
    const requestedOffset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_MESSAGE_PAGE_SIZE ||
        !Number.isInteger(requestedOffset) || requestedOffset < 0) {
      res.status(400).json({ message: `limit must be 1-${MAX_MESSAGE_PAGE_SIZE} and offset must be 0 or more.` });
      return;
    }
    const messages = await Message.find({ conversationId })
      .populate('sender', 'name profilePic')
      .sort({ createdAt: -1, _id: -1 })
      .skip(requestedOffset)
      .limit(requestedLimit);

    res.json(messages.reverse());
  } catch (err) {
    logError('message_history_failed', err);
    res.status(500).json({ message: 'Failed to fetch messages.' });
  }
});

export default router;
