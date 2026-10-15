import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import JWT_SECRET from '../config/jwt';
import User from '../models/User';
import AuthSession, { SESSION_IDLE_TIMEOUT_MS } from '../models/AuthSession';
import { logError } from '../config/logger';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>"

  if (!token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (
      typeof decoded === 'string' ||
      decoded.emailVerified !== true ||
      typeof decoded.id !== 'string' ||
      typeof decoded.sid !== 'string'
    ) {
      res.status(403).json({ message: 'Verify your email and log in again.' });
      return;
    }

    const now = new Date();
    const session = await AuthSession.findOne({
      _id: decoded.sid,
      userId: decoded.id,
      loggedOutAt: null,
    }).select('lastActivityAt expiresAt');
    const idleCutoff = new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS);
    if (!session || session.expiresAt <= now || session.lastActivityAt <= idleCutoff) {
      if (session) {
        const maxLifetimeExpired = session.expiresAt <= now;
        const logoutTime = maxLifetimeExpired
          ? session.expiresAt
          : new Date(session.lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_MS);
        await AuthSession.findOneAndUpdate(
          { _id: decoded.sid, loggedOutAt: null },
          {
            $set: {
              loggedOutAt: logoutTime,
              logoutReason: maxLifetimeExpired ? 'max_lifetime' : 'idle_timeout',
            },
          }
        );
      }
      res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Your session expired. Please log in again.' });
      return;
    }

    const user = await User.findById(decoded.id).select('isSuspended tokenVersion');
    if (!user) {
      res.status(401).json({ message: 'Account not found.' });
      return;
    }
    if (user.isSuspended) {
      res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended. Contact marketplace support for assistance.',
      });
      return;
    }
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ message: 'Invalid or expired token.' });
      return;
    }
    logError('auth_middleware_failure', err);
    res.status(500).json({ message: 'Could not authenticate this request.' });
  }
};

export default authenticateToken;
