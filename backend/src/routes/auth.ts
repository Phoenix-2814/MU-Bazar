import express, { Request, Response, Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import AuthSession, { SESSION_IDLE_TIMEOUT_MS, SESSION_MAX_LIFETIME_MS, SessionLogoutReason } from '../models/AuthSession';
import JWT_SECRET from '../config/jwt';
import { sendPasswordResetEmail, sendVerificationEmail } from '../config/mailer';
import { imageUpload, uploadImage, validateImageContent } from '../config/imageStorage';
import { authRateLimit, loginRateLimit, uploadRateLimit } from '../middleware/rateLimit';
import { logError } from '../config/logger';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router: Router = express.Router();
const googleClient = new OAuth2Client();

interface RegisterRequest extends Request {
  file?: Express.Multer.File;
}

const UNIVERSITY_EMAIL_DOMAIN = '@marwadiuniversity.ac.in';
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const getAdminEmails = (): string[] => (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createSessionToken = async (user: InstanceType<typeof User>): Promise<string> => {
  const now = new Date();
  const sessionId = randomUUID();
  await AuthSession.create({
    _id: sessionId,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    loginAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MAX_LIFETIME_MS),
  });
  return jwt.sign({
    id: user._id.toString(),
    sid: sessionId,
    emailVerified: true,
    tokenVersion: user.tokenVersion,
  }, JWT_SECRET, { expiresIn: '30d' });
};

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const sendVerification = async (user: InstanceType<typeof User>): Promise<void> => {
  const now = new Date();
  if (
    user.emailVerificationSentAt &&
    now.getTime() - user.emailVerificationSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
  ) {
    throw new Error('A verification email was sent recently. Please wait one minute before requesting another.');
  }

  const token = randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
  user.emailVerificationSentAt = now;
  await user.save();
  await sendVerificationEmail({ email: user.email, token });
};

const toSafeUser = (user: InstanceType<typeof User>) => {
  const userObject = user.toObject();
  delete userObject.password;
  delete userObject.emailVerificationTokenHash;
  delete userObject.emailVerificationExpiresAt;
  delete userObject.emailVerificationSentAt;
  delete userObject.passwordResetTokenHash;
  delete userObject.passwordResetExpiresAt;
  delete userObject.passwordResetSentAt;
  return userObject;
};

router.post('/google', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const { credential, mode, residencyType, hostelName, hostelBlock, roomNumber } = req.body || {};
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    res.status(503).json({ message: 'Google sign-in is not configured.' });
    return;
  }
  if (typeof credential !== 'string' || !['signin', 'signup'].includes(mode)) {
    res.status(400).json({ message: 'A valid Google credential and sign-in mode are required.' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();

    if (
      !email ||
      payload?.email_verified !== true ||
      !/^[^\s@]+@[^\s@]+$/.test(email) ||
      !email.endsWith(UNIVERSITY_EMAIL_DOMAIN)
    ) {
      res.status(403).json({ message: 'Use a Google-verified @marwadiuniversity.ac.in account.' });
      return;
    }

    if (mode === 'signup') {
      if (typeof residencyType !== 'string' || !['hosteler', 'outsider'].includes(residencyType)) {
        res.status(400).json({ message: 'Choose whether you are a hosteler or outsider.' });
        return;
      }
      if (
        residencyType === 'hosteler' &&
        (
          typeof hostelName !== 'string' ||
          !hostelName.trim() ||
          typeof hostelBlock !== 'string' ||
          !hostelBlock.trim() ||
          typeof roomNumber !== 'string' ||
          !roomNumber.trim()
        )
      ) {
        res.status(400).json({ message: 'Hostel name, block, and room number are required for hostelers.' });
        return;
      }
    }

    let user = await User.findOne({ email }).select('+password');
    if (mode === 'signin' && !user) {
      res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', message: 'No account found. Please sign up first.' });
      return;
    }
    if (mode === 'signin' && user?.isSuspended) {
      res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended. Contact marketplace support for assistance.',
      });
      return;
    }
    if (mode === 'signup' && user) {
      res.status(409).json({ code: 'ACCOUNT_EXISTS', message: 'An account already exists. Please sign in.' });
      return;
    }

    if (mode === 'signup') {
      user = await User.create({
        name: payload?.name?.trim() || email.split('@')[0],
        email,
        emailVerified: true,
        residencyType,
        hostelName: residencyType === 'hosteler' ? hostelName.trim() : '',
        hostelBlock: residencyType === 'hosteler' ? hostelBlock.trim() : '',
        roomNumber: residencyType === 'hosteler' ? roomNumber.trim() : '',
        profilePic: payload?.picture || '',
      });
    } else if (user && !user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    if (!user) {
      res.status(500).json({ message: 'Could not complete Google authentication.' });
      return;
    }

    const token = await createSessionToken(user);
    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      res.status(409).json({ message: 'An account already exists for this Google email. Please sign in.' });
      return;
    }
    logError('google_auth_failed', err);
    res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
});

