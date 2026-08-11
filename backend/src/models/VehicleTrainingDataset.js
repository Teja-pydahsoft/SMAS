import mongoose from 'mongoose';

const vehicleTrainingDatasetSchema = new mongoose.Schema(
  {
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleType', required: true },
    plateNumber: { type: String, required: true, trim: true },
    images: {
      front: { type: String, required: true },
      rear: { type: String, required: false },
      left: { type: String, required: false },
      right: { type: String, required: false },
      frontPlate: { type: String, required: true },
      rearPlate: { type: String, required: false }
    },
    approvedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

vehicleTrainingDatasetSchema.index({ typeId: 1 });
vehicleTrainingDatasetSchema.index({ plateNumber: 1 });

export default mongoose.model('VehicleTrainingDataset', vehicleTrainingDatasetSchema);
