import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import JWT_SECRET from '../config/jwt';
import User from '../models/User';

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
    if (typeof decoded === 'string' || decoded.emailVerified !== true || typeof decoded.id !== 'string') {
      res.status(403).json({ message: 'Verify your email and log in again.' });
      return;
    }
    const user = await User.findById(decoded.id).select('isSuspended');
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
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ message: 'Invalid or expired token.' });
      return;
    }
    console.error('Failed to authenticate user:', err);
    res.status(500).json({ message: 'Could not authenticate this request.' });
  }
};

export default authenticateToken;