// POST /api/auth/register (Handles Multipart Form Data)
router.post(
  '/register',
  authRateLimit,
  uploadRateLimit,
  imageUpload.single('profilePic'),
  validateImageContent,
  async (req: RegisterRequest, res: Response): Promise<void> => {
    try {
      const {
        name,
        email,
        password,
        phone,
        residencyType = 'hosteler',
        hostelName,
        hostelBlock,
        roomNumber,
      } = req.body;

      if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
        res.status(400).json({ message: 'Name, email, and password are required.' });
        return;
      }
      const cleanName = name.trim();
      const cleanPassword = password;
      if (cleanName.length < 2 || cleanName.length > 100) {
        res.status(400).json({ message: 'Name must be between 2 and 100 characters.' });
        return;
      }
      if (cleanPassword.length < 8 || cleanPassword.length > 128) {
        res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
        return;
      }
      if (phone !== undefined && (typeof phone !== 'string' || phone.trim().length > 30)) {
        res.status(400).json({ message: 'Phone number must be 30 characters or fewer.' });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (
        !/^[^\s@]+@marwadiuniversity\.ac\.in$/.test(normalizedEmail) ||
        !normalizedEmail.endsWith(UNIVERSITY_EMAIL_DOMAIN)
      ) {
        res.status(400).json({
          message: 'Registration is only available with an @marwadiuniversity.ac.in email address.',
        });
        return;
      }
      if (!['hosteler', 'outsider'].includes(residencyType)) {
        res.status(400).json({ message: 'Choose whether you are a hosteler or outsider.' });
        return;
      }
      if (
        residencyType === 'hosteler' &&
        (
          typeof hostelName !== 'string' ||
          !hostelName.trim() ||
          typeof hostelBlock !== 'string' ||
          !hostelBlock.trim() ||
          typeof roomNumber !== 'string' ||
          !roomNumber.trim()
        )
      ) {
        res.status(400).json({ message: 'Hostel name, block, and room number are required for hostelers.' });
        return;
      }

      const existingUser = await User.findOne({ email: normalizedEmail })
        .select('+emailVerificationSentAt');
      if (existingUser) {
        if (existingUser.emailVerified) {
          res.status(400).json({ message: 'User already exists with this email.' });
          return;
        }
        try {
          await sendVerification(existingUser);
          res.status(200).json({ message: 'A new verification link has been sent to your MU email. Check your spam.' });
        } catch (err) {
          if (err instanceof Error && err.message.includes('wait one minute')) {
            res.status(429).json({ message: err.message });
            return;
          }
          logError('verification_email_resend_failed', err);
          res.status(503).json({ message: 'Could not send verification email. Please try again later.' });
        }
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(cleanPassword, salt);

      let profilePicUrl = '';
      if (req.file) {
        profilePicUrl = await uploadImage(req.file, '/mubazar/profiles');
      }

      const newUser = new User({
        name: cleanName,
        email: normalizedEmail,
        password: hashedPassword,
        emailVerified: false,
        phone: typeof phone === 'string' ? phone.trim() : '',
        residencyType,
        hostelName: residencyType === 'hosteler' ? hostelName.trim() : '',
        hostelBlock: residencyType === 'hosteler' ? hostelBlock.trim() : '',
        roomNumber: residencyType === 'hosteler' ? roomNumber.trim() : '',
        profilePic: profilePicUrl,
      });

      await newUser.save();
      try {
        await sendVerification(newUser);
      } catch (err) {
        logError('verification_email_send_failed', err);
        res.status(503).json({
          message: 'Account created, but the verification email could not be sent. Please try again later.',
        });
        return;
      }

      res.status(201).json({
        message: 'Account created. Check your MU email for a verification link before logging in. Check your spam.',
      });
    } catch (err: any) {
      logError('registration_failed', err);
      res.status(500).json({ message: 'Could not complete registration. Please try again later.' });
    }
  }
);

router.post('/verify-email', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400).json({ message: 'Invalid or expired verification link.' });
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      {
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpiresAt: { $gt: new Date() },
        emailVerified: false,
      },
      {
        $set: { emailVerified: true },
        $unset: {
          emailVerificationTokenHash: 1,
          emailVerificationExpiresAt: 1,
        },
      },
      { returnDocument: 'after' }
    );

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired verification link.' });
      return;
    }

    const authToken = await createSessionToken(user);
    res.json({ token: authToken, user: toSafeUser(user) });
  } catch (err) {
    logError('email_verification_failed', err);
    res.status(500).json({ message: 'Could not verify your email. Please try again.' });
  }
});

