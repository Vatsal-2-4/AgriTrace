import { randomUUID } from 'node:crypto';
import { fetchCedaApi, handleCedaError } from './_utils/ceda.js';
import { getApiRoute, handleCors } from './_utils/http.js';
import dbConnect from './_utils/db.js';
import WoolBatch from './_models/WoolBatch.js';
import ProduceLot from './_models/ProduceLot.js';
import ProduceImage from './_models/ProduceImage.js';
import BuyerDemand from './_models/BuyerDemand.js';
import BulkBid from './_models/BulkBid.js';
import MarketIntelligence from './_models/MarketIntelligence.js';
import User from './_models/User.js';
import { authenticate, isBuyer, isSeller, ORGANIZATION_TYPES, UNITS, isStorageReference, sendError, sendSuccess, validPositive, validString } from './_utils/market.js';

const makeId = prefix => `${prefix}-${randomUUID()}`;
const now = () => new Date();
function getMarketPath(req) {
  const route = getApiRoute(req).split('?')[0];
  return route.startsWith('/api/market/') ? route.slice('/api/market'.length) : route;
}
const getLocationFilter = (query, prefix = 'location') => {
  const filter = {};
  if (query.state) filter[`${prefix}.state`] = String(query.state).slice(0, 100);
  if (query.district) filter[`${prefix}.district`] = String(query.district).slice(0, 100);
  return filter;
};

async function listLots(req, res) {
  const { cropId, crop, grade, status, state, district } = req.query || {};
  const page = Number(req.query?.page || 1);
  const limit = Number(req.query?.limit || 20);
  const minQuantity = req.query?.minQuantity === undefined ? undefined : Number(req.query.minQuantity);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || (minQuantity !== undefined && (!Number.isFinite(minQuantity) || minQuantity < 0))) {
    return sendError(res, 400, 'INVALID_QUERY', 'page, limit, or minQuantity is invalid');
  }
  const query = {};
  if (cropId || crop) query.cropId = String(cropId || crop).slice(0, 80);
  if (grade) query.verifiedGrade = String(grade).slice(0, 60);
  if (status) {
    if (!['OPEN','PARTIALLY_FILLED','CLOSED','CANCELLED'].includes(String(status).toUpperCase())) return sendError(res, 400, 'INVALID_STATUS', 'Lot status is invalid');
    query.status = String(status).toUpperCase();
  } else query.status = { $in: ['OPEN','PARTIALLY_FILLED'] };
  if (minQuantity !== undefined) query.availableQuantity = { $gte: minQuantity };
  Object.assign(query, getLocationFilter(req.query || {}));

  const [lots, total] = await Promise.all([
    ProduceLot.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProduceLot.countDocuments(query)
  ]);
  // Legacy wool batches remain readable during migration and are normalized only at the API boundary.
  let legacyLots = [];
  if ((!cropId && !crop) || String(cropId || crop).toUpperCase() === 'WOOL') {
    const legacy = await WoolBatch.find({ ...(minQuantity !== undefined ? { availableQuantity: { $gte: minQuantity } } : {}) }).sort({ createdAt: -1 }).limit(limit).lean();
    legacyLots = legacy.map(ProduceLot.fromLegacyWool).filter(lot => (!grade || lot.verifiedGrade === grade) && (!state || String(lot.origin || '').toLowerCase().includes(String(state).toLowerCase())));
  }
  const combined = [...lots, ...legacyLots].slice(0, limit);
  return sendSuccess(res, { items: combined, pagination: { page, limit, total: total + legacyLots.length, pages: Math.ceil((total + legacyLots.length) / limit) } });
}

