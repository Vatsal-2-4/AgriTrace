import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  bidId: { type: String, required: true, unique: true }, listingId: { type: String, required: true, index: true },
  lotId: { type: String, required: true, index: true }, buyerId: { type: String, required: true, index: true },
  sellerId: { type: String, required: true }, pricePerUnit: { type: Number, required: true, min: 0 }, quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true }, totalAmount: { type: Number, required: true, min: 0 }, message: { type: String, maxlength: 500 },
  closingAt: { type: Date, required: true }, fulfilledQuantity: { type: Number, min: 0, default: 0 }, fulfilledTotal: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED'], default: 'PENDING' },
  messages: { type: [{ senderId: { type: String, required: true }, body: { type: String, required: true, maxlength: 500 }, createdAt: { type: Date, default: Date.now } }], default: [] }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ listingId: 1, status: 1, createdAt: -1 });
export default mongoose.models.BulkBid || mongoose.model('BulkBid', schema);
