import './env';
import { randomUUID } from 'crypto';
import { after, before, beforeEach } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import AuthSession, { SESSION_MAX_LIFETIME_MS } from '../src/models/AuthSession';
import Listing from '../src/models/Listing';
import User from '../src/models/User';

export { app };

export const PASSWORD = 'correct-horse-battery';

// Auth emails go through Brevo's HTTP API; capture their tokens instead of sending.
export const sentVerificationTokens: { email: string; token: string }[] = [];
export const sentPasswordResetTokens: { email: string; token: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(input).startsWith('https://api.brevo.com/')) {
    const body = JSON.parse(String(init?.body));
    const verificationToken = /verifyEmail=([a-f0-9]{64})/.exec(body.textContent)?.[1];
    const resetToken = /resetPassword=([a-f0-9]{64})/.exec(body.textContent)?.[1];
    if (verificationToken) sentVerificationTokens.push({ email: body.to[0].email, token: verificationToken });
    if (resetToken) sentPasswordResetTokens.push({ email: body.to[0].email, token: resetToken });
    return new Response('{}', { status: 201 });
  }
  return realFetch(input, init);
}) as typeof fetch;

let mongo: MongoMemoryServer;

export const useTestDatabase = () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    sentVerificationTokens.length = 0;
    sentPasswordResetTokens.length = 0;
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};

let userCount = 0;
export const createUser = async (overrides: Record<string, unknown> = {}) => {
  userCount += 1;
  const user = await User.create({
    name: `Student ${userCount}`,
    email: `student${userCount}@marwadiuniversity.ac.in`,
    password: await bcrypt.hash(PASSWORD, 4),
    emailVerified: true,
    residencyType: 'outsider',
    ...overrides,
  });
  return { user, token: await tokenFor(user) };
};

export const tokenFor = async (user: InstanceType<typeof User>) => {
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
  }, process.env.JWT_SECRET!, { expiresIn: '1h' });
};

export const createListing = (seller: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Listing.create({
    title: 'Engineering Physics textbook',
    description: 'Second edition, a few highlighted pages.',
    price: 300,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    seller,
    ...overrides,
  });