async function createLot(req, res, user) {
  if (!isSeller(user)) return sendError(res, 403, 'FORBIDDEN', 'Seller role is required');
  const body = req.body || {};
  if (!validString(body.cropId, 80) || !validString(body.cropName, 120) || !validPositive(body.quantity) || !UNITS.has(body.unit)) return sendError(res, 400, 'INVALID_LOT', 'cropId, cropName, positive quantity, and a supported unit are required');
  const location = body.location || {};
  if (!validString(location.district, 100) || !validString(location.state, 100) || (location.lat !== undefined && (!Number.isFinite(location.lat) || location.lat < -90 || location.lat > 90)) || (location.lng !== undefined && (!Number.isFinite(location.lng) || location.lng < -180 || location.lng > 180))) return sendError(res, 400, 'INVALID_LOCATION', 'A valid district and state are required');
  const imageRefs = body.imageRefs === undefined ? [] : body.imageRefs;
  if (!Array.isArray(imageRefs) || imageRefs.length > 20 || !imageRefs.every(isStorageReference)) return sendError(res, 400, 'INVALID_IMAGE_REFERENCE', 'imageRefs must contain at most 20 approved storage references');
  if (body.askingPrice !== undefined && (!Number.isFinite(body.askingPrice) || body.askingPrice < 0 || !validString(body.priceUnit, 40))) return sendError(res, 400, 'INVALID_PRICE', 'askingPrice must be finite and non-negative and requires a priceUnit');
  const availableQuantity = body.availableQuantity === undefined ? body.quantity : body.availableQuantity;
  if (!Number.isFinite(availableQuantity) || availableQuantity < 0 || availableQuantity > body.quantity) return sendError(res, 400, 'INVALID_QUANTITY', 'availableQuantity must be between zero and quantity');
  const lotId = makeId('LOT');
  const closesAt = body.closingAt === undefined ? undefined : new Date(body.closingAt);
  if (body.closingAt !== undefined && (!Number.isFinite(closesAt.getTime()) || closesAt <= now())) return sendError(res, 400, 'INVALID_CLOSING_TIME', 'closingAt must be a future date');
  const harvestedAt = body.harvestedAt === undefined ? undefined : new Date(body.harvestedAt);
  if (harvestedAt && !Number.isFinite(harvestedAt.getTime())) return sendError(res, 400, 'INVALID_HARVEST_DATE', 'harvestedAt must be a valid date');
  const assessmentIds = body.qualityAssessmentIds || [];
  if (!Array.isArray(assessmentIds) || assessmentIds.length > 5 || !assessmentIds.every(id => typeof id === 'string' && /^QAS-[a-z0-9-]+$/i.test(id)) || new Set(assessmentIds).size !== assessmentIds.length) return sendError(res, 400, 'INVALID_ASSESSMENTS', 'Select up to five uploaded quality assessments');
  const assessments = await MarketIntelligence.find({ recordId: { $in: assessmentIds }, kind: 'QUALITY_ASSESSMENT', evaluatorId: user.id, cropId: body.cropId, lotId: { $exists: false } }).lean();
  const uploadedRefs = assessments.flatMap(item => item.imageRefs);
  if (assessments.length !== assessmentIds.length || uploadedRefs.some(ref => !imageRefs.includes(ref)) || imageRefs.some(ref => ref.startsWith('storage://produce/') && !uploadedRefs.includes(ref))) return sendError(res, 400, 'INVALID_ASSESSMENTS', 'Photos must belong to this seller and crop and be unused');
  if (uploadedRefs.length) {
    const images = await ProduceImage.countDocuments({ ownerId: user.id, cropId: body.cropId, imageId: { $in: uploadedRefs.map(ref => ref.split('/').at(-1)) }, lotId: { $exists: false }, expiresAt: { $gt: now() } });
    if (images !== uploadedRefs.length) return sendError(res, 400, 'EXPIRED_PHOTOS', 'An uploaded photo expired or is already used; upload it again');
  }
  const lot = new ProduceLot({ lotId, sellerId: user.id, sellerType: user.role, cropId: body.cropId.trim(), cropName: body.cropName.trim(), variety: validString(body.variety, 120) ? body.variety.trim() : undefined, quantity: body.quantity, availableQuantity, unit: String(body.unit).toLowerCase(), harvestedAt, origin: validString(body.origin, 200) ? body.origin.trim() : undefined, location, imageRefs, qualityAssessmentId: assessmentIds[0], qualityEstimates: assessments.map(item => ({ assessmentId: item.recordId, ...item.result })), askingPrice: body.askingPrice, priceUnit: body.priceUnit, marketClosesAt: closesAt, status: availableQuantity === 0 ? 'CLOSED' : 'OPEN', auditTrail: [{ event: 'LOT_CREATED', actorId: user.id, at: now() }] });
  const session = await ProduceLot.startSession();
  try {
    await session.withTransaction(async () => {
      await lot.save({ session });
  if (assessmentIds.length) {
    const claimed = await MarketIntelligence.updateMany({ recordId: { $in: assessmentIds }, evaluatorId: user.id, lotId: { $exists: false } }, { $set: { lotId } }, { session });
    if (claimed.modifiedCount !== assessmentIds.length) throw Object.assign(new Error('Photo already used'), { code: 'PHOTOS_ALREADY_USED' });
    const boundImages = await ProduceImage.updateMany({ ownerId: user.id, imageId: { $in: uploadedRefs.map(ref => ref.split('/').at(-1)) } }, { $set: { lotId }, $unset: { expiresAt: 1 } }, { session });
    if (boundImages.modifiedCount !== uploadedRefs.length) throw Object.assign(new Error('Photo expired'), { code: 'PHOTOS_ALREADY_USED' });
  }
    });
    return sendSuccess(res, lot.toObject(), 201);
  } catch (error) {
    if (error.code === 'PHOTOS_ALREADY_USED') return sendError(res, 409, error.code, 'An uploaded photo was already used or expired; upload again');
    throw error;
  } finally { await session.endSession(); }
}

