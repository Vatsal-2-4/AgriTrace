import connectToDatabase from '../../api/_utils/db.js';
import User from '../../api/_models/User.js';
import mongoose from 'mongoose';
import { ORGANIZATION_TYPES } from '../../api/_utils/market.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    const { name, email, mobile, state, password, role, preferredLanguage, organizationType } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (organizationType && !ORGANIZATION_TYPES.has(organizationType)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ORGANIZATION_TYPE', message: 'organizationType must be retailer, wholesaler, processor, or other' } });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    // Drop the mobile_1 index if it exists to fix local DB duplicate null errors
    try {
      await User.collection.dropIndex('mobile_1');
    } catch (e) {
      // Ignore if index doesn't exist
    }

    const payload = {
      name,
      email,
      password,
      role: organizationType ? (organizationType === 'other' ? 'BUYER' : organizationType.toUpperCase()) : (role === 'PROCESSING_UNIT' ? 'SELLER' : (['FARMER', 'SELLER', 'BUYER', 'RETAILER', 'WHOLESALER', 'PROCESSOR'].includes(String(role || '').toUpperCase()) ? String(role || 'FARMER').toUpperCase() : 'FARMER')),
      preferredLanguage: preferredLanguage || 'en',
      ...(organizationType ? { organizationType } : {}),
    };

    if (mobile) payload.mobile = mobile;
    if (state) payload.state = state;

    const newUser = await User.create(payload);

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        preferredLanguage: newUser.preferredLanguage || 'en'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
