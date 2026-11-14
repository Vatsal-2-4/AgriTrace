import connectToDatabase from '../../api/_utils/db.js';
import MarketRecord from '../../api/_models/MarketRecord.js';
import { authenticate, isBuyer, isSeller, sendError } from '../../api/_utils/market.js';

const ALLOWED_KINDS = new Set(['LOT', 'DEMAND', 'OFFER', 'TRANSACTION', 'DISPUTE']);

export default async function handler(req, res) {
  try {
    await connectToDatabase();
    if (req.method === 'GET') {
      const kinds = String(req.query?.kind || '').split(',').filter(Boolean);
      const query = kinds.length ? { kind: { $in: kinds.filter(kind => ALLOWED_KINDS.has(kind)) } } : {};
      const records = await MarketRecord.find(query).sort({ updatedAt: -1 }).lean();
      return res.status(200).json({ records: records.map(record => ({ kind: record.kind, ...record.payload })) });
    }
    if (req.method === 'POST') {
      const user = authenticate(req);
      const { kind, record } = req.body || {};
      if (!ALLOWED_KINDS.has(kind) || !record?.id) return res.status(400).json({ error: 'kind and record.id are required' });
      let payload = { ...record };
      if (kind === 'LOT') {
        if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
        if (!isSeller(user)) return sendError(res, 403, 'FORBIDDEN', 'Seller role is required');
        if (payload.sellerId && payload.sellerId !== user.id) return sendError(res, 403, 'NOT_OWNER', 'A lot can only be written by its authenticated seller');
        payload.sellerId = user.id;
        if (!payload.cropId && payload.woolType) { payload.cropId = 'WOOL'; payload.cropName = payload.woolType; }
      }
      if (kind === 'DEMAND') {
        if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
        if (!isBuyer(user)) return sendError(res, 403, 'FORBIDDEN', 'A buyer organization profile is required');
        if (payload.buyerId && payload.buyerId !== user.id) return sendError(res, 403, 'NOT_OWNER', 'Demand can only be written by its authenticated buyer');
        payload.buyerId = user.id;
        payload.organizationType = user.organizationType;
      }
      if (kind === 'LOT' || kind === 'DEMAND') {
        const existing = await MarketRecord.findOne({ kind, recordId: String(record.id) }).lean();
        const existingOwner = kind === 'LOT' ? existing?.payload?.sellerId : existing?.payload?.buyerId;
        if (existing && existingOwner !== user.id) return sendError(res, 403, 'NOT_OWNER', 'Only the owning account can update this record');
      }
      const saved = await MarketRecord.findOneAndUpdate(
        { kind, recordId: String(record.id) },
        { $set: { payload, status: record.status || 'ACTIVE' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return res.status(200).json({ kind: saved.kind, ...saved.payload });
    }
    if (req.method === 'DELETE') {
      const { kind, id } = req.body || {};
      if (!ALLOWED_KINDS.has(kind) || !id) return res.status(400).json({ error: 'kind and id are required' });
      if (kind === 'LOT' || kind === 'DEMAND') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
        const existing = await MarketRecord.findOne({ kind, recordId: String(id) }).lean();
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Market record not found' } });
        const owner = kind === 'LOT' ? existing.payload?.sellerId : existing.payload?.buyerId;
        if (owner !== user.id || (kind === 'LOT' && !isSeller(user)) || (kind === 'DEMAND' && !isBuyer(user))) return sendError(res, 403, 'NOT_OWNER', 'Only the owning account can delete this record');
      }
      await MarketRecord.deleteOne({ kind, recordId: String(id) });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('market-records error', error);
    return res.status(500).json({ error: 'Unable to sync market records' });
  }
}
