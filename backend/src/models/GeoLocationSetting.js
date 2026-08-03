import mongoose from 'mongoose';

/**
 * GeoLocationSetting Model
 *
 * Stores organisation-level configuration for the Geo Location Access Control module.
 * One document per organisationId — uses upsert semantics in the service layer
 * so the document is lazily created on first access.
 *
 * Follows the same pattern as DeviceSetting.
 */
const geoLocationSettingSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: 'default',
    },

    /**
     * Master feature flag for Geo Location Access Control.
     *
     * When FALSE (default):
     *   - No location check is performed at login.
     *   - All users may log in from any location.
     *
     * When TRUE:
     *   - After password authentication, the frontend requests the browser's
     *     geolocation and sends lat/lng to POST /api/geo-locations/verify.
     *   - Users without assigned locations are blocked.
     *   - Super Admins always bypass this check.
     */
    geoLocationEnabled: {
      type: Boolean,
      default: false,
    },

    accuracyThreshold: {
      type: Number,
      default: 100, // meters
    },

    superAdminBypass: {
      type: Boolean,
      default: true,
    },

    mobileLoginEnabled: {
      type: Boolean,
      default: true,
    },

    /**
     * Future-ready extension fields.
     * Examples: strictMode (block users with no assignments vs. allow them),
     *           fallbackBehavior, auditLevel, etc.
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export default mongoose.model('GeoLocationSetting', geoLocationSettingSchema);
