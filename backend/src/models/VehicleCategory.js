import mongoose from 'mongoose';

const vehicleCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

vehicleCategorySchema.index({ name: 1 }, { unique: true });

export default mongoose.model('VehicleCategory', vehicleCategorySchema);
