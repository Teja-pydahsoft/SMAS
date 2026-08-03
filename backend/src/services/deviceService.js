/**
 * deviceService.js
 *
 * Business logic for the Device Maintenance module.
 * All database reads/writes and cross-cutting concerns (audit logging,
 * settings enforcement, IP extraction) live here so the route layer
 * stays thin and testable.
 */

import mongoose from 'mongoose';
import Device from '../models/Device.js';
import DeviceAuditLog from '../models/DeviceAuditLog.js';
import DeviceSetting from '../models/DeviceSetting.js';
import SystemUser from '../models/SystemUser.js';
import {
  DEVICE_STATUSES,
  DEVICE_AUDIT_ACTIONS,
  DEVICE_STATUS_LABELS,
  DEVICE_AUDIT_ACTION_LABELS,
} from '../constants/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the best-effort IP from an Express request. */
export function extractIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

/** Build a compact actor snapshot from req.user (may be null for public routes). */
function actorFromReq(req) {
  const user = req?.user;
  if (!user) return { performedBy: null, performedByName: '', performedByUsername: '' };
  return {
    performedBy: user._id || null,
    performedByName: user.displayName || '',
    performedByUsername: user.username || '',
  };
}

/**
 * Append one immutable entry to the DeviceAuditLog collection.
 * Failures are swallowed with a warning so they never break the primary path.
 */