async function listDemands(req, res) {
  const query = {};
  if (req.query?.cropId) query.cropId = String(req.query.cropId).slice(0, 80);
  if (req.query?.status) {
    if (!['OPEN','FULFILLED','CANCELLED','EXPIRED'].includes(String(req.query.status).toUpperCase())) return sendError(res, 400, 'INVALID_STATUS', 'Demand status is invalid');
    query.status = String(req.query.status).toUpperCase();
  } else query.status = 'OPEN';
  Object.assign(query, getLocationFilter(req.query || {}, 'deliveryLocation'));
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 20)));
  const page = Math.max(1, Number(req.query?.page || 1));
  if (!Number.isInteger(limit) || !Number.isInteger(page)) return sendError(res, 400, 'INVALID_QUERY', 'page and limit must be positive integers');
  const [items, total] = await Promise.all([BuyerDemand.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), BuyerDemand.countDocuments(query)]);
  return sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function createDemand(req, res, user) {
  if (!isBuyer(user)) return sendError(res, 403, 'FORBIDDEN', 'Buyer role is required');
  const body = req.body || {};
  const organizationType = user.organizationType || body.organizationType;
  if (!ORGANIZATION_TYPES.has(organizationType)) return sendError(res, 400, 'INVALID_ORGANIZATION_TYPE', 'Buyer organizationType must be retailer, wholesaler, processor, or other');
  const location = body.deliveryLocation || {};
  const deliveryBy = new Date(body.deliveryBy);
  if (!validString(body.cropId, 80) || !validPositive(body.quantity) || !UNITS.has(body.unit) || typeof body.maxPrice !== 'number' || !Number.isFinite(body.maxPrice) || body.maxPrice < 0 || !validString(body.priceUnit, 40) || !validString(location.district, 100) || !validString(location.state, 100) || !Number.isFinite(deliveryBy.getTime()) || deliveryBy <= now()) return sendError(res, 400, 'INVALID_DEMAND', 'cropId, positive quantity, supported unit, non-negative maxPrice, priceUnit, delivery location, and future deliveryBy are required');
  const demand = await BuyerDemand.create({ demandId: makeId('DEM'), buyerId: user.id, organizationType, cropId: body.cropId.trim(), variety: validString(body.variety, 120) ? body.variety.trim() : undefined, quantity: body.quantity, unit: String(body.unit).toLowerCase(), minimumGrade: validString(body.minimumGrade, 60) ? body.minimumGrade.trim() : undefined, maxPrice: body.maxPrice, priceUnit: body.priceUnit.trim(), deliveryLocation: location, deliveryBy });
  return sendSuccess(res, demand.toObject(), 201);
}

async function listMatches(req, res, lotId) {
  const lot = await ProduceLot.findOne({ lotId }).lean();
  if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot not found');
  const demands = await BuyerDemand.find({ cropId: lot.cropId, status: 'OPEN', deliveryBy: { $gte: now() } }).limit(200).lean();
  const matches = demands.map(demand => {
    const priceCompatible = lot.askingPrice === undefined || (lot.priceUnit === demand.priceUnit && lot.askingPrice <= demand.maxPrice);
    const breakdown = { crop: demand.cropId === lot.cropId ? 45 : 0, variety: !demand.variety || demand.variety === lot.variety ? 15 : 0, grade: !demand.minimumGrade || demand.minimumGrade === lot.verifiedGrade ? 15 : 0, region: demand.deliveryLocation.state === lot.location?.state ? 10 : 0, quantity: demand.unit === lot.unit && demand.quantity <= lot.availableQuantity ? 10 : 0, price: priceCompatible ? 5 : 0 };
    return { demandId: demand.demandId, buyerId: demand.buyerId, organizationType: demand.organizationType, score: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown, warnings: [...(!lot.verifiedGrade ? ['Lot has no inspector-verified grade'] : []), ...(demand.unit !== lot.unit ? ['Demand and lot units differ'] : []), ...(demand.quantity > lot.availableQuantity ? ['Demand quantity exceeds available lot quantity'] : []), ...(!priceCompatible ? ['Asking price exceeds buyer maximum or price units differ'] : [])] };
  }).sort((a, b) => b.score - a.score);
  return sendSuccess(res, { lotId, matches });
}

