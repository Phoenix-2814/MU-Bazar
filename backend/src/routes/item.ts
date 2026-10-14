import express, { Request, Response, Router } from 'express';
import mongoose, { SortOrder } from 'mongoose';
import Listing from '../models/Listing';
import User from '../models/User';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { deleteImages, imageUpload, uploadImage, validateImageContent } from '../config/imageStorage';
import { uploadRateLimit } from '../middleware/rateLimit';
import { logError } from '../config/logger';

const VALID_CATEGORIES = new Set(['BOOKS', 'ELECTRONICS', 'CLOTHING', 'HOSTEL_ESSENTIALS', 'OTHER']);
const VALID_CONDITIONS = new Set(['NEW', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR']);
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = MAX_PAGE_SIZE;
const MAX_SEARCH_TERMS = 10;
const CATEGORY_LABELS: Record<string, string> = {
  BOOKS: 'Books & Notes',
  ELECTRONICS: 'Electronics',
  CLOTHING: 'Clothing',
  HOSTEL_ESSENTIALS: 'Hostel Essentials',
  OTHER: 'Others',
};
const LISTING_SORTS: Record<string, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  'price-low': { price: 1, _id: 1 },
  'price-high': { price: -1, _id: -1 },
};

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// undefined = no filter, null = invalid
const parsePriceFilter = (value: string | undefined): number | undefined | null => {
  if (value === undefined || value.trim() === '') return undefined;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 500000 ? price : null;
};

// Every search term must match at least one listing or seller field,
// mirroring the frontend's client-side search.
const buildSearchConditions = async (search: string) => {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TERMS);
  return Promise.all(
    terms.map(async (term) => {
      const escaped = escapeRegex(term);
      const pattern = new RegExp(escaped, 'i');
      const sellerIds = await User.find({
        $or: [{ name: pattern }, { residencyType: pattern }, { hostelName: pattern }, { hostelBlock: pattern }],
      }).distinct('_id');
      const labelCategories = Object.keys(CATEGORY_LABELS).filter((key) => pattern.test(CATEGORY_LABELS[key]));
      return {
        $or: [
          { title: pattern },
          { description: pattern },
          { category: pattern },
          { condition: pattern },
          { category: { $in: labelCategories } },
          { seller: { $in: sellerIds } },
          { $expr: { $regexMatch: { input: { $toString: '$price' }, regex: escaped, options: 'i' } } },
        ],
      };
    })
  );
};

