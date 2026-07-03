import mongoose from 'mongoose';
import { PASS_TYPES } from '../constants/index.js';

const passSchema = new mongoose.Schema(
  {
    passCode: { type: String, required: true, unique: true },
    passType: { type: String, enum: Object.values(PASS_TYPES), required: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    gateLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'GateLog' },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' },
    validDate: { type: String },
    validFrom: { type: Date },
    validUntil: { type: Date },
    holderName: { type: String },
    holderPhotoUrl: { type: String },
    roleName: { type: String },
    registrationCode: { type: String },
    details: [{ label: String, value: String }],
    qrPayload: { type: mongoose.Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

passSchema.index({ registrationId: 1, passType: 1 });
passSchema.index({ gateLogId: 1 });
passSchema.index({ validDate: 1, registrationId: 1 });
passSchema.index({ validDate: 1, registrationId: 1, divisionId: 1, passType: 1 });

export default mongoose.model('Pass', passSchema);