async function placeBulkBid(req, res, user, lotId) {
  if (!isBuyer(user)) return sendError(res, 403, 'FORBIDDEN', 'Buyer role is required');
  const { pricePerUnit, quantity, unit, message } = req.body || {};
  if (!validPositive(pricePerUnit) || !validPositive(quantity) || !UNITS.has(unit) || (message !== undefined && (typeof message !== 'string' || message.length > 500))) return sendError(res, 400, 'INVALID_BID', 'A positive finite pricePerUnit and quantity, supported unit, and message up to 500 characters are required');
  const lot = await ProduceLot.findOne({ lotId });
  if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot not found');
  if (lot.sellerId === user.id) return sendError(res, 403, 'SELF_BID', 'A seller cannot bid on their own lot');
  if (lot.status === 'CLOSED' || lot.status === 'CANCELLED' || (lot.marketClosesAt && lot.marketClosesAt <= now())) return sendError(res, 409, 'LOT_CLOSED', 'The lot is closed for bids');
  if (lot.unit !== unit) return sendError(res, 400, 'UNIT_MISMATCH', 'Bid unit must match the lot unit');
  const totalAmount = Math.round(pricePerUnit * quantity * 100) / 100;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return sendError(res, 400, 'INVALID_BID_TOTAL', 'Bid total must be a finite positive amount');
  const reserved = await ProduceLot.findOneAndUpdate({ _id: lot._id, status: { $in: ['OPEN','PARTIALLY_FILLED'] }, availableQuantity: { $gte: quantity }, ...(lot.marketClosesAt ? { marketClosesAt: { $gt: now() } } : {}) }, { $inc: { availableQuantity: -quantity } }, { new: true });
  if (!reserved) return sendError(res, 409, 'QUANTITY_UNAVAILABLE', 'Requested quantity is no longer available');
  await ProduceLot.updateOne({ _id: lot._id, availableQuantity: 0 }, { $set: { status: 'CLOSED' } });
  await ProduceLot.updateOne({ _id: lot._id, availableQuantity: { $gt: 0 }, status: 'OPEN' }, { $set: { status: 'PARTIALLY_FILLED' } });
  try {
    const bid = await BulkBid.create({ bidId: makeId('BID'), listingId: lotId, lotId, buyerId: user.id, sellerId: lot.sellerId, pricePerUnit, quantity, unit: String(unit).toLowerCase(), totalAmount, message, closingAt: lot.marketClosesAt || new Date(Date.now() + 86400000) });
    await ProduceLot.updateOne({ _id: lot._id }, { $push: { auditTrail: { event: 'BID_PLACED', actorId: user.id, at: now(), details: { bidId: bid.bidId, quantity, unit: String(unit).toLowerCase() } } } });
    return sendSuccess(res, bid.toObject(), 201);
  } catch (error) {
    const restored = await ProduceLot.findOneAndUpdate({ _id: lot._id }, { $inc: { availableQuantity: quantity } }, { new: true });
    if (restored) {
      await ProduceLot.updateOne({ _id: lot._id, availableQuantity: restored.quantity }, { $set: { status: 'OPEN' } });
      await ProduceLot.updateOne({ _id: lot._id, availableQuantity: { $gt: 0, $lt: restored.quantity } }, { $set: { status: 'PARTIALLY_FILLED' } });
    }
    throw error;
  }
}

async function listBids(req, res, user, lotId) {
  if (!isBuyer(user) && !isSeller(user)) return sendError(res, 403, 'FORBIDDEN', 'Buyer or seller role is required');
  const query = lotId ? { lotId } : { $or: [{ buyerId: user.id }, { sellerId: user.id }] };
  if (lotId) {
    const lot = await ProduceLot.findOne({ lotId }).select('sellerId').lean();
    if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot not found');
    if (lot.sellerId !== user.id) return sendError(res, 403, 'NOT_OWNER', 'Only the lot owner can view its bids');
  }
  const items = await BulkBid.find(query).sort({ createdAt: -1 }).limit(100).lean();
  const counterpartIds = [...new Set(items.filter(item => item.status === 'ACCEPTED').map(item => item.buyerId === user.id ? item.sellerId : item.buyerId))];
  const contacts = counterpartIds.length ? await User.find({ _id: { $in: counterpartIds } }).select('name email mobile organizationType marketContactConsent').lean() : [];
  const contactById = new Map(contacts.map(contact => [String(contact._id), contact.marketContactConsent ? { name: contact.name, email: contact.email, mobile: contact.mobile || null, organizationType: contact.organizationType || null } : null]));
  return sendSuccess(res, { items: items.map(item => ({ ...item, counterparty: item.status === 'ACCEPTED' ? contactById.get(user.id === item.buyerId ? item.sellerId : item.buyerId) || null : null })) });
}

