import mongoose from 'mongoose';

/**
 * A manual attendance-status override applied by an admin for a single
 * registration on a single work-date (IST calendar day, YYYY-MM-DD).
 *
 * The computed timings/hours from gate logs are always preserved — only the
 * final status/code/payFactor are replaced so payroll reflects the manual call.
 * `status: 'AUTO'` is never stored; clearing an override deletes the row.
 */
const attendanceOverrideSchema = new mongoose.Schema(
  {
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
      index: true,
    },
    /** IST work-date bucket YYYY-MM-DD this override applies to. */
    date: { type: String, required: true },
    /** One of P | HD | A (canonical override codes). */
    status: { type: String, required: true },
    note: { type: String, default: '' },
    updatedByName: { type: String, default: '' },
    updatedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },
  },
  { timestamps: true }
);

attendanceOverrideSchema.index({ registrationId: 1, date: 1 }, { unique: true });

export default mongoose.model('AttendanceOverride', attendanceOverrideSchema);
