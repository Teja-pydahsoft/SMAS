import mongoose from 'mongoose';
import { REGISTRATION_STAGES, REGISTRATION_STATUS, PAY_FREQUENCIES, GENDERS } from '../constants/index.js';

const registrationSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationForm', required: true },
    /** Assigned when role.isShiftBased — used for day-pass working hours & attendance. */
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    workingHours: { type: Number, default: null },
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
    payFrequency: { type: String, enum: PAY_FREQUENCIES, default: null },
    customPayDays: { type: Number, min: 1 },
    payAmount: { type: Number, min: 0, default: null },
    gender: { type: String, enum: GENDERS, default: null },
    // Denormalized fields for high-performance searching and filtering
    displayName: { type: String, default: null },
    displayPhone: { type: String, default: null },
    selections: [{ _id: false, label: String, value: String }],
  },
  { timestamps: true }
);

registrationSchema.index({ roleId: 1, status: 1 });
registrationSchema.index({ status: 1, createdAt: 1 });
registrationSchema.index({ displayName: 'text', displayPhone: 'text', registrationCode: 'text' });
registrationSchema.index({ 'selections.label': 1, 'selections.value': 1 });

import RegistrationForm from './RegistrationForm.js';
import { buildDisplayInfo } from '../utils/displayInfo.js';

registrationSchema.pre('save', async function (next) {
  if (this.isModified('formData') || this.isModified('formId') || this.isNew) {
    if (this.formId) {
      try {
        const form = await mongoose.model('RegistrationForm').findById(this.formId).select('fields');
        if (form && form.fields) {
          const display = buildDisplayInfo(this.formData || {}, form.fields);
          this.displayName = display.displayName || null;
          this.displayPhone = display.displayPhone || null;
          this.selections = display.selections || [];
        }
      } catch (err) {
        console.error('Failed to populate display fields on registration:', err.message);
      }
    }
  }
  next();
});

export default mongoose.model('Registration', registrationSchema);
