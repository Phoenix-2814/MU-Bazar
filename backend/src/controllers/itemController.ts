import { Request, Response } from 'express';
import Listing from '../models/Listing';

export const getListings = async (req: Request, res: Response) => {
  try {
    const { search, category } = req.query;
    const filter: any = {};

    if (search) {
      filter.title = { $regex: search as string,$options: 'i' };
    }

    if (category) {
      filter.category = category;
    }

    // Calculate timestamp for exactly 24 hours ago
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Filter condition: Show items that are AVAILABLE OR sold within the last 24 hours
    filter.$or = [
      { isSold: false },
      { isSold: true, updatedAt: { $gte: oneDayAgo } },
    ];

    const items = await Listing.find(filter)
      .populate('seller', 'name phone hostelBlock')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createListing = async (req: Request, res: Response) => {
  try {
    const { title, description, price, category, condition, seller } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    const newItem = await Listing.create({
      title,
      description,
      price: Number(price),
      category,
      condition,
      images: [imageUrl],
      seller,
      isSold: false,
    });

    res.status(201).json({ success: true, data: newItem });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const updateListing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, price, category, condition } = req.body;

    const updateData: any = {
      title,
      description,
      price: Number(price),
      category,
      condition,
    };

    if (req.file) {
      updateData.images = [`/uploads/${req.file.filename}`];
    }

    const updatedItem = await Listing.findByIdAndUpdate(id, updateData, { new: true });
    res.json({ success: true, data: updatedItem });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const deleteListing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    res.json({ success: true, message: 'Listing deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const markAsSold = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Set status to SOLD and update the timestamp for the 24h timer
    const updatedItem = await Listing.findByIdAndUpdate(
      id,
      { isSold: true, updatedAt: new Date() },
      { new: true }
    );

    res.json({ success: true, data: updatedItem });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
};