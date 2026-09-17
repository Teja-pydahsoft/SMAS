import mongoose from 'mongoose';

const divisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    /**
     * When false, department check-ins are allowed even if the labour has no
     * division gate entry for today.  The system will auto-create a synthetic
     * gate-entry GateLog using the same timestamp and photo as the department
     * scan so the audit trail stays consistent.
     */
    gateEntryRequired: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('Division', divisionSchema);
