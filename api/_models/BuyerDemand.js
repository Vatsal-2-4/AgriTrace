import mongoose from 'mongoose';

const deliveryLocationSchema = new mongoose.Schema({ district: { type: String, maxlength: 100 }, state: { type: String, maxlength: 100 }, lat: Number, lng: Number }, { _id: false });
const buyerDemandSchema = new mongoose.Schema({
  demandId: { type: String, required: true, unique: true, index: true }, buyerId: { type: String, required: true, index: true },
  organizationType: { type: String, enum: ['retailer','wholesaler','processor','other'], required: true },
  cropId: { type: String, required: true, index: true, maxlength: 80 }, variety: { type: String, maxlength: 120 },
  quantity: { type: Number, required: true, min: 0.000001 }, unit: { type: String, required: true, enum: ['kg','g','tonne','quintal','piece','crate','bag'] },
  minimumGrade: { type: String, maxlength: 60 }, maxPrice: { type: Number, required: true, min: 0 }, priceUnit: { type: String, required: true, maxlength: 40 },
  deliveryLocation: { type: deliveryLocationSchema, required: true }, deliveryBy: { type: Date, required: true },
  status: { type: String, enum: ['OPEN','FULFILLED','CANCELLED','EXPIRED'], default: 'OPEN', index: true }
}, { timestamps: true });
buyerDemandSchema.index({ cropId: 1, status: 1, 'deliveryLocation.state': 1, 'deliveryLocation.district': 1 });
export default mongoose.models.BuyerDemand || mongoose.model('BuyerDemand', buyerDemandSchema);
