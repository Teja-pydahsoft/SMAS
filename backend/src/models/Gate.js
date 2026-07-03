import mongoose from 'mongoose';
import { GATE_TYPES } from '../constants/index.js';

const gateSchema = new mongoose.Schema(
  {
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    gateType: {
      type: String,
      enum: Object.values(GATE_TYPES),
      required: true,
    },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

gateSchema.index({ divisionId: 1, slug: 1 }, { unique: true });
gateSchema.index({ divisionId: 1, isActive: 1 });

export default mongoose.model('Gate', gateSchema);