router.post('/request-password-reset', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@marwadiuniversity\.ac\.in$/.test(email)) {
    res.status(400).json({ message: 'Enter a valid MU email address.' });
    return;
  }

  try {
    const user = await User.findOne({ email }).select('+password +passwordResetSentAt');
    if (user?.emailVerified && user.password) {
      const now = new Date();
      const recentlySent = user.passwordResetSentAt &&
        now.getTime() - user.passwordResetSentAt.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS;
      if (!recentlySent) {
        const resetToken = randomBytes(32).toString('hex');
        user.passwordResetTokenHash = hashToken(resetToken);
        user.passwordResetExpiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
        user.passwordResetSentAt = now;
        await user.save();

        try {
          await sendPasswordResetEmail({ email: user.email, token: resetToken });
        } catch (err) {
          logError('password_reset_email_send_failed', err);
        }
      }
    }

    res.json({ message: 'If an account exists for that MU email, a password reset link has been sent.' });
  } catch (err) {
    logError('password_reset_request_failed', err);
    res.status(500).json({ message: 'Could not process password reset request.' });
  }
});

router.post('/reset-password', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400).json({ message: 'Invalid or expired password reset link.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date();
    const userWithToken = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: now },
      emailVerified: true,
    });
    if (!userWithToken) {
      res.status(400).json({ message: 'Invalid or expired password reset link.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      {
        _id: userWithToken._id,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
      },
      {
        $set: { password: hashedPassword },
        $inc: { tokenVersion: 1 },
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpiresAt: 1,
          passwordResetSentAt: 1,
        },
      }
    );

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired password reset link.' });
      return;
    }

    res.json({ message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    logError('password_reset_failed', err);
    res.status(500).json({ message: 'Could not reset your password. Please try again.' });
  }
});

router.post('/resend-verification', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@marwadiuniversity\.ac\.in$/.test(email)) {
    res.status(400).json({ message: 'Enter a valid MU email address.' });
    return;
  }

  try {
    const user = await User.findOne({ email }).select('+emailVerificationSentAt');
    if (user && !user.emailVerified) {
      try {
        await sendVerification(user);
      } catch (err) {
        if (err instanceof Error && err.message.includes('wait one minute')) {
          res.status(429).json({ message: err.message });
          return;
        }
        logError('verification_email_resend_failed', err);
        res.status(503).json({ message: 'Could not send verification email. Please try again later.' });
        return;
      }
    }

    res.json({ message: 'If an unverified account exists for that email, a verification link has been sent. Check your spam.' });
  } catch (err) {
    logError('verification_email_request_failed', err);
    res.status(500).json({ message: 'Could not process verification request.' });
  }
});

