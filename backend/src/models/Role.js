import mongoose from 'mongoose';
import { PAY_FREQUENCIES } from '../constants/index.js';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    isShiftBased: { type: Boolean, default: false },
    payFrequencies: {
      type: [{ type: String, enum: PAY_FREQUENCIES }],
      default: [],
    },
    customPayDaysOptions: {
      type: [{ type: Number, min: 1 }],
      default: [],
    },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('Role', roleSchema);
