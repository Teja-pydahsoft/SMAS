import mongoose from 'mongoose';
import {
  DEVICE_STATUSES,
  DEVICE_STATUS_LIST,
  DEVICE_OS_LIST,
} from '../constants/index.js';

/**
 * Device Model
 *
 * Represents a physical machine registered with the SAMS system.
 * The fingerprint is a SHA-256 hash generated client-side from hardware
 * attributes — raw hardware identifiers are never stored here.
 *
 * Lifecycle:  register → pending → approved | rejected
 *                                  approved → blocked → approved (unblock)
 */
const deviceSchema = new mongoose.Schema(
  {
    /**
     * Logical organisation identifier (free-form string rather than a
     * separate Organisation collection — keeps this module self-contained
     * and compatible with the single-tenant SAMS deployment model).
     * Defaults to 'default' so all devices belong to one org unless
     * multi-org support is added later.
     */
    organizationId: {
      type: String,
      required: true,
      trim: true,
      default: 'default',
      index: true,
    },

    /** Human-readable label the user assigned to the device. */
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },

    /** NetBIOS / hostname reported by the agent (informational only). */
    computerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },

    /**
     * Operating system string sent by the agent, e.g. "Windows 11 Pro".
     * Stored verbatim; validation against allowed OS list happens in the
     * service layer so settings changes take effect without schema changes.
     */
    operatingSystem: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },

    /**
     * SHA-256 hex fingerprint generated client-side.
     * Globally unique — one fingerprint per physical device.
     */
    fingerprint: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[0-9a-f]{64}$/, 'Fingerprint must be a 64-character hex string (SHA-256)'],
      index: true,
    },

    /** Current approval status. */
    status: {
      type: String,
      enum: DEVICE_STATUS_LIST,
      default: DEVICE_STATUSES.PENDING,
      required: true,
      index: true,
    },

    /** SystemUser who approved or rejected the device (null = not yet actioned). */
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },

    /** Denormalised display name at the time of approval/rejection. */
    approvedByName: {
      type: String,
      default: '',
    },

    /** ISO timestamp of approval / rejection action. */
    approvedAt: {
      type: Date,
      default: null,
    },

    /** ISO timestamp of the most recent validated login. */
    lastLoginAt: {
      type: Date,
      default: null,
    },

    /** Number of successful validated logins since registration. */
    loginCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Free-form note entered by the administrator when blocking or
     * rejecting the device (optional).
     */
    adminNote: {
      type: String,
      default: '',
      maxlength: 512,
    },

    /** IP address recorded at registration time (informational). */
    registeredIp: {
      type: String,
      default: '',
      maxlength: 64,
    },

    /** ISO timestamp when this device was first registered. */
    registeredAt: {
      type: Date,
      default: Date.now,
    },

    /**
     * True when this device was auto-approved during the initial bootstrap
     * (the very first Super Admin login after a fresh installation).
     * Purely informational — does not affect the approval workflow.
     */
    isPrimaryAdminDevice: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

/** Fast single-device lookup by fingerprint (the primary validation path). */
deviceSchema.index({ fingerprint: 1 }, { unique: true });

/** Admin list views filtered by org + status. */
deviceSchema.index({ organizationId: 1, status: 1 });

/** Dashboard "new registrations" query. */
deviceSchema.index({ organizationId: 1, registeredAt: -1 });

/** Last-login sorting for the admin list. */
deviceSchema.index({ organizationId: 1, lastLoginAt: -1 });

/** Combined org + status + created — supports the full admin table query. */
deviceSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// ── Instance helpers ──────────────────────────────────────────────────────────

/** True when the device may proceed to the login screen. */
deviceSchema.methods.isLoginAllowed = function isLoginAllowed() {
  return this.status === DEVICE_STATUSES.APPROVED;
};

export default mongoose.model('Device', deviceSchema);
