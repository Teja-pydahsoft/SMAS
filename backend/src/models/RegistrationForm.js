import mongoose from 'mongoose';
import { FIELD_TYPES } from '../constants/index.js';

const formFieldSchema = new mongoose.Schema(
  {
    fieldId: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    options: [{ type: String }],
    order: { type: Number, default: 0 },
    validation: {
      minLength: Number,
      maxLength: Number,
      pattern: String,
    },
  },
  { _id: false }
);

const registrationFormSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    fields: [formFieldSchema],
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model('RegistrationForm', registrationFormSchema);