async function bidMessages(req, res, user, bidId) {
  const bid = await BulkBid.findOne({ bidId });
  if (!bid) return sendError(res, 404, 'BID_NOT_FOUND', 'Bid not found');
  if (![bid.buyerId, bid.sellerId].includes(user.id)) return sendError(res, 403, 'BID_PARTICIPANT_REQUIRED', 'Only the buyer and seller on this bid can access its messages');
  if (req.method === 'GET') return sendSuccess(res, { bidId, messages: bid.messages || [] });
  const body = req.body?.message;
  if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  if (!validString(body, 500)) return sendError(res, 400, 'INVALID_MESSAGE', 'A message from 1 to 500 characters is required');
  bid.messages.push({ senderId: user.id, body: body.trim(), createdAt: now() });
  await bid.save();
  return sendSuccess(res, { bidId, messages: bid.messages }, 201);
}

async function updateMarketContactConsent(req, res, user) {
  if (typeof req.body?.marketContactConsent !== 'boolean') return sendError(res, 400, 'INVALID_CONTACT_CONSENT', 'marketContactConsent must be true or false');
  const account = await User.findByIdAndUpdate(user.id, { $set: { marketContactConsent: req.body.marketContactConsent } }, { new: true }).select('_id marketContactConsent');
  if (!account) return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  return sendSuccess(res, { marketContactConsent: account.marketContactConsent });
}

async function resolveBulkBid(req, res, user, lotId, bidId) {
  const lot = await ProduceLot.findOne({ lotId });
  if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot not found');
  if (lot.sellerId !== user.id || !isSeller(user)) return sendError(res, 403, 'NOT_OWNER', 'Only the lot owner can resolve its bids');
  const { status } = req.body || {};
  if (!['ACCEPTED','REJECTED'].includes(status)) return sendError(res, 400, 'INVALID_BID_STATUS', 'status must be ACCEPTED or REJECTED');
  const bid = await BulkBid.findOne({ bidId, lotId, status: 'PENDING' });
  if (!bid) return sendError(res, 404, 'PENDING_BID_NOT_FOUND', 'Pending bid not found');
  let fulfilledQuantity = 0;
  if (status === 'ACCEPTED') {
    fulfilledQuantity = req.body?.fulfilledQuantity === undefined ? bid.quantity : req.body.fulfilledQuantity;
    if (!validPositive(fulfilledQuantity) || fulfilledQuantity > bid.quantity) return sendError(res, 400, 'INVALID_FULFILMENT', 'fulfilledQuantity must be positive and no greater than the bid quantity');
  }
  const fulfilledTotal = Math.round(bid.pricePerUnit * fulfilledQuantity * 100) / 100;
  if (status === 'ACCEPTED' && (!Number.isFinite(fulfilledTotal) || fulfilledTotal <= 0)) return sendError(res, 400, 'INVALID_FULFILMENT_TOTAL', 'Fulfilled bid total must be a finite positive amount');
  const resolved = await BulkBid.findOneAndUpdate({ _id: bid._id, status: 'PENDING' }, { $set: { status, fulfilledQuantity, fulfilledTotal } }, { new: true });
  if (!resolved) return sendError(res, 409, 'BID_ALREADY_RESOLVED', 'This bid was already resolved');
  const releasedQuantity = bid.quantity - fulfilledQuantity;
  let updatedLot = lot;
  if (releasedQuantity > 0) {
    updatedLot = await ProduceLot.findOneAndUpdate({ _id: lot._id }, { $inc: { availableQuantity: releasedQuantity } }, { new: true });
    const newStatus = updatedLot.availableQuantity >= updatedLot.quantity ? 'OPEN' : 'PARTIALLY_FILLED';
    await ProduceLot.updateOne({ _id: lot._id, availableQuantity: updatedLot.availableQuantity }, { $set: { status: newStatus } });
  }
  await ProduceLot.updateOne({ _id: lot._id }, { $push: { auditTrail: { event: status === 'ACCEPTED' ? 'BID_ACCEPTED' : 'BID_REJECTED', actorId: user.id, at: now(), details: { bidId, fulfilledQuantity, releasedQuantity } } } });
  return sendSuccess(res, { bid: resolved.toObject(), lotId, availableQuantity: updatedLot.availableQuantity });
}

