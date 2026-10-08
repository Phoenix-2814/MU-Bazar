import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Listing from '../models/Listing';
import JWT_SECRET from '../config/jwt';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, hostelBlock } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      hostelBlock,
    });

    const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        hostelBlock: user.hostelBlock,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        hostelBlock: user.hostelBlock,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userListings = await Listing.find({ seller: userId }).sort({ createdAt: -1 });

    const totalPosted = userListings.length;
    const activeCount = userListings.filter((item) => !item.isSold).length;
    const soldCount = userListings.filter((item) => item.isSold).length;

    res.json({
      user,
      listings: userListings,
      stats: {
        totalPosted,
        activeCount,
        soldCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};