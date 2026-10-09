import express, { Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Conversation, Message } from '../models/Chat';
import Listing from '../models/Listing';

const router = express.Router();

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
    console.error('Error creating conversation:', err);
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
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
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
    console.error('Error fetching unread message count:', err);
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
    console.error('Error marking messages as read:', err);
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

    const messages = await Message.find({ conversationId })
      .populate('sender', 'name profilePic')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ message: 'Failed to fetch messages.' });
  }
});

export default router;
