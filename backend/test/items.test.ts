import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import Listing from '../src/models/Listing';
import ListingReport from '../src/models/ListingReport';
import { app, createListing, createUser, useTestDatabase } from './helpers';

useTestDatabase();

const newListing = {
  title: 'Scientific calculator',
  description: 'Casio fx-991ES, works perfectly.',
  price: 650,
  category: 'ELECTRONICS',
  condition: 'USED_LIKE_NEW',
};

describe('creating listings', () => {
  test('requires login', async () => {
    const res = await request(app).post('/api/items').send(newListing);
    assert.equal(res.status, 401);
  });

  test('creates a listing for the logged-in seller', async () => {
    const { user, token } = await createUser();
    const res = await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send(newListing);
    assert.equal(res.status, 201);
    assert.equal(res.body.item.title, newListing.title);
    assert.equal(String(res.body.item.seller._id), String(user._id));
  });

  test('validates price, title, and category', async () => {
    const { token } = await createUser();
    for (const invalid of [{ price: 0 }, { price: 600000 }, { title: 'ab' }, { category: 'CARS' }]) {
      const res = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...newListing, ...invalid });
      assert.equal(res.status, 400, JSON.stringify(invalid));
    }
    assert.equal(await Listing.countDocuments(), 0);
  });
});

describe('browsing listings', () => {
  test('hides hidden listings and sold listings older than a day', async () => {
    const { user } = await createUser();
    await createListing(user._id, { title: 'Visible listing' });
    await createListing(user._id, { title: 'Hidden listing', isHidden: true });
    await createListing(user._id, { title: 'Recently sold', isSold: true });
    const oldSold = await createListing(user._id, { title: 'Old sold' });
    await Listing.collection.updateOne(
      { _id: oldSold._id },
      { $set: { isSold: true, updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
    );

    const legacy = await request(app).get('/api/items');
    assert.deepEqual(legacy.body.map((item: { title: string }) => item.title).sort(), ['Recently sold', 'Visible listing']);
  });

  test('pages through listings and reports whether more remain', async () => {
    const { user } = await createUser();
    for (let index = 0; index < 5; index += 1) {
      await createListing(user._id, { title: `Listing ${index}`, price: 100 + index });
    }

    const firstPage = await request(app).get('/api/items').query({ limit: 3, sort: 'price-low' });
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.total, 5);
    assert.equal(firstPage.body.hasMore, true);
    assert.deepEqual(firstPage.body.items.map((item: { price: number }) => item.price), [100, 101, 102]);

    const secondPage = await request(app).get('/api/items').query({ limit: 3, offset: 3, sort: 'price-low' });
    assert.equal(secondPage.body.hasMore, false);
    assert.deepEqual(secondPage.body.items.map((item: { price: number }) => item.price), [103, 104]);
  });

  test('filters by search terms (including seller hostel), category, price, and seller', async () => {
    const { user: hosteler } = await createUser({ residencyType: 'hosteler', hostelName: 'Tagore', hostelBlock: 'B', roomNumber: '12' });
    const { user: other } = await createUser();
    await createListing(hosteler._id, { title: 'Physics textbook', price: 250 });
    await createListing(other._id, { title: 'Desk lamp', category: 'HOSTEL_ESSENTIALS', price: 400 });

    const titles = async (query: Record<string, string | number>) => {
      const res = await request(app).get('/api/items').query({ limit: 20, ...query });
      assert.equal(res.status, 200);
      return res.body.items.map((item: { title: string }) => item.title);
    };

    assert.deepEqual(await titles({ q: 'physics' }), ['Physics textbook']);
    assert.deepEqual(await titles({ q: 'tagore physics' }), ['Physics textbook']);
    assert.deepEqual(await titles({ q: 'hostel essentials' }), ['Desk lamp']);
    assert.deepEqual(await titles({ q: '(.*' }), []);
    assert.deepEqual(await titles({ category: 'BOOKS' }), ['Physics textbook']);
    assert.deepEqual(await titles({ minPrice: 300, maxPrice: 500 }), ['Desk lamp']);
    assert.deepEqual(await titles({ excludeSeller: String(hosteler._id) }), ['Desk lamp']);
  });

  test('rejects invalid paging and filter values', async () => {
    for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 5, offset: -1 }, { limit: 5, sort: 'random' }, { limit: 5, category: 'CARS' }, { limit: 5, minPrice: -1 }]) {
      const res = await request(app).get('/api/items').query(query);
      assert.equal(res.status, 400, JSON.stringify(query));
    }
  });
});

describe('editing and deleting listings', () => {
  test('only the seller can edit or delete a listing', async () => {
    const { user: seller, token: sellerToken } = await createUser();
    const { token: otherToken } = await createUser();
    const listing = await createListing(seller._id);

    const otherEdit = await request(app)
      .put(`/api/items/${listing._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ price: 1 });
    assert.equal(otherEdit.status, 403);

    const otherDelete = await request(app).delete(`/api/items/${listing._id}`).set('Authorization', `Bearer ${otherToken}`);
    assert.equal(otherDelete.status, 403);

    const edit = await request(app)
      .put(`/api/items/${listing._id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ price: 275 });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.item.price, 275);

    const sold = await request(app)
      .patch(`/api/items/${listing._id}/sold`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ isSold: true });
    assert.equal(sold.status, 200);
    assert.equal(sold.body.isSold, true);

    const remove = await request(app).delete(`/api/items/${listing._id}`).set('Authorization', `Bearer ${sellerToken}`);
    assert.equal(remove.status, 200);
    assert.equal(await Listing.countDocuments(), 0);
  });

  test('keeps reports when a seller deletes their own listing', async () => {
    const { user: seller, token } = await createUser();
    const { user: reporter } = await createUser();
    const listing = await createListing(seller._id);
    await ListingReport.create({ listing: listing._id, reporter: reporter._id, reason: 'scam' });

    await request(app).delete(`/api/items/${listing._id}`).set('Authorization', `Bearer ${token}`).expect(200);
    const report = await ListingReport.findOne();
    assert.equal(report?.status, 'open');
  });
});
