/**
 * devices.js — Device Maintenance API Routes
 *
 * Public endpoints (no auth):
 *   POST /api/devices/register   — Register or check a device fingerprint
 *   POST /api/devices/validate   — Validate fingerprint before showing login
 *
 * Protected endpoints (JWT + devices permission):
 *   GET    /api/devices/stats          — Dashboard statistics
 *   GET    /api/devices/audit-logs     — Paginated global audit log
 *   GET    /api/devices/settings       — Organisation settings
 *   PUT    /api/devices/settings       — Update organisation settings
 *   GET    /api/devices                — Paginated device list (with filters)
 *   GET    /api/devices/pending        — Shortcut: pending devices only
 *   GET    /api/devices/:id            — Device detail + audit trail
 *   PUT    /api/devices/:id/approve    — Approve a device
 *   PUT    /api/devices/:id/reject     — Reject a device
 *   PUT    /api/devices/:id/block      — Block a device
 *   PUT    /api/devices/:id/unblock    — Unblock a device
 *   DELETE /api/devices/:id            — Permanently delete a device
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  registerDevice,
  validateDevice,
  listDevices,
  getDeviceStats,
  getDeviceById,
  approveDevice,
  rejectDevice,
  blockDevice,
  unblockDevice,
  deleteDevice,
  listAuditLogs,
  getOrCreateSettings,
  updateSettings,
} from '../services/deviceService.js';

const router = Router();

// ─── Public routes (called before login — no auth middleware) ─────────────────

/**
 * POST /api/devices/register
 * Register a device with its fingerprint + metadata.
 * Returns the device's current status (pending / approved / rejected / blocked)
 * or creates a new pending record if the fingerprint is unknown.
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { fingerprint, deviceName, computerName, operatingSystem } = req.body;

    if (!fingerprint) {
      return res.status(400).json({ error: 'fingerprint is required' });
    }

    const result = await registerDevice({
      fingerprint,
      deviceName,
      computerName,
      operatingSystem,
      req,
    });

    if (!result.ok) {
      const httpStatus = result.code === 'DEVICE_LIMIT_REACHED' ? 403
        : result.code === 'AUTO_REGISTRATION_DISABLED' ? 403
        : result.code === 'OS_NOT_ALLOWED' ? 403
        : 400;
      return res.status(httpStatus).json({ error: result.error, code: result.code });
    }

    return res.status(result.alreadyExists ? 200 : 201).json({
      status: result.status,
      device: result.device,
      alreadyExists: result.alreadyExists,
    });
  })
);

/**
 * POST /api/devices/validate
 * Validate a fingerprint — returns approved / pending / blocked / rejected / unknown.
 * Called by the device agent on every application start.
 */
router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const { fingerprint } = req.body;

    if (!fingerprint) {
      return res.status(400).json({ error: 'fingerprint is required' });
    }

    const result = await validateDevice({ fingerprint, req });
    return res.json(result);
  })
);

// ─── Protected routes ─────────────────────────────────────────────────────────

/**
 * GET /api/devices/stats
 * Aggregate counts and trend data for the Device Dashboard.
 */
router.get(
  '/stats',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const stats = await getDeviceStats('default');
    return res.json(stats);
  })
);

/**
 * GET /api/devices/audit-logs
 * Paginated global audit log for the Audit Logs admin page.
 * Query params: deviceId, action, page, limit
 */
router.get(
  '/audit-logs',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const result = await listAuditLogs({
      organizationId: 'default',
      deviceId: req.query.deviceId || undefined,
      action: req.query.action || undefined,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  })
);

/**
 * GET /api/devices/settings
 * Retrieve organisation-level Device Maintenance settings.
 * NOTE: intentionally requires only devices.read so that the login page
 * can fetch deviceMaintenanceEnabled via a separate public endpoint below.
 */
router.get(
  '/settings',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings('default');
    return res.json(settings);
  })
);

/**
 * GET /api/devices/settings/public
 * Returns the minimal public subset of device settings needed before login.
 * No authentication required — only exposes the feature flag, nothing sensitive.
 */
router.get(
  '/settings/public',
  asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings('default');
    return res.json({ deviceMaintenanceEnabled: settings.deviceMaintenanceEnabled ?? false });
  })
);

/**
 * PUT /api/devices/settings
 * Update organisation-level settings.
 * Requires write permission.
 */
router.put(
  '/settings',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings('default', req.body, req);
    return res.json(settings);
  })
);

/**
 * GET /api/devices/pending
 * Convenience shortcut — equivalent to GET /api/devices?status=pending.
 */
router.get(
  '/pending',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const result = await listDevices({
      organizationId: 'default',
      status: 'pending',
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    return res.json(result);
  })
);

/**
 * GET /api/devices
 * Paginated device list.
 * Query params: status, search, page, limit, sortBy, sortDir
 */
router.get(
  '/',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const result = await listDevices({
      organizationId: 'default',
      status: req.query.status || undefined,
      search: req.query.search || undefined,
      page: req.query.page,
      limit: req.query.limit,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });
    return res.json(result);
  })
);

/**
 * GET /api/devices/:id
 * Single device detail + its audit trail.
 */
router.get(
  '/:id',
  requirePermission('devices', 'read'),
  asyncHandler(async (req, res) => {
    const result = await getDeviceById(req.params.id, 'default');
    if (!result) return res.status(404).json({ error: 'Device not found' });
    return res.json(result);
  })
);

/**
 * PUT /api/devices/:id/approve
 */
router.put(
  '/:id/approve',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const result = await approveDevice(req.params.id, 'default', req);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result.device);
  })
);

/**
 * PUT /api/devices/:id/reject
 * Body: { note?: string }
 */
router.put(
  '/:id/reject',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const result = await rejectDevice(req.params.id, 'default', req, req.body.note || '');
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result.device);
  })
);

/**
 * PUT /api/devices/:id/block
 * Body: { note?: string }
 */
router.put(
  '/:id/block',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const result = await blockDevice(req.params.id, 'default', req, req.body.note || '');
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result.device);
  })
);

/**
 * PUT /api/devices/:id/unblock
 */
router.put(
  '/:id/unblock',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const result = await unblockDevice(req.params.id, 'default', req);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result.device);
  })
);

/**
 * DELETE /api/devices/:id
 * Permanently removes the device record.
 */
router.delete(
  '/:id',
  requirePermission('devices', 'write'),
  asyncHandler(async (req, res) => {
    const result = await deleteDevice(req.params.id, 'default', req);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json({ message: 'Device deleted' });
  })
);

export default router;
