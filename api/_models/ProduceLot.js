import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 },
  district: { type: String, maxlength: 100 }, state: { type: String, maxlength: 100 }
}, { _id: false });
const auditEntrySchema = new mongoose.Schema({ event: { type: String, required: true }, actorId: { type: String, required: true }, at: { type: Date, required: true }, details: { type: mongoose.Schema.Types.Mixed, default: {} } }, { _id: false });

const produceLotSchema = new mongoose.Schema({
  lotId: { type: String, required: true, unique: true, index: true },
  sellerId: { type: String, required: true, index: true }, sellerType: { type: String, required: true, maxlength: 40 },
  cropId: { type: String, required: true, index: true, maxlength: 80 }, cropName: { type: String, required: true, maxlength: 120 },
  variety: { type: String, maxlength: 120 }, quantity: { type: Number, required: true, min: 0.000001 },
  availableQuantity: { type: Number, required: true, min: 0 }, unit: { type: String, required: true, enum: ['kg','g','tonne','quintal','piece','crate','bag'] },
  harvestedAt: Date, origin: { type: String, maxlength: 200 }, location: { type: locationSchema, default: undefined },
  imageRefs: { type: [String], default: [], validate: value => value.length <= 20 },
  askingPrice: { type: Number, min: 0 }, priceUnit: { type: String, maxlength: 40 }, qualityAssessmentId: String,
  verifiedGrade: { type: String, maxlength: 60 }, qualityVerifierId: String, qualityVerifiedAt: Date,
  marketClosesAt: Date,
  auditTrail: { type: [auditEntrySchema], default: [] },
  status: { type: String, enum: ['OPEN','PARTIALLY_FILLED','CLOSED','CANCELLED'], default: 'OPEN', index: true }
}, { timestamps: true, optimisticConcurrency: true });

produceLotSchema.index({ cropId: 1, status: 1, 'location.state': 1, 'location.district': 1, createdAt: -1 });
produceLotSchema.index({ cropId: 1, verifiedGrade: 1, status: 1 });
// WoolBatch remains the source of legacy wool records; this adapter exposes their current crop-neutral read shape.
produceLotSchema.statics.fromLegacyWool = batch => ({
  id: batch.batchId, sellerId: batch.farmerId, sellerType: 'FARMER', cropId: 'WOOL', cropName: batch.woolType,
  variety: batch.woolType, quantity: batch.originalQuantity ?? batch.quantity,
  availableQuantity: batch.availableQuantity ?? batch.quantity, unit: 'kg', harvestedAt: batch.shearingDate,
  origin: batch.origin, imageRefs: batch.images || [], verifiedGrade: batch.certificateStatus === 'VALID' ? batch.qualityGrade : undefined,
  status: batch.status === 'Sold' ? 'CLOSED' : 'OPEN', createdAt: batch.createdAt, updatedAt: batch.updatedAt
});

export default mongoose.models.ProduceLot || mongoose.model('ProduceLot', produceLotSchema);