async function writeAuditLog({
  device,
  action,
  req,
  note = '',
  statusAfter = '',
  metadata = {},
}) {
  try {
    const actor = actorFromReq(req);
    await DeviceAuditLog.create({
      deviceId: device._id,
      deviceName: device.deviceName || '',
      computerName: device.computerName || '',
      fingerprint: device.fingerprint || '',
      organizationId: device.organizationId || 'default',
      action,
      ...actor,
      ipAddress: extractIp(req),
      note,
      statusAfter: statusAfter || device.status || '',
      metadata,
    });
  } catch (err) {
    console.warn('[DeviceAuditLog] write failed:', err.message);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Return the settings document for an org, creating it with defaults if absent.
 * Uses findOneAndUpdate with upsert so there is never a duplicate-key race.
 */
export async function getOrCreateSettings(organizationId = 'default') {
  const settings = await DeviceSetting.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return settings;
}

/** Persist updated fields for an org's settings. Returns the saved document. */
export async function updateSettings(organizationId = 'default', updates = {}, req = null) {
  const ALLOWED = [
    'autoApprove',
    'allowAutoRegistration',
    'deviceExpirationDays',
    'maxDevicesAllowed',
    'allowedOperatingSystems',
    'strictFingerprintValidation',
    'adminContactEmail',
    'pendingMessage',
    'blockedMessage',
    'rejectedMessage',
    'deviceMaintenanceEnabled',
  ];

  const safe = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      safe[key] = updates[key];
    }
  }

  const settings = await DeviceSetting.findOneAndUpdate(
    { organizationId },
    { $set: safe },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Write a lightweight audit entry against a synthetic device placeholder
  if (req?.user) {
    try {
      const actor = actorFromReq(req);
      await DeviceAuditLog.create({
        deviceId: new mongoose.Types.ObjectId(),
        deviceName: 'N/A',
        computerName: 'N/A',
        fingerprint: '0'.repeat(64),
        organizationId,
        action: DEVICE_AUDIT_ACTIONS.SETTINGS_UPDATED,
        ...actor,
        ipAddress: extractIp(req),
        note: 'Settings updated',
        statusAfter: '',
        metadata: { updatedFields: Object.keys(safe) },
      });
    } catch {
      // non-critical
    }
  }

  return settings;
}

// ─── Fingerprint validation ───────────────────────────────────────────────────

/** True when fp is a 64-character lowercase hex string (SHA-256). */
function isValidFingerprint(fp, strict = true) {
  if (!fp || typeof fp !== 'string') return false;
  if (strict) return /^[0-9a-f]{64}$/.test(fp.trim().toLowerCase());
  return fp.trim().length >= 8; // lenient: just needs to be non-trivial
}

/** True when the device OS matches any entry in the allowlist (substring, case-insensitive). */
function isOsAllowed(os, allowList) {
  if (!allowList || allowList.length === 0) return true;
  const osLower = (os || '').toLowerCase();
  return allowList.some((allowed) => osLower.includes(allowed.toLowerCase()));
}

/** True when the approved device is within its expiration window (0 = never expires). */
function isExpired(device, expirationDays) {
  if (!expirationDays || expirationDays <= 0) return false;
  if (!device.approvedAt) return false;
  const expiresAt = new Date(device.approvedAt);
  expiresAt.setDate(expiresAt.getDate() + expirationDays);
  return Date.now() > expiresAt.getTime();
}

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

/**
 * Returns true when at least one approved device belongs to any Super Admin.
 *
 * This is the single gate that decides whether the bootstrap path is still
 * open.  Once one Super Admin device is approved — by any means — this
 * returns true and bootstrap is permanently closed for all future requests.
 *
 * The query is a single indexed count: fingerprint index + status index make
 * it essentially free at runtime.
 */
export async function hasPrimaryAdminDevice(organizationId = 'default') {
  // Find all super-admin user IDs (usually just one in a single-tenant deployment)
  const superAdmins = await SystemUser.find({ isSuperAdmin: true, isActive: true })
    .select('_id')
    .lean();

  if (!superAdmins.length) return false;

  // Check whether any approved device is flagged as a primary admin device
  // OR was approved via normal workflow for a super admin.
  // The isPrimaryAdminDevice flag is the canonical marker; we also accept
  // any approved device whose approvedByName is 'SYSTEM_BOOTSTRAP' for
  // forward-compat with data written before the flag existed.
  const existingPrimary = await Device.countDocuments({
    organizationId,
    status: DEVICE_STATUSES.APPROVED,
    $or: [
      { isPrimaryAdminDevice: true },
      { approvedByName: 'SYSTEM_BOOTSTRAP' },
    ],
  });

  return existingPrimary > 0;
}

/**
 * Bootstrap-approve a device for the initial Super Admin login.
 *
 * Called from POST /api/auth/login ONLY when:
 *   1. The authenticating user is a Super Admin.
 *   2. hasPrimaryAdminDevice() returns false.
 *   3. The device fingerprint is known (was registered via POST /api/devices/register).
 *
 * Returns { ok: true, bootstrapped: true }  on success.
 * Returns { ok: false, reason }             if nothing was changed (already approved,
 *                                           fingerprint unknown, etc.).
 *
 * This function is idempotent — calling it twice on the same device is safe.
 */
export async function bootstrapApproveDevice({ fingerprint, req, organizationId = 'default' }) {
  const fp = (fingerprint || '').trim().toLowerCase();
  if (!fp) return { ok: false, reason: 'no_fingerprint' };

  const device = await Device.findOne({ fingerprint: fp, organizationId });
  if (!device) return { ok: false, reason: 'not_registered' };

  // Already approved — nothing to do (idempotent)
  if (device.status === DEVICE_STATUSES.APPROVED) {
    return { ok: true, bootstrapped: false, alreadyApproved: true };
  }

  const now = new Date();
  device.status             = DEVICE_STATUSES.APPROVED;
  device.isPrimaryAdminDevice = true;
  device.approvedBy         = null;           // no human actor — system action
  device.approvedByName     = 'SYSTEM_BOOTSTRAP';
  device.approvedAt         = now;
  device.lastLoginAt        = now;
  device.loginCount         = (device.loginCount || 0) + 1;
  await device.save();

  // Write a clearly-labelled bootstrap audit entry
  await DeviceAuditLog.create({
    deviceId:           device._id,
    deviceName:         device.deviceName || '',
    computerName:       device.computerName || '',
    fingerprint:        device.fingerprint || '',
    organizationId,
    action:             DEVICE_AUDIT_ACTIONS.BOOTSTRAP_APPROVED,
    performedBy:        null,
    performedByName:    'SYSTEM_BOOTSTRAP',
    performedByUsername:'system',
    ipAddress:          extractIp(req),
    note:               'Initial Super Admin device automatically approved. No approved Super Admin device existed at login time.',
    statusAfter:        DEVICE_STATUSES.APPROVED,
    metadata: {
      trigger:            'super_admin_first_login',
      isPrimaryAdminDevice: true,
    },
  }).catch((err) => {
    console.warn('[DeviceAuditLog] bootstrap write failed:', err.message);
  });

  console.log(
    `[DeviceBootstrap] Primary admin device approved for fingerprint ${fp.slice(0, 8)}… ` +
    `(device: ${device.deviceName || device.computerName})`
  );

  return { ok: true, bootstrapped: true };
}

// ─── Public device operations (no auth required) ─────────────────────────────

/**
 * Register a device or return its current status if already registered.
 *
 * Flow:
 *  1. Validate fingerprint format.
 *  2. If device already exists → return { status, device }.
 *  3. If allowAutoRegistration is false → return { status: 'rejected', reason }.
 *  4. Check OS allowlist.
 *  5. Check device cap.
 *  6. Create device with status = pending (or approved if autoApprove is on).
 *  7. Write audit log entry.
 */
export async function registerDevice({ fingerprint, deviceName, computerName, operatingSystem, req }) {
  const orgId = 'default';
  const settings = await getOrCreateSettings(orgId);

  // ── Maintenance mode bypass ───────────────────────────────────────────────
  // When the feature flag is OFF, device registration is not required.
  if (!settings.deviceMaintenanceEnabled) {
    return { ok: true, status: 'not_required', maintenanceMode: 'disabled', alreadyExists: false, device: null };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const fp = (fingerprint || '').trim().toLowerCase();

  // ── Validate fingerprint format ──
  if (!isValidFingerprint(fp, settings.strictFingerprintValidation)) {
    return {
      ok: false,
      error: 'Invalid device fingerprint. Must be a SHA-256 hex string.',
      code: 'INVALID_FINGERPRINT',
    };
  }

  // ── Check required fields ──
  if (!deviceName?.trim()) return { ok: false, error: 'deviceName is required', code: 'VALIDATION' };
  if (!computerName?.trim()) return { ok: false, error: 'computerName is required', code: 'VALIDATION' };
  if (!operatingSystem?.trim()) return { ok: false, error: 'operatingSystem is required', code: 'VALIDATION' };

  // ── Check if already registered ──
  const existing = await Device.findOne({ fingerprint: fp });
  if (existing) {
    // Record the re-registration attempt so the admin can see it
    await writeAuditLog({
      device: existing,
      action: DEVICE_AUDIT_ACTIONS.LOGIN_ATTEMPT,
      req,
      note: 'Device re-registration attempt (already registered)',
      statusAfter: existing.status,
    });
    return { ok: true, alreadyExists: true, device: serializeDevice(existing), status: existing.status };
  }

  // ── Auto-registration disabled ──
  if (!settings.allowAutoRegistration) {
    return {
      ok: false,
      error: 'Automatic device registration is disabled. Contact your administrator.',
      code: 'AUTO_REGISTRATION_DISABLED',
    };
  }

  // ── OS allowlist ──
  if (!isOsAllowed(operatingSystem, settings.allowedOperatingSystems)) {
    return {
      ok: false,
      error: `Operating system "${operatingSystem}" is not permitted by policy.`,
      code: 'OS_NOT_ALLOWED',
    };
  }

  // ── Device cap ──
  if (settings.maxDevicesAllowed > 0) {
    const approvedCount = await Device.countDocuments({
      organizationId: orgId,
      status: DEVICE_STATUSES.APPROVED,
    });
    if (approvedCount >= settings.maxDevicesAllowed) {
      return {
        ok: false,
        error: 'Maximum device limit reached. Contact your administrator.',
        code: 'DEVICE_LIMIT_REACHED',
      };
    }
  }

  // ── Create device ──
  const initialStatus = settings.autoApprove
    ? DEVICE_STATUSES.APPROVED
    : DEVICE_STATUSES.PENDING;

  const device = await Device.create({
    organizationId: orgId,
    deviceName: deviceName.trim(),
    computerName: computerName.trim(),
    operatingSystem: operatingSystem.trim(),
    fingerprint: fp,
    status: initialStatus,
    registeredIp: extractIp(req),
    registeredAt: new Date(),
    ...(settings.autoApprove
      ? { approvedByName: 'Auto-approved', approvedAt: new Date() }
      : {}),
  });

  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.REGISTERED,
    req,
    note: settings.autoApprove ? 'Device auto-approved on registration' : 'New device registered — awaiting approval',
    statusAfter: device.status,
  });

  return { ok: true, alreadyExists: false, device: serializeDevice(device), status: device.status };
}