async function createAssessment(req, res, user) {
  if (!isSeller(user)) return sendError(res, 403, 'FORBIDDEN', 'Seller role is required');
  const { lotId, cropId, imageRefs } = req.body || {};
  if (!validString(lotId, 100) || !validString(cropId, 80) || !Array.isArray(imageRefs) || imageRefs.length < 1 || imageRefs.length > 20 || !imageRefs.every(isStorageReference)) return sendError(res, 400, 'INVALID_ASSESSMENT', 'lotId, cropId, and one to twenty approved image storage references are required');
  const lot = await ProduceLot.findOne({ lotId, sellerId: user.id });
  if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot was not found for this seller');
  if (lot.cropId !== cropId) return sendError(res, 400, 'CROP_MISMATCH', 'Assessment cropId must match the lot');
  const assessment = await MarketIntelligence.create({ kind: 'QUALITY_ASSESSMENT', recordId: makeId('QAS'), lotId, cropId, imageRefs, evaluatorId: user.id, modelVersion: null, status: 'PENDING_INFERENCE', evidence: { imageRefs }, result: { status: 'INSUFFICIENT_DATA', grade: null, confidence: null }, sourceFreshness: { status: 'CURRENT', observedAt: now() }, uncertainty: { status: 'UNAVAILABLE' } });
  lot.qualityAssessmentId = assessment.recordId;
  await lot.save();
  return sendSuccess(res, assessment.toObject(), 202);
}

async function readAssessment(res, id) {
  const assessment = await MarketIntelligence.findOne({ kind: 'QUALITY_ASSESSMENT', recordId: id }).lean();
  if (!assessment) return sendError(res, 404, 'ASSESSMENT_NOT_FOUND', 'Quality assessment not found');
  return sendSuccess(res, { ...assessment, inspectorVerification: assessment.inspectorVerification || null });
}

async function verifyAssessment(req, res, user, id) {
  if (user.role !== 'QUALITY_INSPECTOR' && user.role !== 'INSPECTOR') return sendError(res, 403, 'INSPECTOR_REQUIRED', 'Inspector role is required to verify a grade');
  const { verifiedGrade, notes, decision = 'CORRECTED', photosReviewed } = req.body || {};
  if (photosReviewed !== true) return sendError(res, 400, 'REVIEW_CONFIRMATION_REQUIRED', 'Confirm that every lot photo was manually inspected');
  if (!['A+', 'A', 'B', 'C', 'REJECT'].includes(verifiedGrade) || !['APPROVED', 'CORRECTED', 'REJECTED'].includes(decision) || !validString(notes, 1000)) return sendError(res, 400, 'INVALID_VERIFICATION', 'Choose a grade and decision and provide manual inspection notes');
  if ((decision === 'REJECTED') !== (verifiedGrade === 'REJECT')) return sendError(res, 400, 'INVALID_VERIFICATION', 'Reject decision requires REJECT grade');
  const assessment = await MarketIntelligence.findOne({ kind: 'QUALITY_ASSESSMENT', recordId: id }).lean();
  if (!assessment?.lotId) return sendError(res, 404, 'ASSESSMENT_NOT_FOUND', 'Published lot assessment not found');
  const lot = await ProduceLot.findOne({ lotId: assessment.lotId });
  if (decision === 'APPROVED') {
    const siblings = await MarketIntelligence.find({ kind: 'QUALITY_ASSESSMENT', lotId: assessment.lotId }).lean();
    if (!siblings.every(item => item.result?.grade === verifiedGrade)) return sendError(res, 400, 'GRADE_MISMATCH', 'Use independent / corrected grade when the model grade is unavailable or differs');
  }
  if (!lot) return sendError(res, 404, 'LOT_NOT_FOUND', 'Lot not found');
  const verification = { verifiedGrade, decision, inspectorId: user.id, verifiedAt: now(), notes: notes.trim(), method: 'MANUAL_PHOTO_REVIEW' };
  const session = await ProduceLot.startSession();
  try {
    await session.withTransaction(async () => {
  const lock = await ProduceLot.updateOne({ lotId: lot.lotId, qualityVerifiedAt: { $exists: false } }, { $set: { verifiedGrade, qualityVerifierId: user.id, qualityVerifiedAt: verification.verifiedAt, qualityReview: verification, ...(decision === 'REJECTED' ? { status: 'CANCELLED' } : {}) }, $push: { auditTrail: { event: 'GRADE_VERIFIED', actorId: user.id, at: verification.verifiedAt, details: verification } } }, { session });
  if (!lock.modifiedCount) throw Object.assign(new Error('Already reviewed'), { code: 'ALREADY_REVIEWED' });
  await MarketIntelligence.updateMany({ kind: 'QUALITY_ASSESSMENT', lotId: lot.lotId }, { $set: { inspectorVerification: verification, status: 'VERIFIED' }, $push: { verificationHistory: verification } }, { session });
    });
  } catch (error) {
    if (error.code === 'ALREADY_REVIEWED') return sendError(res, 409, error.code, 'This lot has already been reviewed; refresh the queue');
    throw error;
  } finally { await session.endSession(); }
  return sendSuccess(res, { ...assessment, inspectorVerification: verification });
}

