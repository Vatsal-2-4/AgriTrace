import connectToDatabase from '../../api/_utils/db.js';
import User from '../../api/_models/User.js';

import { ORGANIZATION_TYPES, issueAccessToken } from '../../api/_utils/market.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    const { name, email, mobile, state, password, role, preferredLanguage, organizationType, marketContactConsent } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (organizationType && !ORGANIZATION_TYPES.has(organizationType)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ORGANIZATION_TYPE', message: 'organizationType must be retailer, wholesaler, processor, or other' } });
    }
    if (String(role || '').toUpperCase() === 'BUYER' && !organizationType) {
      return res.status(400).json({ success: false, error: { code: 'BUYER_ORGANIZATION_REQUIRED', message: 'Select whether this buyer account is a retailer, wholesaler, processor, or other buyer.' } });
    }
    if (['FARMER','SELLER','FPO','BUYER','RETAILER','WHOLESALER','PROCESSOR'].includes(String(role || '').toUpperCase()) && marketContactConsent !== true) {
      return res.status(400).json({ success: false, error: { code: 'MARKET_CONTACT_CONSENT_REQUIRED', message: 'Consent is required to share contact details with a marketplace counterparty after a bid is accepted.' } });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    // Drop the mobile_1 index if it exists to fix local DB duplicate null errors
    try {
      await User.collection.dropIndex('mobile_1');
    } catch  {
      // Ignore if index doesn't exist
    }

    const payload = {
      name,
      email,
      password,
      role: organizationType ? (organizationType === 'other' ? 'BUYER' : organizationType.toUpperCase()) : (role === 'PROCESSING_UNIT' ? 'SELLER' : (['FARMER', 'SELLER', 'BUYER', 'RETAILER', 'WHOLESALER', 'PROCESSOR'].includes(String(role || '').toUpperCase()) ? String(role || 'FARMER').toUpperCase() : 'FARMER')),
      preferredLanguage: preferredLanguage || 'en',
      marketContactConsent: marketContactConsent === true,
      ...(organizationType ? { organizationType } : {}),
    };

    if (mobile) payload.mobile = mobile;
    if (state) payload.state = state;

    const newUser = await User.create(payload);

    res.status(201).json({
      message: 'Account created successfully',
      accessToken: issueAccessToken(newUser),
      tokenType: 'Bearer',
      expiresIn: 43200,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        preferredLanguage: newUser.preferredLanguage || 'en',
        organizationType: newUser.organizationType || null,
        mobile: newUser.mobile || null,
        state: newUser.state || null,
        marketContactConsent: newUser.marketContactConsent === true
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
