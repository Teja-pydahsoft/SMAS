import mongoose from 'mongoose';

/**
 * DeviceSetting Model
 *
 * Stores organisation-level configuration for the Device Maintenance module.
 * One document per organisationId — uses upsert semantics in the service layer
 * so the document is lazily created on first write.
 *
 * All fields carry sensible defaults so the module works out-of-the-box
 * with zero configuration.
 */
const deviceSettingSchema = new mongoose.Schema(
  {
    /** Matches Device.organizationId. */
    organizationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: 'default',
    },

    /**
     * When true, newly registered devices are automatically set to
     * APPROVED status instead of PENDING.  Disables the approval workflow.
     */
    autoApprove: {
      type: Boolean,
      default: false,
    },

    /**
     * When true, any unknown device fingerprint is automatically registered
     * as a new PENDING device on the first validate call.
     * When false, unrecognised devices are rejected immediately.
     */
    allowAutoRegistration: {
      type: Boolean,
      default: true,
    },

    /**
     * Number of days after which an approved device is considered expired
     * and must be re-approved.  0 = never expires.
     */
    deviceExpirationDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Maximum number of approved devices allowed per organisation.
     * 0 = unlimited.
     */
    maxDevicesAllowed: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Allowlist of OS strings (case-insensitive substring match).
     * Empty array = all operating systems are allowed.
     * Example: ['Windows', 'macOS']
     */
    allowedOperatingSystems: {
      type: [String],
      default: [],
    },

    /**
     * When true, the SHA-256 fingerprint must be exactly 64 hex characters.
     * When false, looser validation is applied (useful for dev/testing).
     */
    strictFingerprintValidation: {
      type: Boolean,
      default: true,
    },

    /**
     * Optional admin contact email shown on the "Pending approval" and
     * "Device blocked" splash screens.
     */
    adminContactEmail: {
      type: String,
      default: '',
      trim: true,
      maxlength: 256,
    },

    /**
     * Custom message shown to users whose device is pending approval.
     */
    pendingMessage: {
      type: String,
      default: 'Your device is pending administrator approval. Please contact your administrator.',
      maxlength: 512,
    },

    /**
     * Custom message shown to users whose device has been blocked.
     */
    blockedMessage: {
      type: String,
      default: 'Your device has been blocked. Please contact your administrator.',
      maxlength: 512,
    },

    /**
     * Custom message shown to users whose device has been rejected.
     */
    rejectedMessage: {
      type: String,
      default: 'Your device registration was rejected. Please contact your administrator.',
      maxlength: 512,
    },

    /**
     * Master feature flag for the entire Device Maintenance workflow.
     *
     * When FALSE (default):
     *   - Device validation, fingerprint checks, and bootstrap logic are skipped.
     *   - Login uses only username + password (pre-device-maintenance behaviour).
     *   - The frontend renders the login form directly without running the Device Agent.
     *
     * When TRUE:
     *   - Full DeviceGate workflow is active (fingerprint → validate → approve/block/etc.).
     *   - Existing device records and all other settings remain unchanged.
     *
     * This is a runtime flag — changing it takes effect immediately on the next
     * request without restarting the backend.
     */
    deviceMaintenanceEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Unique constraint already on organizationId — no additional indexes needed.

export default mongoose.model('DeviceSetting', deviceSettingSchema);
