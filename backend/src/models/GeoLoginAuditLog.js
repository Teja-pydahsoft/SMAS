import mongoose from 'mongoose';

/**
 * GeoLoginAuditLog Model
 *
 * Immutable append-only record of every geo location check that occurred
 * during a login attempt.  Stores both successful and denied checks.
 *
 * This is purely for audit / compliance — it has no effect on system behaviour.
 */
const geoLoginAuditLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      default: 'default',
      index: true,
    },

    /** The system user who attempted to log in. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemUser', default: null, index: true },
    userDisplayName: { type: String, default: '' },
    userUsername: { type: String, default: '' },
    role: { type: String, default: '' },
    department: { type: String, default: '' },
    division: { type: String, default: '' },

    /** Location Information (from Browser) */
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    formattedAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },

    /** Outcome of the check */
    decision: { type: String, enum: ['allowed', 'denied', 'error', 'bypassed'], required: true, index: true },
    reason: { type: String, default: '', maxlength: 256 },

    /** Matched Permitted Location */
    matchedLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoLocation', default: null },
    matchedLocationName: { type: String, default: '' },
    matchedLatitude: { type: Number, default: null },
    matchedLongitude: { type: Number, default: null },

    /** Distance & Boundaries */
    configuredRadius: { type: Number, default: null },
    calculatedDistance: { type: Number, default: null },
    insideRadius: { type: Boolean, default: false },

    /** Browser & Device Information */
    ipAddress: { type: String, default: '', maxlength: 64 },
    browser: { type: String, default: '' },
    operatingSystem: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    deviceFingerprint: { type: String, default: '' },
    deviceName: { type: String, default: '' },
    deviceStatus: { type: String, default: '' },
    agentVersion: { type: String, default: '' },
    loginSource: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },

    /** Performance & Deployment */
    geoVerificationDurationMs: { type: Number, default: null },
    campusId: { type: String, default: '' },
    branchId: { type: String, default: '' },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Fast per-user lookup
geoLoginAuditLogSchema.index({ userId: 1, createdAt: -1 });

// Global audit view by org + date
geoLoginAuditLogSchema.index({ organizationId: 1, createdAt: -1 });

// Result-type filter
geoLoginAuditLogSchema.index({ organizationId: 1, decision: 1, createdAt: -1 });

export default mongoose.model('GeoLoginAuditLog', geoLoginAuditLogSchema);
