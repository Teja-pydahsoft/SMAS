import mongoose from 'mongoose';

const vehicleRegistrationSchema = new mongoose.Schema(
  {
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleRegistrationForm', required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemUser', required: false },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    plateNumber: { type: String, required: true, trim: true },
    normalizedPlateNumber: { type: String, required: true, lowercase: true, trim: true },
    photos: {
      front: { type: String, required: true },
      rear: { type: String, required: false },
      left: { type: String, required: false },
      right: { type: String, required: false },
      frontPlate: { type: String, required: true },
      rearPlate: { type: String, required: false }
    },
    aiEnrollmentData: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemUser', required: false },
    reviewedAt: { type: Date, required: false },
    notes: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

vehicleRegistrationSchema.index({ normalizedPlateNumber: 1 });
vehicleRegistrationSchema.index({ status: 1 });

export default mongoose.model('VehicleRegistration', vehicleRegistrationSchema);
