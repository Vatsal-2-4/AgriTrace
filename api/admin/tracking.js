import dbConnect from '../_utils/db.js';
import { authenticate, sendError, sendSuccess } from '../_utils/market.js';
import { handleCors } from '../_utils/http.js';
import User from '../_models/User.js';
import WoolBatch from '../_models/WoolBatch.js';
import InspectionRequest from '../_models/InspectionRequest.js';
import QualityCertificate from '../_models/QualityCertificate.js';
import TransportRequest from '../_models/TransportRequest.js';
import Shipment from '../_models/Shipment.js';
import Order from '../_models/Order.js';
import WarehouseRelease from '../_models/WarehouseRelease.js';

const id = value => String(value || '');
const stageFor = batch => {
  const text = `${batch.currentStage || ''} ${batch.currentStatus || ''} ${batch.status || ''}`.toLowerCase();
  if (/buyer|deliver|sold|complete|received/.test(text)) return 4;
  if (/logistic|transit|ship|transport|pickup/.test(text)) return 3;
  if (/quality|inspect|grade|certif/.test(text)) return 2;
  if (/stor|warehouse|check.?in/.test(text)) return 1;
  return 0;
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  const actor = authenticate(req);
  if (!actor) return sendError(res, 401, 'AUTH_REQUIRED', 'Sign in with an administrator account.');
  if (actor.role !== 'ADMIN') return sendError(res, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  try {
    await dbConnect();
    const [batches, users, inspections, certificates, transportRequests, shipments, orders, releases] = await Promise.all([
      WoolBatch.find({}).sort({ updatedAt: -1 }).limit(1000).lean(),
      User.find({}).select('name email mobile role organizationType state').lean(),
      InspectionRequest.find({}).sort({ createdAt: -1 }).lean(),
      QualityCertificate.find({}).sort({ issuedAt: -1 }).lean(),
      TransportRequest.find({}).sort({ updatedAt: -1 }).lean(),
      Shipment.find({}).sort({ updatedAt: -1 }).lean(),
      Order.find({}).sort({ createdAt: -1 }).lean(),
      WarehouseRelease.find({}).sort({ updatedAt: -1 }).lean()
    ]);
    const userById = new Map(users.map(person => [id(person._id), person]));
    const person = (key, fallback = '') => {
      const match = userById.get(id(key));
      return match ? { name: match.name, role: match.role, email: match.email, id: id(match._id) } : (fallback ? { name: fallback, role: '', email: '', id: id(key) } : null);
    };
    const result = batches.map(batch => {
      const batchId = id(batch.batchId);
      const inspection = inspections.find(item => id(item.batchId) === batchId);
      const certificate = certificates.find(item => id(item.batchId) === batchId);
      const release = releases.find(item => id(item.batchId) === batchId);
      const shipment = shipments.find(item => id(item.batchId) === batchId);
      const transport = transportRequests.find(item => id(item.batchId) === batchId || (shipment && id(item.requestId) === id(shipment.transportRequestId)));
      const order = orders.find(item => id(item.batchId) === batchId);
      const storage = batch.storageLocation || {};
      const storageId = storage.warehouseId || storage.id || release?.warehouseId;
      const buyer = person(order?.buyerId || batch.buyerId, order?.buyerName || batch.buyerName);
      const currentStage = stageFor(batch);
      const people = [
        person(batch.farmerId, batch.farmerName),
        person(storageId, release?.warehouseName || storage.name || storage.warehouseName),
        person(certificate?.inspectorId || inspection?.inspectorId, certificate?.inspectorName),
        person(shipment?.transporterId || transport?.requestedBy, transport?.transporterName),
        buyer
      ];
      return {
        batchId, crop: batch.woolType || 'Produce', quantity: batch.quantity || 0,
        availableQuantity: batch.availableQuantity, origin: batch.origin || '',
        currentLocation: batch.currentLocation || batch.origin || 'Location not recorded',
        currentStatus: batch.currentStatus || batch.status || 'Registered', currentStage,
        qualityGrade: certificate?.grade || batch.qualityGrade || 'Pending inspection',
        qualityStatus: certificate?.status || batch.qualityStatus || 'Pending inspection',
        certificateId: certificate?.certificateId || batch.certificateId || '',
        storageStatus: batch.storageStatus || release?.status || 'Not checked in',
        shipmentStatus: shipment?.status || transport?.status || 'Not assigned',
        orderId: order?.orderId || '', createdAt: batch.createdAt, updatedAt: batch.updatedAt,
        people,
        timeline: [
          { label: 'Seller', status: 'registered', owner: people[0], location: batch.origin || '', updatedAt: batch.createdAt },
          { label: 'Storage', status: batch.storageStatus || release?.status || 'pending', owner: people[1], location: release?.destination || storage.name || '', updatedAt: release?.updatedAt || batch.storageSince },
          { label: 'Quality', status: certificate ? 'certified' : inspection?.status || 'pending', owner: people[2], location: certificate?.origin || inspection?.location || '', updatedAt: certificate?.issuedAt || inspection?.createdAt },
          { label: 'Logistics', status: shipment?.status || transport?.status || 'pending', owner: people[3], location: shipment?.currentLocation || transport?.destination || '', updatedAt: shipment?.updatedAt || transport?.updatedAt },
          { label: 'Buyer', status: order ? (shipment?.status === 'DELIVERED' || shipment?.status === 'COMPLETED' ? 'delivered' : order.paymentStatus || 'order placed') : 'pending', owner: people[4], location: order?.destination || '', updatedAt: order?.createdAt }
        ]
      };
    });
    return sendSuccess(res, { batches: result, count: result.length });
  } catch (error) {
    console.error('admin tracking query failed', error);
    return sendError(res, 500, 'ADMIN_TRACKING_UNAVAILABLE', 'Could not load supply-chain tracking records.');
  }
}
