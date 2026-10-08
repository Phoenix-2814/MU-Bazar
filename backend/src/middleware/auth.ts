import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import JWT_SECRET from '../config/jwt';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
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
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

export default authenticateToken;