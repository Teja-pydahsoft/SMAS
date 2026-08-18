import mongoose from 'mongoose';

const attendanceOverrideAuditLogSchema = new mongoose.Schema(
  {
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
      index: true,
    },
    date: { type: String, required: true, index: true },
    action: {
      type: String,
      enum: ['set', 'clear'],
      required: true,
    },
    previousStatus: { type: String, default: '' },
    previousNote: { type: String, default: '' },
    nextStatus: { type: String, default: '' },
    nextNote: { type: String, default: '' },
    changedByName: { type: String, default: '' },
    changedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },
  },
  { timestamps: true }
);

attendanceOverrideAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AttendanceOverrideAuditLog', attendanceOverrideAuditLogSchema);
