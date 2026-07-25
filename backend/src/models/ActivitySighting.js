import mongoose from 'mongoose';

/**
 * One row per recognised (or unmatched) face from the Activity monitor.
 * Used so Today's Activity + person timelines show camera sightings even
 * when the person never completed a gate entry.
 */
const activitySightingSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', default: null },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    matched: { type: Boolean, required: true, default: false },
    matchScore: { type: Number, default: null },
    inActivity: { type: Boolean, default: false },
    photoPath: { type: String, default: '' },
    faceBox: { type: mongoose.Schema.Types.Mixed, default: null },
    /** IST calendar date YYYY-MM-DD for fast daily lookups. */
    sightingDate: { type: String, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activitySightingSchema.index({ registrationId: 1, createdAt: -1 });
activitySightingSchema.index({ sightingDate: 1, registrationId: 1 });
activitySightingSchema.index({ matched: 1, sightingDate: 1 });

export default mongoose.model('ActivitySighting', activitySightingSchema);
