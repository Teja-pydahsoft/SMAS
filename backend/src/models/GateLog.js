import mongoose from 'mongoose';
import { GATE_EVENT_TYPES, SCAN_TYPES } from '../constants/index.js';

const gateLogSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    gateRefId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gate' },
    scanType: {
      type: String,
      enum: Object.values(SCAN_TYPES),
      default: SCAN_TYPES.GATE,
    },
    eventType: { type: String, enum: Object.values(GATE_EVENT_TYPES), required: true },
    matchScore: { type: Number, required: true },
    matched: { type: Boolean, required: true },
    accessGranted: { type: Boolean, default: true },
    photoPath: { type: String },
    gateId: { type: String, default: 'main' },
    /** Optional note entered on department check-in only. */
    remark: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

gateLogSchema.index({ registrationId: 1, createdAt: -1 });
gateLogSchema.index({ eventType: 1, createdAt: -1 });
gateLogSchema.index({ divisionId: 1, createdAt: -1 });
gateLogSchema.index({ departmentId: 1, createdAt: -1 });
gateLogSchema.index({ gateRefId: 1, createdAt: -1 });
gateLogSchema.index({ scanType: 1, divisionId: 1, createdAt: -1 });
gateLogSchema.index({ registrationId: 1, scanType: 1, divisionId: 1, createdAt: -1 });

export default mongoose.model('GateLog', gateLogSchema);
