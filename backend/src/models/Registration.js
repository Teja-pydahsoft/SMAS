import mongoose from 'mongoose';
import { REGISTRATION_STAGES, REGISTRATION_STATUS } from '../constants/index.js';

const registrationSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationForm', required: true },
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
    currentStage: {
      type: String,
      enum: Object.values(REGISTRATION_STAGES),
      default: REGISTRATION_STAGES.FORM,
    },
    status: {
      type: String,
      enum: Object.values(REGISTRATION_STATUS),
      default: REGISTRATION_STATUS.DRAFT,
    },
    photoPath: { type: String },
    faceEmbedding: { type: [Number], default: [] },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
    rejectionReason: { type: String },
    registrationCode: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

registrationSchema.index({ roleId: 1, status: 1 });

export default mongoose.model('Registration', registrationSchema);
