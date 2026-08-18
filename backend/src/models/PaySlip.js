import mongoose from 'mongoose';

const paySlipSchema = new mongoose.Schema({
  registrationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Registration', 
    required: true 
  },
  fromDate: { type: String, required: true }, // Format YYYY-MM-DD
  toDate: { type: String, required: true },   // Format YYYY-MM-DD
  totalHours: { type: Number, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['Locked', 'Unlocked'], 
    default: 'Locked' 
  },
  generatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SystemUser' 
  },
}, { timestamps: true });

// Prevent generating multiple overlapping pay slips for the same period
paySlipSchema.index({ registrationId: 1, fromDate: 1, toDate: 1 }, { unique: true });

export default mongoose.model('PaySlip', paySlipSchema);
