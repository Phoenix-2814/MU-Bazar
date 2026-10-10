import express, { Request, Response, Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import JWT_SECRET from '../config/jwt';
import { sendVerificationEmail } from '../config/mailer';
import { imageUpload, uploadImage } from '../config/imageStorage';

const router: Router = express.Router();
const googleClient = new OAuth2Client();

interface RegisterRequest extends Request {
  file?: Express.Multer.File;
}

const UNIVERSITY_EMAIL_DOMAIN = '@marwadiuniversity.ac.in';
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

const hashVerificationToken = (token: string): string =>
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
  user.emailVerificationTokenHash = hashVerificationToken(token);
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
  return userObject;
};

router.post('/google', async (req: Request, res: Response): Promise<void> => {
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

    const token = jwt.sign({ id: user._id.toString(), emailVerified: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      res.status(409).json({ message: 'An account already exists for this Google email. Please sign in.' });
      return;
    }
    console.error('Google authentication failed:', err);
    res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
});

// POST /api/auth/register (Handles Multipart Form Data)
router.post(
  '/register',
  imageUpload.single('profilePic'),
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
          res.status(200).json({ message: 'A new verification link has been sent to your MU email.' });
        } catch (err) {
          if (err instanceof Error && err.message.includes('wait one minute')) {
            res.status(429).json({ message: err.message });
            return;
          }
          console.error('Verification email resend failed:', err);
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
        console.error('Verification email send failed:', err);
        res.status(503).json({
          message: 'Account created, but the verification email could not be sent. Please try again later.',
        });
        return;
      }

      res.status(201).json({
        message: 'Account created. Check your MU email for a verification link before logging in.',
      });
    } catch (err: any) {
      console.error('Registration Error:', err);
      res.status(500).json({ message: err.message || 'Server error during registration.' });
    }
  }
);

router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400).json({ message: 'Invalid or expired verification link.' });
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      {
        emailVerificationTokenHash: hashVerificationToken(token),
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
      { new: true }
    );

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired verification link.' });
      return;
    }

    const authToken = jwt.sign({ id: user._id, emailVerified: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: authToken, user: toSafeUser(user) });
  } catch (err) {
    console.error('Email verification failed:', err);
    res.status(500).json({ message: 'Could not verify your email. Please try again.' });
  }
});

router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
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
        console.error('Verification email resend failed:', err);
        res.status(503).json({ message: 'Could not send verification email. Please try again later.' });
        return;
      }
    }

    res.json({ message: 'If an unverified account exists for that email, a verification link has been sent.' });
  } catch (err) {
    console.error('Verification email request failed:', err);
    res.status(500).json({ message: 'Could not process verification request.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
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

    const token = jwt.sign({ id: user._id, emailVerified: true }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: toSafeUser(user) });
  } catch (err: any) {
    console.error('Login Error:', err);
    res.status(500).json({ message: err.message || 'Server error during login.' });
  }
});

export default router;