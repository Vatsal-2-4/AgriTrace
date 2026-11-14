import connectToDatabase from '../../api/_utils/db.js';

export default async function handler(req, res) {
  try {
    await connectToDatabase();
    res.status(200).json({ status: 'ok', message: 'Connected to MongoDB' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to connect to database', error: error.message });
  }
}