async function demandForecast(req, res) {
  const { cropId, district, state } = req.query || {};
  const horizonDays = Number(req.query?.horizonDays || 30);
  if (!validString(cropId, 80) || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) return sendError(res, 400, 'INVALID_FORECAST_QUERY', 'cropId and horizonDays from 1 to 365 are required');
  const region = { ...(district ? { district: String(district).slice(0, 100) } : {}), ...(state ? { state: String(state).slice(0, 100) } : {}) };
  const demandCount = await BuyerDemand.countDocuments({ cropId, status: 'OPEN', deliveryBy: { $gte: now(), $lte: new Date(Date.now() + horizonDays * 86400000) }, ...(district ? { 'deliveryLocation.district': region.district } : {}), ...(state ? { 'deliveryLocation.state': region.state } : {}) });
  const record = await MarketIntelligence.create({ kind: 'DEMAND_FORECAST', recordId: makeId('DF'), cropId, region, modelVersion: null, status: 'INSUFFICIENT_DATA', evidence: { openDemandCount: demandCount, horizonDays }, result: { status: 'INSUFFICIENT_DATA', forecastQuantity: null, unit: null }, sourceFreshness: { status: 'CURRENT', observedAt: now() }, uncertainty: { status: 'UNAVAILABLE' } });
  return sendSuccess(res, record.toObject());
}

async function createPriceObservation(req, res, user) {
  if (user.role !== 'MARKET_ADMIN') return sendError(res, 403, 'MARKET_ADMIN_REQUIRED', 'A market administrator role is required to publish price observations');
  const { cropId, district, state, grade, price, priceUnit, source } = req.body || {};
  const observedAt = new Date(req.body?.observedAt);
  if (!validString(cropId, 80) || !validString(district, 100) || !validString(state, 100) || !validPositive(price) || !validString(priceUnit, 40) || !validString(source, 120) || !Number.isFinite(observedAt.getTime())) return sendError(res, 400, 'INVALID_PRICE_OBSERVATION', 'cropId, region, positive price, priceUnit, source, and observedAt are required');
  const record = await MarketIntelligence.create({ kind: 'PRICE_OBSERVATION', recordId: makeId('PO'), cropId: cropId.trim(), region: { district: district.trim(), state: state.trim() }, evaluatorId: user.id, status: 'RECORDED', evidence: { grade: validString(grade, 60) ? grade.trim() : null, price, priceUnit: priceUnit.trim(), source: source.trim(), observedAt }, result: { price, priceUnit: priceUnit.trim() }, sourceFreshness: { status: 'KNOWN', observedAt }, uncertainty: { status: 'UNASSESSED' } });
  return sendSuccess(res, record.toObject(), 201);
}

async function priceRecommendation(req, res) {
  const { cropId, district, state, grade } = req.query || {};
  const quantity = req.query?.quantity === undefined ? undefined : Number(req.query.quantity);
  if (!validString(cropId, 80) || (quantity !== undefined && (!validPositive(quantity) || quantity > 1e9))) return sendError(res, 400, 'INVALID_RECOMMENDATION_QUERY', 'cropId and an optional positive finite quantity are required');
  const region = { ...(district ? { district: String(district).slice(0, 100) } : {}), ...(state ? { state: String(state).slice(0, 100) } : {}) };
  const observationQuery = { kind: 'PRICE_OBSERVATION', cropId, ...(district ? { 'region.district': region.district } : {}), ...(state ? { 'region.state': region.state } : {}), ...(grade ? { 'evidence.grade': String(grade).slice(0, 60) } : {}) };
  const [observations, latestObservation] = await Promise.all([
    MarketIntelligence.countDocuments(observationQuery),
    MarketIntelligence.findOne(observationQuery).sort({ 'evidence.observedAt': -1 }).select('evidence.observedAt').lean()
  ]);
  const latestObservedAt = latestObservation?.evidence?.observedAt || null;
  const freshness = !latestObservedAt ? 'UNKNOWN' : (Date.now() - new Date(latestObservedAt).getTime() <= 86400000 ? 'FRESH' : 'STALE');
  const record = await MarketIntelligence.create({ kind: 'PRICE_RECOMMENDATION', recordId: makeId('PR'), cropId, region, status: 'INSUFFICIENT_DATA', evidence: { observationCount: observations, ...(quantity !== undefined ? { quantity } : {}), ...(grade ? { grade: String(grade).slice(0, 60) } : {}) }, result: { status: 'INSUFFICIENT_DATA', recommendedPrice: null, priceUnit: null }, sourceFreshness: { status: freshness, observedAt: latestObservedAt }, uncertainty: { status: observations ? 'UNASSESSED' : 'UNAVAILABLE' } });
  return sendSuccess(res, record.toObject());
}

