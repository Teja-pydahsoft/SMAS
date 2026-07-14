import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    startTime: { type: String, default: '' }, // HH:mm
    endTime: { type: String, default: '' }, // HH:mm
    halfDayMinHours: { type: Number, default: null, min: 0 },
    fullDayMinHours: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('Shift', shiftSchema);
