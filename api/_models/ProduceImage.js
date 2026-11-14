import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  imageId: { type: String, unique: true, required: true },
  ownerId: { type: String, required: true, index: true },
  cropId: { type: String, required: true }, lotId: String,
  mime: { type: String, required: true }, bytes: { type: Buffer, required: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 86400000), expires: 0 }
}, { timestamps: true });
export default mongoose.models.ProduceImage || mongoose.model('ProduceImage', schema);
