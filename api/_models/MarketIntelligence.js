import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  kind: { type: String, required: true, enum: ['QUALITY_ASSESSMENT','PRICE_OBSERVATION','DEMAND_FORECAST','PRICE_RECOMMENDATION'], index: true },
  recordId: { type: String, required: true, unique: true }, lotId: { type: String, index: true }, cropId: { type: String, index: true },
  region: { district: String, state: String }, modelVersion: { type: String, default: null }, evaluatorId: String,
  imageRefs: [{ type: String }], evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  result: { type: mongoose.Schema.Types.Mixed, default: {} }, inspectorVerification: { type: mongoose.Schema.Types.Mixed, default: null },
  verificationHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceFreshness: { type: mongoose.Schema.Types.Mixed, default: { status: 'UNKNOWN', observedAt: null } },
  uncertainty: { type: mongoose.Schema.Types.Mixed, default: { status: 'UNKNOWN' } },
  status: { type: String, required: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ kind: 1, cropId: 1, 'region.state': 1, 'region.district': 1, createdAt: -1 });
export default mongoose.models.MarketIntelligence || mongoose.model('MarketIntelligence', schema);
