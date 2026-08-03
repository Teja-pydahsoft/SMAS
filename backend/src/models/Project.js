import mongoose from 'mongoose';
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LIST,
  PROJECT_STATUSES,
  PROJECT_STATUS_LIST,
} from '../constants/index.js';

const projectSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true },
    requiredDays: { type: Number, required: true, min: 1 },
    projectType: {
      type: String,
      enum: PROJECT_TYPE_LIST,
      required: true,
      default: PROJECT_TYPES.UNIVERSAL,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: PROJECT_STATUS_LIST,
      default: PROJECT_STATUSES.ACTIVE,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },
  },
  { timestamps: true }
);

projectSchema.index({ projectName: 1, status: 1 });
projectSchema.index({ status: 1, createdAt: -1 });
projectSchema.index({ projectType: 1, departmentId: 1 });
projectSchema.index({ projectType: 1, divisionId: 1 });

export default mongoose.model('Project', projectSchema);
