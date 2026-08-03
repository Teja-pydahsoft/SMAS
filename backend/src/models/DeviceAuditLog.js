import mongoose from 'mongoose';
import {
  DEVICE_AUDIT_ACTIONS,
  DEVICE_AUDIT_ACTION_LIST,
} from '../constants/index.js';

/**
 * DeviceAuditLog Model
 *
 * Immutable append-only record of every significant action performed on a
 * Device.  Never updated or deleted — forms the compliance audit trail.
 *
 * Actors can be:
 *   • A SystemUser (admin actions — approve, reject, block, unblock, delete)
 *   • The device itself (register, login_attempt, validation_failed)
 */
const deviceAuditLogSchema = new mongoose.Schema(
  {
    /** The device this log entry belongs to. */
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },

    /**
     * Denormalised snapshot of device identity at the time of the event.
     * Preserved even if the Device document is later deleted.
     */
    deviceName: { type: String, default: '' },
    computerName: { type: String, default: '' },
    fingerprint: { type: String, default: '' },
    organizationId: { type: String, default: 'default', index: true },

    /** The action that was performed. */
    action: {
      type: String,
      enum: DEVICE_AUDIT_ACTION_LIST,
      required: true,
      index: true,
    },

    /** SystemUser who triggered this action (null for device-initiated events). */
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemUser',
      default: null,
    },

    /** Denormalised actor display name (survives user renames / deletes). */
    performedByName: {
      type: String,
      default: '',
    },

    /** Denormalised actor username. */
    performedByUsername: {
      type: String,
      default: '',
    },

    /**
     * IP address of the request that triggered this event.
     * Set for both device-initiated and admin-initiated events.
     */
    ipAddress: {
      type: String,
      default: '',
      maxlength: 64,
    },

    /** Free-form human-readable note (e.g. rejection reason, block note). */
    note: {
      type: String,
      default: '',
      maxlength: 512,
    },

    /**
     * Snapshot of device status AFTER this action completed.
     * Useful for reconstructing the timeline without replaying events.
     */
    statusAfter: {
      type: String,
      default: '',
    },

    /**
     * Any extra data specific to this action type
     * (e.g. { previousStatus: 'approved' } for a block event).
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    // Disable __v since this collection is append-only
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

/** Audit log page for a specific device (most common query). */
deviceAuditLogSchema.index({ deviceId: 1, createdAt: -1 });

/** Global audit log view filtered by org + date. */
deviceAuditLogSchema.index({ organizationId: 1, createdAt: -1 });

/** Filter by action type across all devices in an org. */
deviceAuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });

/** Lookup logs by admin who performed them. */
deviceAuditLogSchema.index({ performedBy: 1, createdAt: -1 });

export default mongoose.model('DeviceAuditLog', deviceAuditLogSchema);