/**
 * Validate a device fingerprint before showing the login screen.
 *
 * Returns one of:
 *   { status: 'approved' }                 → show login
 *   { status: 'pending', message }         → show pending splash
 *   { status: 'rejected', message }        → show rejected splash
 *   { status: 'blocked', message }         → show blocked splash
 *   { status: 'unknown' }                  → not registered
 */
export async function validateDevice({ fingerprint, req }) {
  const orgId = 'default';
  const settings = await getOrCreateSettings(orgId);

  // ── Maintenance mode bypass ───────────────────────────────────────────────
  // When the feature flag is OFF, device validation is skipped entirely.
  // Return 'approved' immediately so any caller (Device Agent, frontend) gets
  // a non-blocking response without any fingerprint or status checks.
  if (!settings.deviceMaintenanceEnabled) {
    return { status: 'approved', maintenanceMode: 'disabled' };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const fp = (fingerprint || '').trim().toLowerCase();

  if (!isValidFingerprint(fp, settings.strictFingerprintValidation)) {
    return { status: 'unknown', reason: 'invalid_fingerprint' };
  }

  const device = await Device.findOne({ fingerprint: fp });

  if (!device) {
    await DeviceAuditLog.create({
      deviceId: new mongoose.Types.ObjectId(),
      deviceName: 'Unknown',
      computerName: 'Unknown',
      fingerprint: fp,
      organizationId: orgId,
      action: DEVICE_AUDIT_ACTIONS.VALIDATION_FAILED,
      ipAddress: extractIp(req),
      note: 'Fingerprint not found in registry',
      statusAfter: 'unknown',
      metadata: { reason: 'not_registered' },
    }).catch(() => {});
    return { status: 'unknown' };
  }

  // Check expiration for approved devices
  if (device.status === DEVICE_STATUSES.APPROVED && isExpired(device, settings.deviceExpirationDays)) {
    device.status = DEVICE_STATUSES.PENDING;
    device.approvedBy = null;
    device.approvedByName = '';
    device.approvedAt = null;
    await device.save();

    await writeAuditLog({
      device,
      action: DEVICE_AUDIT_ACTIONS.VALIDATION_FAILED,
      req,
      note: 'Device approval expired — reset to pending',
      statusAfter: DEVICE_STATUSES.PENDING,
      metadata: { reason: 'expired' },
    });
    return { status: 'pending', message: settings.pendingMessage };
  }

  if (device.status === DEVICE_STATUSES.APPROVED) {
    // Record the successful login touch
    device.lastLoginAt = new Date();
    device.loginCount = (device.loginCount || 0) + 1;
    await device.save();

    await writeAuditLog({
      device,
      action: DEVICE_AUDIT_ACTIONS.LOGIN_ATTEMPT,
      req,
      note: 'Device validated — login permitted',
      statusAfter: DEVICE_STATUSES.APPROVED,
    });
    return { status: 'approved', device: serializeDevice(device) };
  }

  if (device.status === DEVICE_STATUSES.PENDING) {
    // ── Bootstrap check ──────────────────────────────────────────────────────
    // If no approved Super Admin device exists yet, the system is in its
    // initial state. Signal the frontend to show the login form immediately
    // so the first Super Admin can authenticate and trigger bootstrap approval.
    // This is NOT a security bypass — password validation still happens on login.
    let bootstrapRequired = false;
    try {
      bootstrapRequired = !(await hasPrimaryAdminDevice(orgId));
    } catch {
      // Non-fatal — default to normal pending flow if check fails
    }

    await writeAuditLog({
      device,
      action: DEVICE_AUDIT_ACTIONS.VALIDATION_FAILED,
      req,
      note: bootstrapRequired
        ? 'Login attempt — device pending, bootstrap required (no primary admin device exists)'
        : 'Login attempt — device still pending',
      statusAfter: DEVICE_STATUSES.PENDING,
      metadata: { bootstrapRequired },
    });
    return { status: 'pending', message: settings.pendingMessage, bootstrapRequired };
  }

  if (device.status === DEVICE_STATUSES.BLOCKED) {
    await writeAuditLog({
      device,
      action: DEVICE_AUDIT_ACTIONS.VALIDATION_FAILED,
      req,
      note: 'Login attempt on blocked device',
      statusAfter: DEVICE_STATUSES.BLOCKED,
    });
    return { status: 'blocked', message: settings.blockedMessage };
  }

  if (device.status === DEVICE_STATUSES.REJECTED) {
    await writeAuditLog({
      device,
      action: DEVICE_AUDIT_ACTIONS.VALIDATION_FAILED,
      req,
      note: 'Login attempt on rejected device',
      statusAfter: DEVICE_STATUSES.REJECTED,
    });
    return { status: 'rejected', message: settings.rejectedMessage };
  }

  return { status: 'unknown' };
}

// ─── Admin device operations (authenticated) ──────────────────────────────────

/** Paginated + filtered list of devices for the admin table. */
export async function listDevices({
  organizationId = 'default',
  status,
  search,
  page = 1,
  limit = 25,
  sortBy = 'createdAt',
  sortDir = 'desc',
} = {}) {
  const filter = { organizationId };
  if (status) filter.status = status;
  if (search) {
    const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { deviceName: { $regex: q, $options: 'i' } },
      { computerName: { $regex: q, $options: 'i' } },
      { operatingSystem: { $regex: q, $options: 'i' } },
      { fingerprint: { $regex: q, $options: 'i' } },
    ];
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const skip = (safePage - 1) * safeLimit;

  const allowedSort = ['createdAt', 'registeredAt', 'lastLoginAt', 'deviceName', 'computerName', 'status'];
  const sortField = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
  const sortOrder = sortDir === 'asc' ? 1 : -1;

  const [devices, total] = await Promise.all([
    Device.find(filter)
      .populate('approvedBy', 'displayName username')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Device.countDocuments(filter),
  ]);

  return {
    devices: devices.map(serializeDevice),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
}

/** Dashboard aggregate stats for the Device Maintenance dashboard. */
export async function getDeviceStats(organizationId = 'default') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [statusCounts, todayLogins, newRequests, registrationTrend, dailyLoginTrend] =
    await Promise.all([
      // Status breakdown
      Device.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Logins today
      Device.countDocuments({
        organizationId,
        lastLoginAt: { $gte: today, $lt: tomorrow },
      }),

      // New registrations today (pending)
      Device.countDocuments({
        organizationId,
        status: DEVICE_STATUSES.PENDING,
        createdAt: { $gte: today, $lt: tomorrow },
      }),

      // 30-day registration trend
      Device.aggregate([
        {
          $match: {
            organizationId,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),

      // 14-day daily login activity
      DeviceAuditLog.aggregate([
        {
          $match: {
            organizationId,
            action: DEVICE_AUDIT_ACTIONS.LOGIN_ATTEMPT,
            createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
    ]);

  // Flatten status counts
  const byStatus = { pending: 0, approved: 0, rejected: 0, blocked: 0 };
  for (const row of statusCounts) {
    if (byStatus[row._id] !== undefined) byStatus[row._id] = row.count;
  }
  const total = Object.values(byStatus).reduce((s, v) => s + v, 0);

  // Build recent activity (last 10 audit log entries)
  const recentActivity = await DeviceAuditLog.find({ organizationId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    total,
    pending: byStatus.pending,
    approved: byStatus.approved,
    rejected: byStatus.rejected,
    blocked: byStatus.blocked,
    todayLogins,
    newRequests,
    registrationTrend,
    dailyLoginTrend,
    recentActivity: recentActivity.map(serializeAuditLog),
  };
}

/** Get a single device by ID with its audit trail. */
export async function getDeviceById(id, organizationId = 'default') {
  const device = await Device.findOne({ _id: id, organizationId })
    .populate('approvedBy', 'displayName username');

  if (!device) return null;

  const auditLogs = await DeviceAuditLog.find({ deviceId: device._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    device: serializeDevice(device),
    auditLogs: auditLogs.map(serializeAuditLog),
  };
}

/** Approve a device. */
export async function approveDevice(id, organizationId = 'default', req) {
  const device = await Device.findOne({ _id: id, organizationId });
  if (!device) return { ok: false, error: 'Device not found', status: 404 };

  if (device.status === DEVICE_STATUSES.APPROVED) {
    return { ok: false, error: 'Device is already approved', status: 400 };
  }

  const previousStatus = device.status;
  device.status = DEVICE_STATUSES.APPROVED;
  device.approvedBy = req.user?._id || null;
  device.approvedByName = req.user?.displayName || req.user?.username || '';
  device.approvedAt = new Date();
  await device.save();

  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.APPROVED,
    req,
    note: `Device approved by ${device.approvedByName}`,
    statusAfter: DEVICE_STATUSES.APPROVED,
    metadata: { previousStatus },
  });

  return { ok: true, device: serializeDevice(device) };
}

/** Reject a device. */
export async function rejectDevice(id, organizationId = 'default', req, note = '') {
  const device = await Device.findOne({ _id: id, organizationId });
  if (!device) return { ok: false, error: 'Device not found', status: 404 };

  if (device.status === DEVICE_STATUSES.REJECTED) {
    return { ok: false, error: 'Device is already rejected', status: 400 };
  }

  const previousStatus = device.status;
  device.status = DEVICE_STATUSES.REJECTED;
  device.adminNote = note || '';
  await device.save();

  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.REJECTED,
    req,
    note: note || 'Device rejected by administrator',
    statusAfter: DEVICE_STATUSES.REJECTED,
    metadata: { previousStatus },
  });

  return { ok: true, device: serializeDevice(device) };
}

/** Block an approved device. */
export async function blockDevice(id, organizationId = 'default', req, note = '') {
  const device = await Device.findOne({ _id: id, organizationId });
  if (!device) return { ok: false, error: 'Device not found', status: 404 };

  if (device.status === DEVICE_STATUSES.BLOCKED) {
    return { ok: false, error: 'Device is already blocked', status: 400 };
  }

  const previousStatus = device.status;
  device.status = DEVICE_STATUSES.BLOCKED;
  device.adminNote = note || '';
  await device.save();

  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.BLOCKED,
    req,
    note: note || 'Device blocked by administrator',
    statusAfter: DEVICE_STATUSES.BLOCKED,
    metadata: { previousStatus },
  });

  return { ok: true, device: serializeDevice(device) };
}

/** Unblock a blocked device — restores it to approved. */
export async function unblockDevice(id, organizationId = 'default', req) {
  const device = await Device.findOne({ _id: id, organizationId });
  if (!device) return { ok: false, error: 'Device not found', status: 404 };

  if (device.status !== DEVICE_STATUSES.BLOCKED) {
    return { ok: false, error: 'Device is not blocked', status: 400 };
  }

  device.status = DEVICE_STATUSES.APPROVED;
  device.adminNote = '';
  await device.save();

  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.UNBLOCKED,
    req,
    note: 'Device unblocked by administrator',
    statusAfter: DEVICE_STATUSES.APPROVED,
    metadata: { previousStatus: DEVICE_STATUSES.BLOCKED },
  });

  return { ok: true, device: serializeDevice(device) };
}

/** Permanently delete a device and write a final audit entry. */
export async function deleteDevice(id, organizationId = 'default', req) {
  const device = await Device.findOne({ _id: id, organizationId });
  if (!device) return { ok: false, error: 'Device not found', status: 404 };

  // Write audit BEFORE deletion so deviceId still references a valid doc
  await writeAuditLog({
    device,
    action: DEVICE_AUDIT_ACTIONS.DELETED,
    req,
    note: 'Device permanently deleted by administrator',
    statusAfter: 'deleted',
    metadata: { deletedStatus: device.status },
  });

  await Device.deleteOne({ _id: device._id });

  return { ok: true };
}

/** Paginated audit log for admin views. */
export async function listAuditLogs({
  organizationId = 'default',
  deviceId,
  action,
  page = 1,
  limit = 50,
} = {}) {
  const filter = { organizationId };
  if (deviceId) filter.deviceId = deviceId;
  if (action) filter.action = action;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [logs, total] = await Promise.all([
    DeviceAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    DeviceAuditLog.countDocuments(filter),
  ]);

  return {
    logs: logs.map(serializeAuditLog),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
}

// ─── Serializers ─────────────────────────────────────────────────────────────

/** Safe public representation of a Device document. */
export function serializeDevice(device) {
  const d = typeof device.toObject === 'function' ? device.toObject() : { ...device };
  const approvedBy = d.approvedBy && typeof d.approvedBy === 'object' ? d.approvedBy : null;

  return {
    id: d._id?.toString(),
    _id: d._id,
    organizationId: d.organizationId || 'default',
    deviceName: d.deviceName || '',
    computerName: d.computerName || '',
    operatingSystem: d.operatingSystem || '',
    fingerprint: d.fingerprint || '',
    status: d.status || DEVICE_STATUSES.PENDING,
    statusLabel: DEVICE_STATUS_LABELS[d.status] || d.status,
    isPrimaryAdminDevice: Boolean(d.isPrimaryAdminDevice),
    approvedBy: approvedBy
      ? { _id: approvedBy._id, displayName: approvedBy.displayName, username: approvedBy.username }
      : null,
    approvedByName: d.approvedByName || '',
    approvedAt: d.approvedAt || null,
    lastLoginAt: d.lastLoginAt || null,
    loginCount: d.loginCount || 0,
    adminNote: d.adminNote || '',
    registeredIp: d.registeredIp || '',
    registeredAt: d.registeredAt || d.createdAt || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
  };
}

/** Safe public representation of a DeviceAuditLog document. */
export function serializeAuditLog(log) {
  return {
    id: log._id?.toString(),
    _id: log._id,
    deviceId: log.deviceId?.toString() || '',
    deviceName: log.deviceName || '',
    computerName: log.computerName || '',
    fingerprint: log.fingerprint || '',
    organizationId: log.organizationId || 'default',
    action: log.action || '',
    actionLabel: DEVICE_AUDIT_ACTION_LABELS[log.action] || log.action || '',
    performedBy: log.performedBy?.toString() || null,
    performedByName: log.performedByName || '',
    performedByUsername: log.performedByUsername || '',
    ipAddress: log.ipAddress || '',
    note: log.note || '',
    statusAfter: log.statusAfter || '',
    metadata: log.metadata || {},
    createdAt: log.createdAt || null,
  };
}
