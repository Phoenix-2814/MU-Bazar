import express, { Request, Response, Router } from 'express';
import Listing from '../models/Listing';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { imageUpload, uploadImage } from '../config/imageStorage';

const router: Router = express.Router();

// GET /api/items - Fetch all listings
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const items = await Listing.find({
      $or: [
        { isSold: false },
        { isSold: true, updatedAt: { $gte: oneDayAgo } },
      ],
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

      if (!title || !description || !price) {
        res.status(400).json({ message: 'Title, description, and price are required.' });
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

      if (title) listing.title = title;
      if (description) listing.description = description;
      if (price) listing.price = Number(price);
      if (category) listing.category = category;
      if (condition) listing.condition = condition;

      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        listing.images = await Promise.all(
          req.files.map((file) => uploadImage(file, '/mubazar/listings'))
        );
      }

      await listing.save();
      await listing.populate('seller', 'name email phone residencyType hostelName hostelBlock roomNumber profilePic');

      res.json({ message: 'Listing updated successfully', item: listing });
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

      listing.isSold = !listing.isSold;
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
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

export default router;