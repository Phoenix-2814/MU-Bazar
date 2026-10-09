import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { clientOrigins } from './config/urls';

import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import itemRoutes from './routes/item';
import chatRoutes from './routes/chat';
import reportRoutes from './routes/report';

const app: Application = express();

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Global Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve Uploaded Files Publicly
app.use('/uploads', express.static(uploadsDir));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reports', reportRoutes);

// Fallback 404 Handler
app.use((req: Request, res: Response) => {
  console.log(`[404 NOT FOUND]: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.originalUrl} not found on backend server` });
});

export default app;