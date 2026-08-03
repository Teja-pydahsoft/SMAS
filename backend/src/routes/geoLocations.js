/**
 * geoLocations.js — Geo Location Access Control API Routes
 *
 * Public endpoint (no auth):
 *   GET  /api/geo-locations/settings/public  — Returns geoLocationEnabled flag
 *
 * Protected endpoints (JWT required):
 *   GET  /api/geo-locations/verify           — Verify user's current position (POST, needs JWT)
 *   GET  /api/geo-locations/settings         — Read org settings  (locations:read)
 *   PUT  /api/geo-locations/settings         — Update org settings (locations:write)
 *   GET  /api/geo-locations/audit-logs       — Paginated audit log (locations:read)
 *   GET  /api/geo-locations                  — List all locations  (locations:read)
 *   POST /api/geo-locations                  — Create location     (locations:write)
 *   GET  /api/geo-locations/:id              — Get single location (locations:read)
 *   PUT  /api/geo-locations/:id              — Update location     (locations:write)
 *   DELETE /api/geo-locations/:id            — Delete location     (locations:write)
 *
 * User assignment (system_users permission):
 *   GET  /api/geo-locations/users/:userId/locations — Get user's assigned locations
 *   PUT  /api/geo-locations/users/:userId/locations — Replace user's assigned locations
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/auth.js';
import {
  getOrCreateGeoSettings,
  updateGeoSettings,
  listLocations,
  createLocation,
  getLocationById,
  updateLocation,
  deleteLocation,
  getUserLocations,
  setUserLocations,
  verifyGeoAccess,
  listGeoAuditLogs,
} from '../services/geoLocationService.js';
import SystemUser from '../models/SystemUser.js';

const router = Router();

// ─── Public endpoint ──────────────────────────────────────────────────────────

/**
 * GET /api/geo-locations/settings/public
 * Returns the minimal public subset needed before login — just the feature flag.
 * No authentication required.
 */
router.get(
  '/settings/public',
  asyncHandler(async (req, res) => {
    const settings = await getOrCreateGeoSettings('default');
    return res.json({ geoLocationEnabled: settings.geoLocationEnabled ?? false });
  })
);

// ─── Protected endpoints ──────────────────────────────────────────────────────

/**
 * POST /api/geo-locations/verify
 * Verify that the authenticated user's submitted coordinates are within one of
 * their permitted locations.  Called by the frontend login flow after password
 * authentication succeeds (and after device validation, if enabled).
 *
 * Body: { latitude, longitude }
 * Returns: { ok, result, locationName?, distance?, message? }
 *
 * Note: This endpoint deliberately requires JWT so it can't be probed without
 *       first completing password authentication.
 */
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    // req.user is populated by the global authenticateUnlessPublic middleware
    const user = await SystemUser.findById(req.user._id)
      .select('isSuperAdmin displayName username allowedLocationIds')
      .populate('allowedLocationIds', '_id name latitude longitude radius isActive')
      .lean();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const result = await verifyGeoAccess({ user, latitude, longitude, req });

    if (!result.ok) {
      return res.status(403).json({
        error: result.message || 'You are outside the permitted work location.',
        result: result.result,
        nearestDistance: result.nearestDistance ?? null,
        nearestLocationName: result.nearestLocationName ?? null,
      });
    }

    return res.json({
      ok: true,
      result: result.result,
      locationName: result.locationName ?? null,
      distance: result.distance ?? null,
    });
  })
);

/**
 * GET /api/geo-locations/settings
 * Returns the org-level geo location settings.
 */
router.get(
  '/settings',
  requirePermission('locations', 'read'),
  asyncHandler(async (req, res) => {
    const settings = await getOrCreateGeoSettings('default');
    return res.json(settings);
  })
);

/**
 * PUT /api/geo-locations/settings
 * Update org-level settings. Requires write permission.
 */
