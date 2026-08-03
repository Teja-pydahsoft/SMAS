import mongoose from 'mongoose';
import {
  PROJECT_ASSIGNMENT_STATUSES,
  PROJECT_ASSIGNMENT_STATUS_LIST,
} from '../constants/index.js';

const projectAssignmentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    labourId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },
    assignedAt: { type: Date, default: Date.now },
    removedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: PROJECT_ASSIGNMENT_STATUS_LIST,
      default: PROJECT_ASSIGNMENT_STATUSES.ACTIVE,
    },
  },
  { timestamps: true }
);

projectAssignmentSchema.index({ projectId: 1, status: 1 });
projectAssignmentSchema.index({ labourId: 1, status: 1 });
projectAssignmentSchema.index(
  { projectId: 1, labourId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: PROJECT_ASSIGNMENT_STATUSES.ACTIVE },
  }
);

export default mongoose.model('ProjectAssignment', projectAssignmentSchema);
