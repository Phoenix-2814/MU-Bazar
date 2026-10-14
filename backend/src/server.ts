import 'dotenv/config';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app';
import { Message, Conversation } from './models/Chat';
import User from './models/User';
import JWT_SECRET from './config/jwt';
import { clientOrigins, validateDeploymentConfig } from './config/urls';
import { connectSharedRedis, consumeSocketMessageLimit, disconnectSharedRedis, sharedRedisEnabled, socketRedisAdapter } from './config/redis';
import { logError, logInfo } from './config/logger';

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
  maxHttpBufferSize: 64 * 1024,
  perMessageDeflate: false,
  cors: {
    origin: clientOrigins,
  },
});
app.set('io', io);

io.use(async (socket, next) => {
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

    const user = await User.findById(decoded.id).select('isSuspended tokenVersion');
    if (!user || user.isSuspended) {
      next(new Error(user ? 'This account is suspended.' : 'Account not found.'));
      return;
    }
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      next(new Error('Session expired. Please sign in again.'));
      return;
    }

    socket.data.userId = decoded.id;
    next();
  } catch (err) {
    if (!(err instanceof jwt.JsonWebTokenError)) {
      logError('socket_authentication_failed', err);
      next(new Error('Could not authenticate chat connection.'));
      return;
    }
    next(new Error('Invalid or expired authentication token.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);
  const configuredMessageLimit = Number(process.env.CHAT_MESSAGES_PER_MINUTE || 30);
  const maxMessagesPerWindow = Number.isInteger(configuredMessageLimit) && configuredMessageLimit > 0
    ? Math.min(configuredMessageLimit, 1000)
    : 30;
  let roomJoinsThisMinute = 0;
  let roomJoinWindowStartedAt = Date.now();

  socket.on('join_room', async (conversationId: string, acknowledge?: (result: { error?: string }) => void) => {
    const now = Date.now();
    if (now - roomJoinWindowStartedAt >= 60_000) {
      roomJoinWindowStartedAt = now;
      roomJoinsThisMinute = 0;
    }
    if (roomJoinsThisMinute >= 60) {
      acknowledge?.({ error: 'Too many chat room requests. Please wait and try again.' });
      return;
    }
    roomJoinsThisMinute += 1;
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
      logError('socket_room_join_failed', err);
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
      const userId = String(socket.data.userId);
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

      let withinMessageLimit = false;
      try {
        withinMessageLimit = await consumeSocketMessageLimit(userId, maxMessagesPerWindow);
      } catch (err) {
        logError('socket_rate_limit_failed', err);
        acknowledge?.({ error: 'Chat is temporarily unavailable. Please try again shortly.' });
        return;
      }
      if (!withinMessageLimit) {
        acknowledge?.({ error: 'You are sending messages too quickly. Please try again in a minute.' });
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
        logError('socket_message_failed', err);
        acknowledge?.({ error: 'Failed to send message.' });
      }
    }
  );
});

// Connect to MongoDB and start listening
const startServer = async (): Promise<void> => {
  if (sharedRedisEnabled) await connectSharedRedis();
  if (socketRedisAdapter) io.adapter(socketRedisAdapter);
  await mongoose.connect(MONGO_URI);
  server.listen(PORT, '0.0.0.0', () => {
    logInfo('server_listening', { port: Number(PORT), sharedRateLimits: sharedRedisEnabled });
  });
};

void startServer().catch((err: unknown) => {
  logError('server_start_failed', err);
  void Promise.all([mongoose.disconnect(), disconnectSharedRedis()]).finally(() => {
    process.exitCode = 1;
  });
});

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo('shutdown_started', { signal });
  io.close(() => {
    void Promise.all([mongoose.disconnect(), disconnectSharedRedis()]).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