const validateListingData = (payload: {
  title?: string;
  description?: string;
  price?: unknown;
  category?: string;
  condition?: string;
}) => {
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const price = Number(payload.price);
  const category = String(payload.category || '').trim();
  const condition = String(payload.condition || '').trim();

  if (title.length < 3) {
    return 'Title must be at least 3 characters long.';
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }

  if (description.length < 10) {
    return 'Description must be at least 10 characters long.';
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (!Number.isFinite(price) || price <= 0 || price > 500000) {
    return 'Price must be a positive number under ₹5,00,000.';
  }

  if (!VALID_CATEGORIES.has(category)) {
    return 'Please choose a valid listing category.';
  }

  if (!VALID_CONDITIONS.has(condition)) {
    return 'Please choose a valid condition.';
  }

  return null;
};

const router: Router = express.Router();

// GET /api/items - Fetch marketplace listings.
// Without `limit` the full list is returned as an array (older frontends);
// with `limit` the response is `{ items, total, hasMore }` for the requested page.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const filter: Record<string, unknown> = {
      isHidden: { $ne: true },
      $or: [{ isSold: false }, { isSold: true, updatedAt: { $gte: oneDayAgo } }],
    };

    if (req.query.limit === undefined) {
      const items = await Listing.find(filter)
        .populate('seller', 'name residencyType hostelName hostelBlock profilePic')
        .sort({ createdAt: -1 })
        .limit(DEFAULT_PAGE_SIZE);
      res.json(items);
      return;
    }

    const limit = Number(queryString(req.query.limit));
    const offset = Number(queryString(req.query.offset) ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      res.status(400).json({ message: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.` });
      return;
    }
    if (!Number.isInteger(offset) || offset < 0) {
      res.status(400).json({ message: 'offset must be a whole number of 0 or more.' });
      return;
    }

    const sortKey = queryString(req.query.sort) ?? 'newest';
    const sort = LISTING_SORTS[sortKey];
    if (!sort) {
      res.status(400).json({ message: 'sort must be newest, price-low, or price-high.' });
      return;
    }

    const conditions: Record<string, unknown>[] = [];

    const category = queryString(req.query.category);
    if (category !== undefined && category !== 'ALL') {
      if (!VALID_CATEGORIES.has(category)) {
        res.status(400).json({ message: 'Please choose a valid listing category.' });
        return;
      }
      conditions.push({ category });
    }

    const minPrice = parsePriceFilter(queryString(req.query.minPrice));
    const maxPrice = parsePriceFilter(queryString(req.query.maxPrice));
    if (minPrice === null || maxPrice === null) {
      res.status(400).json({ message: 'Price filters must be between ₹0 and ₹5,00,000.' });
      return;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      conditions.push({
        price: {
          ...(minPrice !== undefined && { $gte: minPrice }),
          ...(maxPrice !== undefined && { $lte: maxPrice }),
        },
      });
    }

    const excludeSeller = queryString(req.query.excludeSeller);
    if (excludeSeller && mongoose.isValidObjectId(excludeSeller)) {
      conditions.push({ seller: { $ne: excludeSeller } });
    }

    const search = queryString(req.query.q);
    if (search) {
      if (search.length > 200) {
        res.status(400).json({ message: 'Search must be 200 characters or fewer.' });
        return;
      }
      conditions.push(...(await buildSearchConditions(search)));
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [items, total] = await Promise.all([
      Listing.find(filter)
        .populate('seller', 'name residencyType hostelName hostelBlock profilePic')
        .sort(sort)
        .skip(offset)
        .limit(limit),
      Listing.countDocuments(filter),
    ]);

    res.json({ items, total, hasMore: offset + items.length < total });
  } catch (err: any) {
    logError('listing_search_failed', err);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
});

router.get('/mine', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const items = await Listing.find({ seller: userId })
      .populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber profilePic')
      .sort({ updatedAt: -1 });
    res.json(items);
  } catch (err) {
    logError('seller_listing_list_failed', err);
    res.status(500).json({ message: 'Failed to fetch your products.' });
  }
});

// GET /api/items/:id - Fetch single listing by ID for direct links
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ message: 'Invalid listing ID.' });
      return;
    }

    const item = await Listing.findById(id)
      .populate('seller', 'name residencyType hostelName hostelBlock profilePic');

    if (!item || item.isHidden) {
      res.status(404).json({ message: 'Listing not found or is no longer available.' });
      return;
    }

    res.json(item);
  } catch (err) {
    logError('listing_detail_failed', err);
    res.status(500).json({ message: 'Failed to fetch listing details.' });
  }
});

// POST /api/items - Post new listing
router.post(
  '/',
  authenticateToken,
  uploadRateLimit,
  imageUpload.array('images', 5),
  validateImageContent,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { title, description, price, category, condition } = req.body;
      const validationError = validateListingData({ title, description, price, category, condition });

      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }

      const imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        imageUrls.push(...await Promise.all(
          req.files.map((file) => uploadImage(file, '/mubazar/listings'))
        ));
      }

      const userId = req.user?.id || req.user?._id || req.user?.userId;

      const newListing = new Listing({
        title,
        description,
        price: Number(price),
        category: category || 'OTHER',
        condition: condition || 'USED_GOOD',
        images: imageUrls,
        seller: userId,
      });

      await newListing.save();
      await newListing.populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber profilePic');

      res.status(201).json({ message: 'Item created successfully', item: newListing });
    } catch (err: any) {
      logError('listing_create_failed', err);
      res.status(500).json({ message: 'Failed to create listing.' });
    }
  }
);

// PUT /api/items/:id - Modify listing details
router.put(
  '/:id',
  authenticateToken,
  uploadRateLimit,
  imageUpload.array('images', 5),
  validateImageContent,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id || req.user?._id || req.user?.userId;
      const listing = await Listing.findById(req.params.id);

      if (!listing) {
        res.status(404).json({ message: 'Listing not found.' });
        return;
      }

      if (listing.seller.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Unauthorized to edit this listing.' });
        return;
      }

      const { title, description, price, category, condition } = req.body;
      const updateFields: Record<string, string | number | string[]> = {};

      if (title !== undefined) {
        const titleValue = String(title).trim();
        if (!titleValue || titleValue.length < 3) {
          res.status(400).json({ message: 'Title must be at least 3 characters long.' });
          return;
        }
        if (titleValue.length > MAX_TITLE_LENGTH) {
          res.status(400).json({ message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` });
          return;
        }
        updateFields.title = titleValue;
      }

      if (description !== undefined) {
        const descriptionValue = String(description).trim();
        if (!descriptionValue || descriptionValue.length < 10) {
          res.status(400).json({ message: 'Description must be at least 10 characters long.' });
          return;
        }
        if (descriptionValue.length > MAX_DESCRIPTION_LENGTH) {
          res.status(400).json({ message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` });
          return;
        }
        updateFields.description = descriptionValue;
      }

      if (price !== undefined) {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 500000) {
          res.status(400).json({ message: 'Price must be a positive number under ₹5,00,000.' });
          return;
        }
        updateFields.price = numericPrice;
      }

      if (category !== undefined) {
        const categoryValue = String(category).trim();
        if (!VALID_CATEGORIES.has(categoryValue)) {
          res.status(400).json({ message: 'Please choose a valid listing category.' });
          return;
        }
        updateFields.category = categoryValue;
      }

      if (condition !== undefined) {
        const conditionValue = String(condition).trim();
        if (!VALID_CONDITIONS.has(conditionValue)) {
          res.status(400).json({ message: 'Please choose a valid condition.' });
          return;
        }
        updateFields.condition = conditionValue;
      }

      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        updateFields.images = await Promise.all(
          req.files.map((file) => uploadImage(file, '/mubazar/listings'))
        );
      }

      const updatedListing = await Listing.findOneAndUpdate(
        { _id: req.params.id, seller: userId },
        { $set: updateFields },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updatedListing) {
        res.status(404).json({ message: 'Listing was removed before the update completed.' });
        return;
      }
      await updatedListing.populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber profilePic');

      res.json({ message: 'Listing updated successfully', item: updatedListing });

      if (updateFields.images) {
        void deleteImages(listing.images.filter((url) => !updatedListing.images.includes(url)));
      }
    } catch (err: any) {
      logError('listing_update_failed', err);
      res.status(500).json({ message: 'Failed to update listing.' });
    }
  }
);

// PATCH /api/items/:id/sold - Toggle Sold status
router.patch(
  '/:id/sold',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const requestedSoldStatus = req.body?.isSold;
      if (requestedSoldStatus !== undefined && typeof requestedSoldStatus !== 'boolean') {
        res.status(400).json({ message: 'isSold must be true or false.' });
        return;
      }

      const userId = req.user?.id || req.user?._id || req.user?.userId;
      const listing = await Listing.findById(req.params.id);

      if (!listing) {
        res.status(404).json({ message: 'Listing not found.' });
        return;
      }

      if (listing.seller.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Unauthorized to modify this listing.' });
        return;
      }

      listing.isSold = requestedSoldStatus === undefined ? !listing.isSold : requestedSoldStatus;
      await listing.save();

      res.json({ message: 'Item status updated', isSold: listing.isSold, item: listing });
    } catch (err: any) {
      logError('listing_sold_status_failed', err);
      res.status(500).json({ message: 'Failed to update listing status.' });
    }
  }
);

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      res.status(404).json({ message: 'Listing not found.' });
      return;
    }

    if (listing.seller.toString() !== userId?.toString()) {
      res.status(403).json({ message: 'Unauthorized to delete this listing.' });
      return;
    }

    await listing.deleteOne();
    res.json({ message: 'Product deleted successfully.' });
    void deleteImages(listing.images);
  } catch (err) {
    logError('listing_delete_failed', err);
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

export default router;
