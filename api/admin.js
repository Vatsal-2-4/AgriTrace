import dbConnect from './_utils/db.js';
import { authenticate, sendError, sendSuccess } from './_utils/market.js';
import User from './_models/User.js';
import { handleCors } from './_utils/http.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');

  const actor = authenticate(req);
  if (!actor) return sendError(res, 401, 'AUTH_REQUIRED', 'Sign in with an administrator account.');
  if (actor.role !== 'ADMIN') return sendError(res, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');

  try {
    await dbConnect();
    const users = await User.find({}).select('name email mobile role organizationType state createdAt').sort({ createdAt: -1 }).limit(2000).lean();
    return sendSuccess(res, { users, count: users.length });
  } catch (error) {
    console.error('admin users query failed', error);
    return sendError(res, 500, 'ADMIN_USERS_UNAVAILABLE', 'Could not load platform users.');
  }
}
