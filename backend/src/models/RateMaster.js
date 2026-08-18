import mongoose from 'mongoose';

const rateMasterRuleSchema = new mongoose.Schema({
  batchName: { type: String, required: true },
  labourType: { type: String, required: true },
  workCategory: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  hours: { type: Number, required: true, min: 0 },
  remarks: { type: String }
}, { _id: false });

const rateMasterSchema = new mongoose.Schema({
  docNo: { type: String, required: true, unique: true },
  effectiveDate: { type: Date, required: true },
  rules: [rateMasterRuleSchema],
  status: { type: String, enum: ['Draft', 'Applied', 'Cancelled'], default: 'Draft' },
  appliedBy: { type: String },
  appliedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('RateMaster', rateMasterSchema);
