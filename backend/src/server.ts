import 'dotenv/config';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app';
import { Message, Conversation } from './models/Chat';
import JWT_SECRET from './config/jwt';
import { clientOrigins, validateDeploymentConfig } from './config/urls';

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mubazar';

validateDeploymentConfig();
if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
  throw new Error('MONGO_URI must be configured in production.');
}

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io instance
const io = new Server(server, {
  cors: {
    origin: clientOrigins,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') {
    next(new Error('Authentication required.'));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'string' || typeof decoded.id !== 'string' || decoded.emailVerified !== true) {
      next(new Error('Invalid authentication token.'));
      return;
    }

    socket.data.userId = decoded.id;
    next();
  } catch {
    next(new Error('Invalid or expired authentication token.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);

  socket.on('join_room', async (conversationId: string, acknowledge?: (result: { error?: string }) => void) => {
    try {
      if (!mongoose.isValidObjectId(conversationId)) {
        acknowledge?.({ error: 'Invalid conversation ID.' });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        members: socket.data.userId,
      }).select('_id');
      if (!conversation) {
        acknowledge?.({ error: 'Conversation not found.' });
        return;
      }

      socket.join(conversationId);
      acknowledge?.({});
    } catch (err) {
      console.error('Socket room join error:', err);
      acknowledge?.({ error: 'Failed to join conversation.' });
    }
  });

  socket.on('leave_room', (conversationId: string) => {
    socket.leave(conversationId);
  });

  socket.on(
    'send_message',
    async (
      data: { conversationId?: string; text?: string },
      acknowledge?: (result: { error?: string }) => void
    ) => {
      const conversationId = data?.conversationId;
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
        acknowledge?.({ error: 'Invalid conversation ID.' });
        return;
      }
      if (!text || text.length > 2000) {
        acknowledge?.({ error: 'Messages must be between 1 and 2000 characters.' });
        return;
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          members: socket.data.userId,
        }).select('_id members');
        if (!conversation) {
          acknowledge?.({ error: 'Conversation not found.' });
          return;
        }

        const newMessage = await Message.create({
          conversationId,
          sender: socket.data.userId,
          text,
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: text,
          updatedAt: new Date(),
        });

        const populatedMessage = await newMessage.populate('sender', 'name profilePic');
        io.to(conversationId).emit('receive_message', populatedMessage);
        conversation.members.forEach((memberId) => {
          io.to(`user:${memberId.toString()}`).emit('user_message', {
            conversationId,
            messageId: newMessage._id.toString(),
          });
        });
        acknowledge?.({});
      } catch (err) {
        console.error('Socket message handling error:', err);
        acknowledge?.({ error: 'Failed to send message.' });
      }
    }
  );
});

// Connect to MongoDB and start listening
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected successfully.');
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
  });