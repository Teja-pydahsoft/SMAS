import mongoose from 'mongoose';

/**
 * GeoLocation Model
 *
 * Represents a named geographic zone that can be used to restrict system user logins.
 * Each location is a circle defined by a center coordinate and a radius.
 *
 * Future-ready: the metadata field can hold additional policy data
 * (e.g., allowed time ranges, WiFi SSID, IP ranges) without schema changes.
 */
const geoLocationSchema = new mongoose.Schema(
  {
    /** Human-readable name shown in the UI. */
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },

    /** WGS84 latitude in decimal degrees. */
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },

    /** WGS84 longitude in decimal degrees. */
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    /** Allowed radius in metres. Must be positive. */
    radius: {
      type: Number,
      required: true,
      min: 1,
      max: 100000,
    },

    /** Optional resolved address for display in the table. */
    address: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * Whether this location is currently active.
     * Inactive locations are hidden from assignment pickers but remain in
     * existing user assignments (they simply become never-matching).
     */
    isActive: {
      type: Boolean,
      default: true,
    },

    /** Optional longer description / notes for admins. */
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 512,
    },

    /** SystemUser who created this location (for audit purposes). */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },

    /** Denormalised creator name (survives user renames / deletes). */
    createdByName: {
      type: String,
      default: '',
    },

    /**
     * Extension slot for future policy data.
     * Examples: { allowedTimeRange: { start: '08:00', end: '18:00' } }
     *           { wifiSSID: 'CORP_WIFI', ipRange: '192.168.1.0/24' }
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Fast lookup for active locations (most common query when verifying logins)
geoLocationSchema.index({ isActive: 1 });
geoLocationSchema.index({ createdAt: -1 });

export default mongoose.model('GeoLocation', geoLocationSchema);