async function handleMarketplace(req, res) {
  const route = getMarketPath(req).replace(/\/$/, '') || '/';
  const user = authenticate(req);
  if (route === '/contact-consent' && req.method === 'PATCH') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return updateMarketContactConsent(req, res, user);
  }
  if (route === '/lots' && req.method === 'GET') return listLots(req, res);
  if (route === '/lots' && req.method === 'POST') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return createLot(req, res, user);
  }
  if (route === '/demands' && req.method === 'GET') return listDemands(req, res);
  if (route === '/demands' && req.method === 'POST') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return createDemand(req, res, user);
  }
  const matchRoute = route.match(/^\/lots\/([^/]+)\/matches$/);
  if (matchRoute && req.method === 'GET') return listMatches(req, res, decodeURIComponent(matchRoute[1]));
  const bidRoute = route.match(/^\/lots\/([^/]+)\/bids$/);
  const bidMessagesRoute = route.match(/^\/bids\/([^/]+)\/messages$/);
  if (bidMessagesRoute && ['GET','POST'].includes(req.method)) {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return bidMessages(req, res, user, decodeURIComponent(bidMessagesRoute[1]));
  }
  if (route === '/bids' && req.method === 'GET') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return listBids(req, res, user);
  }
  if (bidRoute && req.method === 'GET') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return listBids(req, res, user, decodeURIComponent(bidRoute[1]));
  }
  if (bidRoute && req.method === 'POST') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return placeBulkBid(req, res, user, decodeURIComponent(bidRoute[1]));
  }
  const resolveBidRoute = route.match(/^\/lots\/([^/]+)\/bids\/([^/]+)$/);
  if (resolveBidRoute && req.method === 'PATCH') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return resolveBulkBid(req, res, user, decodeURIComponent(resolveBidRoute[1]), decodeURIComponent(resolveBidRoute[2]));
  }
  if (route === '/quality-assessments' && req.method === 'POST') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return createAssessment(req, res, user);
  }
  const assessmentRoute = route.match(/^\/quality-assessments\/([^/]+)$/);
  if (assessmentRoute && req.method === 'GET') return readAssessment(res, decodeURIComponent(assessmentRoute[1]));
  const verificationRoute = route.match(/^\/quality-assessments\/([^/]+)\/verification$/);
  if (verificationRoute && req.method === 'PATCH') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return verifyAssessment(req, res, user, decodeURIComponent(verificationRoute[1]));
  }
  if (route === '/demand-forecast' && req.method === 'GET') return demandForecast(req, res);
  if (route === '/price-observations' && req.method === 'POST') {
    if (!user) return sendError(res, 401, 'UNAUTHENTICATED', 'A valid bearer access token is required');
    return createPriceObservation(req, res, user);
  }
  if (route === '/price-recommendation' && req.method === 'GET') return priceRecommendation(req, res);
  if (['/lots','/demands','/bids','/quality-assessments','/demand-forecast','/price-recommendation','/price-observations'].some(path => route === path || route.startsWith(`${path}/`))) return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  return null;
}

// Existing CEDA market-data routes remain available during the incremental migration.
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const url = getMarketPath(req);
    if (/^\/(lots|demands|bids|contact-consent|quality-assessments|demand-forecast|price-recommendation|price-observations)(\/|$)/.test(url)) {
      await dbConnect();
      return await handleMarketplace(req, res);
    }
    if (url.includes('/commodities')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      return res.status(200).json(await fetchCedaApi('/commodities'));
    }
    if (url.includes('/geographies')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      if (!req.query?.commodity_id) return res.status(400).json({ error: 'Missing commodity_id parameter' });
      return res.status(200).json(await fetchCedaApi(`/geographies?commodity_id=${encodeURIComponent(req.query.commodity_id)}`));
    }
    for (const resource of ['markets','prices','quantities']) {
      if (url.includes(`/${resource}`)) {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return res.status(200).json(await fetchCedaApi(`/${resource}`, { method: 'POST', body: req.body }));
      }
    }
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    if (/\/(lots|demands|bids|contact-consent|quality-assessments|forecast|recommendation|price-observations)/.test(getMarketPath(req))) {
      console.error('marketplace error', error);
      return sendError(res, 500, 'MARKETPLACE_ERROR', 'The marketplace request could not be completed');
    }
    return handleCedaError(error, res);
  }
}
