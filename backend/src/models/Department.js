import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    divisionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Division' }],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one division is required',
      },
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

departmentSchema.index({ slug: 1 }, { unique: true });
departmentSchema.index({ divisionIds: 1, isActive: 1 });

export default mongoose.model('Department', departmentSchema);
