import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import mongoose from 'mongoose';
import { clientOrigins } from './config/urls';
import { apiRateLimit, chatRateLimit, listingReadRateLimit } from './middleware/rateLimit';
import { logError, logInfo } from './config/logger';

import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import itemRoutes from './routes/item';
import chatRoutes from './routes/chat';
import reportRoutes from './routes/report';

const app: Application = express();

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.NODE_ENV === 'production' ? 1 : 0));
app.set('trust proxy', Number.isInteger(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : false);
app.disable('x-powered-by');

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Global Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
}));
app.use('/api', apiRateLimit);
app.use('/api/items', listingReadRateLimit);
app.use('/api/chat', chatRateLimit);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve Uploaded Files Publicly
app.use('/uploads', express.static(uploadsDir));
app.get('/healthz', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not_ready' });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reports', reportRoutes);

// Fallback 404 Handler
app.use((req: Request, res: Response) => {
  logInfo('route_not_found', { method: req.method });
  res.status(404).json({ message: 'Route not found.' });
});

app.use((err: unknown, req: Request, res: Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 5 MB or smaller.'
      : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Too many images were selected.'
        : 'The uploaded image could not be processed.';
    res.status(400).json({ message });
    return;
  }
  if (err instanceof Error && err.message === 'Use JPEG, PNG, WebP, or GIF images.') {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Request body contains invalid JSON.' });
    return;
  }
  if (err instanceof Error && err.message.startsWith('Origin ') && err.message.endsWith(' is not allowed by CORS.')) {
    res.status(403).json({ message: 'This origin is not allowed.' });
    return;
  }
  logError('request_unhandled', err);
  res.status(500).json({ message: 'An unexpected server error occurred.' });
});

export default app;
