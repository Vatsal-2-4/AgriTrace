import { randomUUID } from 'node:crypto';
import dbConnect from './_utils/db.js';
import { handleCors } from './_utils/http.js';
import { authenticate, isSeller, sendError, sendSuccess } from './_utils/market.js';
import ProduceImage from './_models/ProduceImage.js';
import MarketIntelligence from './_models/MarketIntelligence.js';
import { inferProduceImage } from './_utils/produceInference.js';
import { producePriceRecommendation } from './_utils/producePricing.js';
const inspector = user => ['QUALITY_INSPECTOR', 'INSPECTOR'].includes(user.role);

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to upload or review produce photos');
  try {
    await dbConnect();
    if (req.method === 'GET' && req.query?.image) {
      const image = await ProduceImage.findOne({ imageId: String(req.query.image) });
      if (!image || (image.ownerId !== user.id && !inspector(user))) return sendError(res, 404, 'IMAGE_NOT_FOUND', 'Photo not found');
      res.setHeader('Content-Type', image.mime); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(image.bytes);
    }
    if (req.method === 'GET' && req.query?.action === 'queue') {
      if (!inspector(user)) return sendError(res, 403, 'INSPECTOR_REQUIRED', 'Quality partner role is required');
      const pending = await MarketIntelligence.find({ kind: 'QUALITY_ASSESSMENT', lotId: { $exists: true, $ne: null }, inspectorVerification: null }).sort({ createdAt: 1 }).limit(100).select('lotId').lean();
      // Never split a lot's photos at the queue page boundary.
      const items = await MarketIntelligence.find({ kind: 'QUALITY_ASSESSMENT', lotId: { $in: [...new Set(pending.map(item => item.lotId))] }, inspectorVerification: null }).sort({ createdAt: 1 }).lean();
      return sendSuccess(res, { items });
    }
    if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    if (!isSeller(user)) return sendError(res, 403, 'SELLER_REQUIRED', 'Seller role is required');
    const body = req.body || {};
    if (body.action === 'price') {
      try { return sendSuccess(res, await producePriceRecommendation({ ...body, ownerId: user.id })); }
      catch { return sendError(res, 503, 'PRICE_UNAVAILABLE', 'Live price recommendation unavailable. Check state and transport cost; no demo prices were substituted.'); }
    }
    if (body.action !== 'analyze' || typeof body.cropId !== 'string' || body.cropId.length > 80) return sendError(res, 400, 'INVALID_REQUEST', 'A crop and analyze action are required');
    const match = typeof body.imageData === 'string' && body.imageData.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > 2800000) return sendError(res, 400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image under 2 MB');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 2 * 1024 * 1024 || bytes.length < 24) return sendError(res, 400, 'INVALID_IMAGE', 'Invalid or oversized image');
    const validMagic = match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!validMagic) return sendError(res, 400, 'INVALID_IMAGE', 'Image content does not match its type');
    let result;
    try { result = await inferProduceImage(body.cropId.toUpperCase(), match[2]); }
    catch { return sendError(res, 503, 'IMAGE_PROCESSING_UNAVAILABLE', 'The image could not be validated. Check the image and quality service, then upload again; no unvalidated photo was stored.'); }
    const imageId = randomUUID();
    const imageRef = `storage://produce/${imageId}`;
    await ProduceImage.create({ imageId, ownerId: user.id, cropId: body.cropId, mime: `image/${match[1]}`, bytes });
    const assessment = await MarketIntelligence.create({ kind: 'QUALITY_ASSESSMENT', recordId: `QAS-${randomUUID()}`, cropId: body.cropId, imageRefs: [imageRef], evaluatorId: user.id, status: 'REVIEW_REQUIRED', result, modelVersion: result.modelVersion || null, evidence: { imageRefs: [imageRef] }, sourceFreshness: { status: 'CURRENT', observedAt: new Date() } });
    return sendSuccess(res, { assessmentId: assessment.recordId, imageRef, result }, 201);
  } catch (error) {
    console.error('Produce quality request failed:', error.name);
    return sendError(res, 503, 'QUALITY_UNAVAILABLE', 'Quality storage is unavailable. Your lot has not been published; retry when the database is connected.');
  }
}
