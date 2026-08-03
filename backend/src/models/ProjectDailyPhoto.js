import mongoose from 'mongoose';

const detectionSchema = new mongoose.Schema(
  {
    labourId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', default: null },
    matched: { type: Boolean, default: false },
    assignedToProject: { type: Boolean, default: false },
    matchScore: { type: Number, default: null },
    labourName: { type: String, default: '' },
    registrationCode: { type: String, default: null },
    faceBox: { type: mongoose.Schema.Types.Mixed, default: null },
    facePhotoPath: { type: String, default: '' },
    inActivity: { type: Boolean, default: false },
    activitySightingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ActivitySighting',
      default: null,
    },
  },
  { _id: false }
);

/**
 * One full-frame project site photo for a specific IST calendar day.
 * Detections track faces found in the photo, scoped against project assignments.
 */
const projectDailyPhotoSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    /** IST calendar date YYYY-MM-DD within the project window. */
    photoDate: { type: String, required: true, index: true },
    /** 1-based day index from project start (createdAt IST). */
    dayIndex: { type: Number, required: true, min: 1 },
    photoPath: { type: String, required: true },
    originalName: { type: String, default: '' },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },
    facesDetected: { type: Number, default: 0 },
    matchedAssignedCount: { type: Number, default: 0 },
    detections: { type: [detectionSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

projectDailyPhotoSchema.index({ projectId: 1, photoDate: 1, createdAt: -1 });
projectDailyPhotoSchema.index({ projectId: 1, dayIndex: 1 });

export default mongoose.model('ProjectDailyPhoto', projectDailyPhotoSchema);
