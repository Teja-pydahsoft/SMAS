import mongoose from 'mongoose';

const idleSessionSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    lastDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    startTime: { type: Date, required: true },
    clearedAt: { type: Date, required: false },
    status: { type: String, enum: ['Active', 'Cleared'], default: 'Active' },
    idleDurationMinutes: { type: Number, required: false },
    notifiedAlerts: [{ type: String }],
  },
  { timestamps: true }
);

idleSessionSchema.index({ vehicleId: 1, status: 1 });
idleSessionSchema.index({ startTime: -1 });

export default mongoose.model('IdleSession', idleSessionSchema);