router.put(
  '/settings',
  requirePermission('locations', 'write'),
  asyncHandler(async (req, res) => {
    const settings = await updateGeoSettings('default', req.body);
    return res.json(settings);
  })
);

/**
 * GET /api/geo-locations/audit-logs
 * Paginated geo login audit log.
 * Query params: userId, result, page, limit
 */
router.get(
  '/audit-logs',
  requirePermission('locations', 'read'),
  asyncHandler(async (req, res) => {
    const result = await listGeoAuditLogs({
      organizationId: 'default',
      userId: req.query.userId || undefined,
      result: req.query.result || undefined,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  })
);

/**
 * GET /api/geo-locations/users/:userId/locations
 * Get all locations assigned to a specific user.
 */
router.get(
  '/users/:userId/locations',
  requirePermission('system_users', 'read'),
  asyncHandler(async (req, res) => {
    const locations = await getUserLocations(req.params.userId);
    return res.json(locations);
  })
);

/**
 * PUT /api/geo-locations/users/:userId/locations
 * Replace a user's location assignments.
 * Body: { locationIds: string[] }
 */
router.put(
  '/users/:userId/locations',
  requirePermission('system_users', 'write'),
  asyncHandler(async (req, res) => {
    const { locationIds } = req.body;
    if (!Array.isArray(locationIds)) {
      return res.status(400).json({ error: 'locationIds must be an array' });
    }
    const locations = await setUserLocations(req.params.userId, locationIds);
    if (!locations) return res.status(404).json({ error: 'User not found' });
    return res.json(locations);
  })
);

/**
 * GET /api/geo-locations
 * List all locations. includeInactive=true returns inactive ones too.
 */
router.get(
  '/',
  requirePermission('locations', 'read'),
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const locations = await listLocations({ includeInactive });
    return res.json(locations);
  })
);

/**
 * POST /api/geo-locations
 * Create a new location.
 * Body: { name, latitude, longitude, radius, description?, isActive? }
 */
router.post(
  '/',
  requirePermission('locations', 'write'),
  asyncHandler(async (req, res) => {
    const { name, latitude, longitude, radius, address, description, isActive } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (latitude === undefined || latitude === null) return res.status(400).json({ error: 'latitude is required' });
    if (longitude === undefined || longitude === null) return res.status(400).json({ error: 'longitude is required' });
    if (!radius) return res.status(400).json({ error: 'radius is required' });

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseFloat(radius);

    if (Number.isNaN(lat) || lat < -90 || lat > 90)
      return res.status(400).json({ error: 'latitude must be between -90 and 90' });
    if (Number.isNaN(lng) || lng < -180 || lng > 180)
      return res.status(400).json({ error: 'longitude must be between -180 and 180' });
    if (Number.isNaN(rad) || rad <= 0)
      return res.status(400).json({ error: 'radius must be a positive number (metres)' });

    const location = await createLocation({ name, latitude: lat, longitude: lng, radius: rad, address, description, isActive, req });
    return res.status(201).json(location);
  })
);

/**
 * GET /api/geo-locations/:id
 * Get a single location by ID.
 */
router.get(
  '/:id',
  requirePermission('locations', 'read'),
  asyncHandler(async (req, res) => {
    const location = await getLocationById(req.params.id);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    return res.json(location);
  })
);

/**
 * PUT /api/geo-locations/:id
 * Update a location.
 */
router.put(
  '/:id',
  requirePermission('locations', 'write'),
  asyncHandler(async (req, res) => {
    const location = await updateLocation(req.params.id, req.body, req);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    return res.json(location);
  })
);

/**
 * DELETE /api/geo-locations/:id
 * Permanently delete a location.
 */
router.delete(
  '/:id',
  requirePermission('locations', 'write'),
  asyncHandler(async (req, res) => {
    const deleted = await deleteLocation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Location not found' });
    return res.json({ message: 'Location deleted' });
  })
);

export default router;
