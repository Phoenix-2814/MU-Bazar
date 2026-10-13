import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import {
  app,
  createUser,
  PASSWORD,
  sentPasswordResetTokens,
  sentVerificationTokens,
  useTestDatabase,
} from './helpers';

useTestDatabase();

describe('registration and email verification', () => {
  test('rejects non-university email addresses', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Outsider', email: 'someone@gmail.com', password: PASSWORD, residencyType: 'outsider' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /marwadiuniversity\.ac\.in/);
  });

  test('requires hostel details for hostelers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Hosteler', email: 'hosteler@marwadiuniversity.ac.in', password: PASSWORD, residencyType: 'hosteler' });
    assert.equal(res.status, 400);
  });

  test('registers, blocks login until verified, then verifies and logs in', async () => {
    const email = 'new.student@marwadiuniversity.ac.in';
    const register = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Student', email: ' New.Student@MarwadiUniversity.ac.in ', password: PASSWORD, residencyType: 'outsider' });
    assert.equal(register.status, 201);
    assert.equal(sentVerificationTokens.length, 1);
    assert.equal(sentVerificationTokens[0].email, email);

    const blockedLogin = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.body.code, 'EMAIL_NOT_VERIFIED');

    const verify = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: sentVerificationTokens[0].token });
    assert.equal(verify.status, 200);
    assert.ok(verify.body.token);
    assert.equal(verify.body.user.password, undefined);

    const reusedToken = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: sentVerificationTokens[0].token });
    assert.equal(reusedToken.status, 400);

    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);
    assert.equal(login.body.user.email, email);
    assert.equal(login.body.user.password, undefined);
  });

  test('rejects duplicate registration for a verified account', async () => {
    const { user } = await createUser();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Again', email: user.email, password: PASSWORD, residencyType: 'outsider' });
    assert.equal(res.status, 400);
    assert.equal(sentVerificationTokens.length, 0);
  });
});

describe('login', () => {
  test('rejects a wrong password without revealing whether the account exists', async () => {
    const { user } = await createUser();
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@marwadiuniversity.ac.in', password: PASSWORD });
    assert.equal(wrongPassword.status, 400);
    assert.equal(unknownUser.status, 400);
    assert.equal(wrongPassword.body.message, unknownUser.body.message);
  });

  test('blocks suspended accounts', async () => {
    const { user } = await createUser({ isSuspended: true });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
  });

  test('rate limits repeated failed logins for the same email', async () => {
    const { user } = await createUser();
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
      assert.equal(res.status, 400, `attempt ${attempt}`);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'RATE_LIMITED');
  });
});

describe('password reset', () => {
  test('returns a generic response for both existing and unknown accounts', async () => {
    const { user } = await createUser();
    const existing = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: user.email });
    const unknown = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'nobody@marwadiuniversity.ac.in' });

    assert.equal(existing.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(existing.body.message, unknown.body.message);
    assert.equal(sentPasswordResetTokens.length, 1);
    assert.equal(sentPasswordResetTokens[0].email, user.email);
  });

  test('resets password once using the emailed token', async () => {
    const { user } = await createUser();
    const requestReset = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: user.email });
    assert.equal(requestReset.status, 200);

    const resetToken = sentPasswordResetTokens[0].token;
    assert.match(resetToken, /^[a-f0-9]{64}$/);
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'new-strong-password' });
    assert.equal(reset.status, 200);

    const reusedToken = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'another-password' });
    assert.equal(reusedToken.status, 400);

    const oldPasswordLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const newPasswordLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'new-strong-password' });
    assert.equal(oldPasswordLogin.status, 400);
    assert.equal(newPasswordLogin.status, 200);
  });

  test('rejects expired and too-short password reset requests', async () => {
    const { user } = await createUser();
    await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: user.email });
    await user.updateOne({ passwordResetExpiresAt: new Date(Date.now() - 1000) });

    const expired = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: sentPasswordResetTokens[0].token, password: 'new-strong-password' });
    const tooShort = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: sentPasswordResetTokens[0].token, password: 'short' });
    assert.equal(expired.status, 400);
    assert.equal(tooShort.status, 400);
  });
});

describe('authenticated requests', () => {
  test('reject missing, invalid, and suspended-user tokens', async () => {
    const { token } = await createUser({ isSuspended: true });
    assert.equal((await request(app).get('/api/items/mine')).status, 401);
    assert.equal((await request(app).get('/api/items/mine').set('Authorization', 'Bearer nope')).status, 403);
    const suspended = await request(app).get('/api/items/mine').set('Authorization', `Bearer ${token}`);
    assert.equal(suspended.status, 403);
    assert.equal(suspended.body.code, 'ACCOUNT_SUSPENDED');
  });
});
