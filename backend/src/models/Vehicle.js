import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, trim: true },
    normalizedPlateNumber: { type: String, required: true, lowercase: true, trim: true },
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleType', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleCategory', required: false },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: false }, // Optional default driver
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: false }, // Can reference SystemUser or Registration
    ownerModel: { type: String, enum: ['SystemUser', 'Registration'], required: false },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: false },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: false },
    status: { type: String, enum: ['Active', 'Inactive', 'Expired', 'Blacklisted'], default: 'Active' },
    allowedGates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Gate' }],
    expiryDate: { type: Date, required: false },
    aiMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    predictedVehicleType: { type: String, default: null },
    predictedVehicleConfidence: { type: Number, default: null },
    history: [{
      action: String,
      timestamp: { type: Date, default: Date.now },
      details: mongoose.Schema.Types.Mixed
    }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

vehicleSchema.index({ normalizedPlateNumber: 1 }, { unique: true });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ typeId: 1 });
vehicleSchema.index({ categoryId: 1 });

export default mongoose.model('Vehicle', vehicleSchema);
