import mongoose from 'mongoose';

const vehicleRegistrationFormSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    schema: { type: mongoose.Schema.Types.Mixed, required: true }, // Dynamic JSON schema for the form
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model('VehicleRegistrationForm', vehicleRegistrationFormSchema);
