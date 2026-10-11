import { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const rateLimitedResponse = (message: string) => ({ code: 'RATE_LIMITED', message });

const clientIpKey = (req: Request): string => ipKeyGenerator(req.ip || 'unknown');

export const loginRateLimit = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
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
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: rateLimitedResponse('Too many requests. Please wait a few minutes and try again.'),
});
