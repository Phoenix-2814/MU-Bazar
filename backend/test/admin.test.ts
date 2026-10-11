import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import Listing from '../src/models/Listing';
import ListingReport from '../src/models/ListingReport';
import { app, createListing, createUser, useTestDatabase } from './helpers';

useTestDatabase();

const createAdmin = () => createUser({ email: 'admin@marwadiuniversity.ac.in' });

describe('admin access', () => {
  test('only ADMIN_EMAILS accounts can use admin endpoints', async () => {
    const { token: studentToken } = await createUser();
    const { token: adminToken } = await createAdmin();

    const studentAccess = await request(app).get('/api/reports/admin/access').set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentAccess.body.isAdmin, false);
    const studentReports = await request(app).get('/api/reports/admin').set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentReports.status, 403);

    const adminAccess = await request(app).get('/api/reports/admin/access').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(adminAccess.body.isAdmin, true);
    const adminReports = await request(app).get('/api/reports/admin').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(adminReports.status, 200);
  });
});

describe('suspending users', () => {
  test('suspension hides the seller\'s listings and reactivation restores them', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: seller, token: sellerToken } = await createUser();
    const visible = await createListing(seller._id, { title: 'Visible' });
    const manuallyHidden = await createListing(seller._id, { title: 'Hidden by admin', isHidden: true });

    const suspend = await request(app)
      .patch(`/api/reports/admin/users/${seller._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSuspended: true, reason: 'Repeated scam reports' });
    assert.equal(suspend.status, 200);
    assert.equal((await Listing.findById(visible._id))?.isHidden, true);

    const blocked = await request(app).get('/api/items/mine').set('Authorization', `Bearer ${sellerToken}`);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'ACCOUNT_SUSPENDED');

    const reactivate = await request(app)
      .patch(`/api/reports/admin/users/${seller._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSuspended: false });
    assert.equal(reactivate.status, 200);
    assert.equal((await Listing.findById(visible._id))?.isHidden, false);
    assert.equal((await Listing.findById(manuallyHidden._id))?.isHidden, true);
  });

  test('requires a reason and protects admin accounts', async () => {
    const { user: admin, token: adminToken } = await createAdmin();
    const { user: student } = await createUser();

    const noReason = await request(app)
      .patch(`/api/reports/admin/users/${student._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSuspended: true });
    assert.equal(noReason.status, 400);

    const self = await request(app)
      .patch(`/api/reports/admin/users/${admin._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSuspended: true, reason: 'test' });
    assert.equal(self.status, 400);
  });
});

describe('admin listing deletion', () => {
  test('deletes the listing and resolves its open reports', async () => {
    const { user: admin, token: adminToken } = await createAdmin();
    const { user: seller } = await createUser();
    const { user: reporter } = await createUser();
    const listing = await createListing(seller._id);
    await ListingReport.create({ listing: listing._id, reporter: reporter._id, reason: 'scam' });

    const res = await request(app)
      .delete(`/api/reports/admin/listings/${listing._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(await Listing.countDocuments(), 0);

    const report = await ListingReport.findOne();
    assert.equal(report?.status, 'resolved');
    assert.equal(String(report?.reviewedBy), String(admin._id));
  });
});
