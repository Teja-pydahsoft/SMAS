import mongoose from 'mongoose';

const rateMasterAuditLogSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, index: true },
  rateMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'RateMaster', required: true, index: true },
  rateMasterDocNo: { type: String, required: true },
  oldPayAmount: { type: Number, default: null },
  newPayAmount: { type: Number, required: true },
  oldHours: { type: Number, default: null },
  newHours: { type: Number, required: true },
  effectiveDate: { type: Date, required: true },
  appliedBy: { type: String },
  appliedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('RateMasterAuditLog', rateMasterAuditLogSchema);
