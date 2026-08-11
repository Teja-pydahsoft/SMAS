import mongoose from 'mongoose';

const vehicleActivityLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: false },
    gateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gate', required: false },
    cameraId: { type: String, required: false },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: false },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: false },
    ownerModel: { type: String, enum: ['SystemUser', 'Registration'], required: false },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: false },
    capturedPlate: { type: String, required: false, trim: true },
    normalizedCapturedPlate: { type: String, required: false, lowercase: true, trim: true },
    confidence: { type: Number, required: false },
    snapshotUrl: { type: String, required: false },
    decision: { type: String, enum: ['Granted', 'Denied', 'Unknown'], required: true },
    reason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

vehicleActivityLogSchema.index({ timestamp: -1 });
vehicleActivityLogSchema.index({ vehicleId: 1, timestamp: -1 });
vehicleActivityLogSchema.index({ gateId: 1, timestamp: -1 });
vehicleActivityLogSchema.index({ normalizedCapturedPlate: 1, timestamp: -1 });
vehicleActivityLogSchema.index({ 'metadata.action': 1, timestamp: -1 });

export default mongoose.model('VehicleActivityLog', vehicleActivityLogSchema);
