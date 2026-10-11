import express, { Request, Response, Router } from 'express';
import Listing from '../models/Listing';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { deleteImages, imageUpload, uploadImage } from '../config/imageStorage';

const VALID_CATEGORIES = new Set(['BOOKS', 'ELECTRONICS', 'CLOTHING', 'HOSTEL_ESSENTIALS', 'OTHER']);
const VALID_CONDITIONS = new Set(['NEW', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR']);
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 5000;

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

// GET /api/items - Fetch all listings
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const items = await Listing.find({
      isHidden: { $ne: true },
      $or: [{ isSold: false }, { isSold: true, updatedAt: { $gte: oneDayAgo } }],
    })
      .populate('seller', 'name residencyType hostelName hostelBlock profilePic')
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (err: any) {
    console.error('Error fetching items:', err);
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
    console.error('Error fetching your products:', err);
    res.status(500).json({ message: 'Failed to fetch your products.' });
  }
});

// POST /api/items - Post new listing
router.post(
  '/',
  authenticateToken,
  imageUpload.array('images', 5),
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
      console.error('Error posting item:', err);
      res.status(500).json({ message: err.message || 'Failed to post item' });
    }
  }
);

// PUT /api/items/:id - Modify listing details
router.put(
  '/:id',
  authenticateToken,
  imageUpload.array('images', 5),
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
        { new: true, runValidators: true }
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
      console.error('Error modifying item:', err);
      res.status(500).json({ message: err.message || 'Failed to update item' });
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
      console.error('Error toggling sold state:', err);
      res.status(500).json({ message: err.message || 'Failed to update status' });
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
    console.error('Error deleting product:', err);
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

export default router;