// POST /api/auth/login
router.post('/login', authRateLimit, loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@marwadiuniversity\.ac\.in$/.test(normalizedEmail)) {
      res.status(400).json({ message: 'Invalid credentials.' });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      res.status(400).json({ message: 'Invalid credentials.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      res.status(400).json({ message: 'Invalid credentials.' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your MU email before logging in.',
      });
      return;
    }

    if (user.isSuspended) {
      res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended. Contact marketplace support for assistance.',
      });
      return;
    }

    const token = await createSessionToken(user);

    res.json({ token, user: toSafeUser(user) });
  } catch (err: any) {
    logError('login_failed', err);
    res.status(500).json({ message: 'Could not log in right now. Please try again later.' });
  }
});

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : typeof req.body?.token === 'string'
      ? req.body.token
      : '';
  if (!token) {
    res.status(204).end();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== 'string' && typeof decoded.id === 'string' && typeof decoded.sid === 'string') {
      const requestedReason = req.body?.reason;
      const reason: SessionLogoutReason = ['manual', 'tab_closed', 'idle_timeout'].includes(requestedReason)
        ? requestedReason
        : 'manual';
      const now = new Date();
      await AuthSession.findOneAndUpdate(
        { _id: decoded.sid, userId: decoded.id, loggedOutAt: null },
        { $set: { loggedOutAt: now, logoutReason: reason } }
      );
    }
  } catch {
    // Logout is intentionally idempotent for expired, invalid, or already-closed sessions.
  }

  res.status(204).end();
});

router.post('/activity', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const sessionId = req.user?.sid;
  if (!userId || !sessionId) {
    res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Please log in again.' });
    return;
  }

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS);
    const session = await AuthSession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        loggedOutAt: null,
        expiresAt: { $gt: now },
        lastActivityAt: { $gt: cutoff },
      },
      { $set: { lastActivityAt: now } },
      { new: true }
    ).select('lastActivityAt');
    if (!session) {
      res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Your session expired. Please log in again.' });
      return;
    }
    res.json({ lastActivityAt: session.lastActivityAt });
  } catch (err) {
    logError('session_activity_update_failed', err);
    res.status(500).json({ message: 'Could not update session activity.' });
  }
});

router.get('/admin/sessions', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const adminId = req.user?.id;
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const page = Number(req.query.page ?? 1);
  const pageSize = 50;
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (!Number.isSafeInteger(page) || page < 1 || !['all', 'active', 'closed'].includes(status)) {
    res.status(400).json({ message: 'Choose a valid session page and status filter.' });
    return;
  }

  try {
    const admin = await User.findById(adminId).select('email');
    if (!admin?.email || !getAdminEmails().includes(admin.email.toLowerCase())) {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }

    const now = new Date();
    const idleCutoff = new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS);
    const expiredByMaxAge = await AuthSession.find({ loggedOutAt: null, expiresAt: { $lte: now } })
      .select('_id expiresAt').limit(1000).lean();
    const expiredByIdle = await AuthSession.find({
      loggedOutAt: null,
      lastActivityAt: { $lte: idleCutoff },
      expiresAt: { $gt: now },
    }).select('_id lastActivityAt').limit(1000).lean();
    const expirationUpdates = [
      ...expiredByMaxAge.map((session) => ({
        updateOne: {
          filter: { _id: session._id, loggedOutAt: null },
          update: { $set: { loggedOutAt: session.expiresAt, logoutReason: 'max_lifetime' } },
        },
      })),
      ...expiredByIdle.map((session) => ({
        updateOne: {
          filter: { _id: session._id, loggedOutAt: null },
          update: {
            $set: {
              loggedOutAt: new Date(session.lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_MS),
              logoutReason: 'idle_timeout',
            },
          },
        },
      })),
    ];
    if (expirationUpdates.length) await AuthSession.bulkWrite(expirationUpdates);

    const query: Record<string, unknown> = {};
    if (status === 'active') query.loggedOutAt = null;
    if (status === 'closed') query.loggedOutAt = { $ne: null };
    if (search) {
      const searchExpression = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ userName: searchExpression }, { userEmail: searchExpression }];
    }

    const [sessions, total, activeCount, closedCount] = await Promise.all([
      AuthSession.find(query)
        .sort({ loginAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select('userName userEmail loginAt lastActivityAt loggedOutAt logoutReason')
        .lean(),
      AuthSession.countDocuments(query),
      AuthSession.countDocuments({ loggedOutAt: null }),
      AuthSession.countDocuments({ loggedOutAt: { $ne: null } }),
    ]);
    res.json({
      sessions,
      counts: { all: activeCount + closedCount, active: activeCount, closed: closedCount },
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (err) {
    logError('admin_auth_session_list_failed', err);
    res.status(500).json({ message: 'Could not load login activity.' });
  }
});

export default router;
