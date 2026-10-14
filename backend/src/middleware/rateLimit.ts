import { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createRateLimitStore } from '../config/redis';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const rateLimitedResponse = (message: string) => ({ code: 'RATE_LIMITED', message });

const clientIpKey = (req: Request): string => ipKeyGenerator(req.ip || 'unknown');

export const loginRateLimit = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  store: createRateLimitStore('login'),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${clientIpKey(req)}:${email}`;
  },
  message: rateLimitedResponse('Too many failed login attempts. Please wait 15 minutes and try again.'),
});

export const authRateLimit = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 100,
  store: createRateLimitStore('auth'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many requests. Please wait a few minutes and try again.'),
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  store: createRateLimitStore('api'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many requests. Please slow down and try again shortly.'),
});

export const listingReadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  store: createRateLimitStore('listing-read'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many listing searches. Please wait and try again.'),
});

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  store: createRateLimitStore('chat'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many chat requests. Please wait and try again.'),
});

export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  store: createRateLimitStore('upload'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many uploads. Please wait before uploading again.'),
});
