/**
 * geoLocationService.js
 *
 * Business logic for the Geo Location Access Control module.
 *
 * Architecture note: This module is designed as a reusable security layer.
 * The verifyGeoAccess() function is the single entry point consumed by the
 * auth route.  Future policy types (time-based, IP, WiFi SSID, country) can
 * be added here without touching any other file.
 *
 *  Authentication
 *    ↓
 *  Device Validation  (optional)
 *    ↓
 *  Geo Location Validation  (this module, optional)
 *    ↓
 *  Role Validation
 *    ↓
 *  JWT → Dashboard
 */

import crypto from 'crypto';
import GeoLocation from '../models/GeoLocation.js';
import GeoLocationSetting from '../models/GeoLocationSetting.js';
import GeoLoginAuditLog from '../models/GeoLoginAuditLog.js';
import Device from '../models/Device.js';
import SystemUser from '../models/SystemUser.js';
import { GEO_AUDIT_RESULTS, DEVICE_STATUSES } from '../constants/index.js';
import { extractIp, isDesktopSystem } from './deviceService.js';

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Return the settings document for an org, creating it with defaults if absent.
 */
export async function getOrCreateGeoSettings(organizationId = 'default') {
  return GeoLocationSetting.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Persist updated fields for an org's geo settings. */
export async function updateGeoSettings(organizationId = 'default', updates = {}) {
  const ALLOWED = ['geoLocationEnabled', 'accuracyThreshold', 'superAdminBypass', 'mobileLoginEnabled'];
  const safe = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      safe[key] = updates[key];
    }
  }
  return GeoLocationSetting.findOneAndUpdate(
    { organizationId },
    { $set: safe },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ─── Haversine Distance ───────────────────────────────────────────────────────

const EARTH_RADIUS_METRES = 6_371_000;

/**
 * Calculate the great-circle distance between two WGS84 coordinates.
 * Returns distance in metres.
 *
 * Uses the Haversine formula:
 *   a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)
 *   c = 2·atan2(√a, √(1−a))
 *   d = R·c
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METRES * c;
}

// ─── Audit log writer ─────────────────────────────────────────────────────────

async function writeGeoAuditLog(data) {
  try {
    await GeoLoginAuditLog.create(data);

    // Immediately synchronize or touch the Device collection for desktop/laptop workstations
    if (isDesktopSystem(data)) {
      const ip = (data.ipAddress || '').trim();
      if (ip && ip !== '0.0.0.0') {
        const fp = crypto.createHash('sha256').update(`desktop_workstation:${ip}`).digest('hex');
        const os = data.operatingSystem || 'Windows';
        const browser = data.browser || 'Browser';
        const user = (data.userUsername || data.userDisplayName || '').trim();
        const isApproved = data.decision === 'allowed' || data.decision === 'granted' || data.decision === 'bypassed';
        const isDenied = data.decision === 'denied';
        const defaultStatus = isApproved ? DEVICE_STATUSES.APPROVED : isDenied ? DEVICE_STATUSES.BLOCKED : DEVICE_STATUSES.PENDING;

        const existing = await Device.findOne({ fingerprint: fp });
        if (!existing) {
          await Device.create({
            organizationId: data.organizationId || 'default',
            fingerprint: fp,
            deviceName: `${os} Workstation (${ip})`,
            computerName: `${ip} (${browser})`,
            operatingSystem: os,
            registeredIp: ip,
            registeredAt: new Date(),
            lastLoginAt: new Date(),
            loginCount: 1,
            status: defaultStatus,
            adminNote: user ? `Active users: ${user}` : 'General Workstation',
          });
        } else {
          let usersList = [];
          if (existing.adminNote && /active users:\s*/i.test(existing.adminNote)) {
            usersList = existing.adminNote.replace(/^.*active users:\s*/i, '').split(',').map(u => u.trim()).filter(Boolean);
          } else if (existing.adminNote && existing.adminNote !== 'General Workstation') {
            usersList = existing.adminNote.split(',').map(u => u.trim()).filter(Boolean);
          }
          if (user && !usersList.includes(user)) {
            usersList.push(user);
          }

          existing.lastLoginAt = new Date();
          existing.loginCount = (existing.loginCount || 0) + 1;
          if (usersList.length > 0) {
            existing.adminNote = `Active users: ${usersList.join(', ')}`;
          }

          if (isDenied && existing.status !== DEVICE_STATUSES.APPROVED) {
            existing.status = DEVICE_STATUSES.BLOCKED;
          }
          await existing.save();
        }
      }
    }
  } catch (err) {
    console.warn('[GeoLoginAuditLog] write failed:', err.message);
  }
}

function parseDevice(req, providedFingerprint) {
  const ua = req?.headers?.['user-agent'] || '';
  let browser = 'Unknown';
  let os = 'Unknown';
  const uaLower = ua.toLowerCase();

  // Correct OS detection order: detect mobile devices first so iPhone "like Mac OS X" is iOS, not macOS
  if (uaLower.includes('android')) os = 'Android';
  else if (uaLower.includes('iphone') || uaLower.includes('ipad') || uaLower.includes('ipod')) os = 'iOS';
  else if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('mac os') || uaLower.includes('macos') || uaLower.includes('macintosh')) os = 'macOS';
  else if (uaLower.includes('linux')) os = 'Linux';

  // Basic Browser
  if (uaLower.includes('edg/')) browser = 'Edge';
  else if (uaLower.includes('chrome/')) browser = 'Chrome';
  else if (uaLower.includes('firefox/')) browser = 'Firefox';
  else if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) browser = 'Safari';

  let loginSource = 'unknown';
  if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(uaLower)) {
    loginSource = uaLower.includes('ipad') || (uaLower.includes('android') && !uaLower.includes('mobile')) ? 'tablet' : 'mobile';
  } else if (os === 'Windows' || os === 'macOS' || (os === 'Linux' && !uaLower.includes('android'))) {
    loginSource = 'desktop';
  }

  return {
    browser,
    operatingSystem: os,
    userAgent: ua.substring(0, 500),
    loginSource,
    ipAddress: extractIp(req),
    deviceFingerprint: providedFingerprint || '',
  };
}

// ─── Core verification ────────────────────────────────────────────────────────

/**
 * Verify that the given coordinates fall within at least one of the user's
 * assigned locations.
 *
 * @param {object} params
 * @param {object} params.user        - Mongoose SystemUser document (or plain object)
 * @param {number} params.latitude    - Browser-reported latitude
 * @param {number} params.longitude   - Browser-reported longitude
 * @param {number} [params.accuracy]  - Browser-reported accuracy (meters)
 * @param {object} [params.req]       - Express request (for IP extraction)
 * @param {string} [params.deviceFingerprint] - Provided device fingerprint
 *
 * @returns {{ ok: boolean, result: string, locationName?: string, distance?: number, message?: string }}
 */
export async function verifyGeoAccess({ user, latitude, longitude, accuracy, req, deviceFingerprint, isContinuous, failureReason }) {
  const startTime = Date.now();
  const orgId = 'default';

  const settings = await getOrCreateGeoSettings(orgId);
  const deviceInfo = parseDevice(req, deviceFingerprint);

  const baseLog = {
    organizationId: orgId,
    userId: user?._id ?? null,
    userDisplayName: user?.displayName || '',
    userUsername: user?.username || '',
    role: user?.systemRoleId?.name || '',
    department: user?.departmentIds?.length ? user.departmentIds[0].toString() : '',
    division: user?.divisionIds?.length ? user.divisionIds[0].toString() : '',
    campusId: '',
    branchId: '',
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    accuracy: accuracy ?? null,
    ...deviceInfo,
  };

  const getDuration = () => Date.now() - startTime;

  // ── Workstation Permissions Check (Given Access vs Denied Systems) ───────────
  const clientIp = deviceInfo?.ipAddress || extractIp(req);
  const cleanIp = (clientIp || '').replace(/^::ffff:/i, '').trim();
  const clientFp = deviceInfo?.deviceFingerprint;
  const workstationConditions = [];
  if (clientFp && /^[0-9a-f]{64}$/i.test(clientFp)) {
    workstationConditions.push({ fingerprint: clientFp.toLowerCase() });
  }
  if (cleanIp) {
    workstationConditions.push({ registeredIp: cleanIp });
    workstationConditions.push({
      fingerprint: crypto.createHash('sha256').update(`desktop_workstation:${cleanIp}`).digest('hex'),
    });
  }
  if (clientIp && clientIp !== cleanIp) {
    workstationConditions.push({ registeredIp: clientIp });
    workstationConditions.push({
      fingerprint: crypto.createHash('sha256').update(`desktop_workstation:${clientIp}`).digest('hex'),
    });
  }

  if (workstationConditions.length > 0) {
    // 1. Check if the workstation has been explicitly denied / blocked by an administrator
    const isBlocked = await Device.findOne({
      status: DEVICE_STATUSES.BLOCKED,
      $or: workstationConditions,
    }).lean();

    if (isBlocked) {
      await writeGeoAuditLog({
        ...baseLog,
        decision: GEO_AUDIT_RESULTS.DENIED,
        reason: 'system_access_denied_by_admin',
        geoVerificationDurationMs: getDuration(),
      });
      return {
        ok: false,
        result: GEO_AUDIT_RESULTS.DENIED,
        message: 'This device/system has been denied access by an administrator.',
      };
    }

    // 2. Check if the workstation has been explicitly Granted Access (approved) by an administrator
    const isApprovedWorkstation = await Device.findOne({
      status: DEVICE_STATUSES.APPROVED,
      $or: workstationConditions,
    }).lean();

    if (isApprovedWorkstation) {
      await writeGeoAuditLog({
        ...baseLog,
        decision: isContinuous ? GEO_AUDIT_RESULTS.VERIFIED : GEO_AUDIT_RESULTS.ALLOWED,
        reason: 'workstation_access_granted_by_admin',
        matchedLocationName: isApprovedWorkstation.deviceName || 'Authorized Workstation',
        insideRadius: true,
        geoVerificationDurationMs: getDuration(),
      });
      return {
        ok: true,
        result: isContinuous ? GEO_AUDIT_RESULTS.VERIFIED : GEO_AUDIT_RESULTS.ALLOWED,
        locationName: isApprovedWorkstation.deviceName || 'Authorized Workstation',
        distance: 0,
      };
    }
  }

  // ── Handle reported client-side geolocation failure (e.g. browser permission denied or timeout) ──
  if (failureReason) {
    await writeGeoAuditLog({
      ...baseLog,
      decision: GEO_AUDIT_RESULTS.DENIED,
      reason: failureReason,
      geoVerificationDurationMs: getDuration(),
    });
    return {
      ok: false,
      result: GEO_AUDIT_RESULTS.DENIED,
      message: 'Access denied. Location verification failed or permission was denied.',
    };
  }

  // ── Super Admin bypass ───────────────────────────────────────────────────────
  if (user?.isSuperAdmin && settings.superAdminBypass) {
    await writeGeoAuditLog({
      ...baseLog,
      decision: GEO_AUDIT_RESULTS.BYPASSED,
      reason: 'super_admin_bypass',
      geoVerificationDurationMs: getDuration(),
    });
    return { ok: true, result: GEO_AUDIT_RESULTS.BYPASSED };
  }

  // ── Validate coordinates ─────────────────────────────────────────────────────
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const acc = parseFloat(accuracy);

  // ── Mobile Login Check ───────────────────────────────────────────────────────
  if (!settings.mobileLoginEnabled && req?.headers?.['user-agent']) {
    const ua = req.headers['user-agent'].toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);
    if (isMobile) {
      return {
        ok: false,
        result: GEO_AUDIT_RESULTS.DENIED,
        message: 'Mobile login is disabled for this organization.',
      };
    }
  }

  // ── Accuracy Threshold Check ─────────────────────────────────────────────────
  if (!Number.isNaN(acc) && settings.accuracyThreshold && acc > settings.accuracyThreshold) {
    return {
      ok: false,
      result: GEO_AUDIT_RESULTS.DENIED,
      message: `Location accuracy (${Math.round(acc)}m) does not meet the required threshold (${settings.accuracyThreshold}m).`,
    };
  }

  if (Number.isNaN(lat) || Number.isNaN(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    await writeGeoAuditLog({
      ...baseLog,
      decision: GEO_AUDIT_RESULTS.ERROR,
      reason: 'invalid_coordinates',
      geoVerificationDurationMs: getDuration(),
    });
    return {
      ok: false,
      result: GEO_AUDIT_RESULTS.ERROR,
      message: 'Invalid location coordinates received.',
    };
  }

  // ── Fetch user's assigned location IDs ───────────────────────────────────────
  // SystemUser.allowedLocationIds is populated at login time, so we must extract the IDs
  const allowedIds = (user?.allowedLocationIds ?? []).map(loc => loc._id || loc);

  if (!allowedIds.length) {
    await writeGeoAuditLog({
      ...baseLog,
      decision: GEO_AUDIT_RESULTS.DENIED,
      reason: 'no_locations_assigned',
      geoVerificationDurationMs: getDuration(),
    });
    return {
      ok: false,
      result: GEO_AUDIT_RESULTS.DENIED,
      message: 'You are outside the permitted work location.',
    };
  }

  // ── Load active assigned locations ───────────────────────────────────────────
  const locations = await GeoLocation.find({
    _id: { $in: allowedIds },
    isActive: true,
  }).lean();

  if (!locations.length) {
    await writeGeoAuditLog({
      ...baseLog,
      decision: GEO_AUDIT_RESULTS.DENIED,
      reason: 'no_active_locations',
      geoVerificationDurationMs: getDuration(),
    });
    return {
      ok: false,
      result: GEO_AUDIT_RESULTS.DENIED,
      message: 'You are outside the permitted work location.',
    };
  }

  // ── Haversine check for each assigned location ────────────────────────────────
  let nearestDistance = Infinity;
  let nearestLocationName = '';
  let matchedLocation = null;

  for (const loc of locations) {
    const dist = haversineDistance(lat, lng, loc.latitude, loc.longitude);

    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestLocationName = loc.name;
    }

    if (dist <= loc.radius) {
      matchedLocation = loc;
      // Keep scanning to find the nearest for audit log accuracy
    }
  }

  if (matchedLocation) {
    // ── Access Allowed ──────────────────────────────────────────────────────────
    await writeGeoAuditLog({
      ...baseLog,
      decision: isContinuous ? GEO_AUDIT_RESULTS.VERIFIED : GEO_AUDIT_RESULTS.ALLOWED,
      matchedLocationId: matchedLocation._id,
      matchedLocationName: matchedLocation.name,
      matchedLatitude: matchedLocation.latitude,
      matchedLongitude: matchedLocation.longitude,
      configuredRadius: matchedLocation.radius,
      calculatedDistance: Math.round(nearestDistance),
      insideRadius: true,
      reason: 'inside_radius',
      geoVerificationDurationMs: getDuration(),
    });

    return {
      ok: true,
      result: isContinuous ? GEO_AUDIT_RESULTS.VERIFIED : GEO_AUDIT_RESULTS.ALLOWED,
      locationName: matchedLocation.name,
      distance: Math.round(haversineDistance(lat, lng, matchedLocation.latitude, matchedLocation.longitude)),
    };
  }

  // ── Access Denied ─────────────────────────────────────────────────────────────
  await writeGeoAuditLog({
    ...baseLog,
    decision: GEO_AUDIT_RESULTS.DENIED,
    calculatedDistance: Math.round(nearestDistance),
    insideRadius: false,
    reason: 'outside_all_locations',
    geoVerificationDurationMs: getDuration(),
    metadata: {
      checkedLocations: locations.map((l) => ({ id: l._id, name: l.name, radius: l.radius })),
    },
  });

  return {
    ok: false,
    result: GEO_AUDIT_RESULTS.DENIED,
    nearestDistance: Math.round(nearestDistance),
    nearestLocationName,
    message: 'You are outside the permitted work location.',
  };
}

// ─── CRUD for locations ───────────────────────────────────────────────────────

/** Sanitize and return a plain object for the API response. */
function serializeLocation(loc) {
  const l = typeof loc.toObject === 'function' ? loc.toObject() : { ...loc };
  return {
    _id: l._id,
    id: l._id?.toString(),
    name: l.name,
    latitude: l.latitude,
    longitude: l.longitude,
    radius: l.radius,
    address: l.address || '',
    isActive: l.isActive,
    description: l.description || '',
    createdBy: l.createdBy || null,
    createdByName: l.createdByName || '',
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    assignedUsersCount: l.assignedUsersCount || 0,
  };
}

/** List all locations. */
export async function listLocations({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const locations = await GeoLocation.find(filter).sort({ name: 1 }).lean();

  if (locations.length === 0) return [];

  const counts = await SystemUser.aggregate([
    { $unwind: "$allowedLocationIds" },
    { $group: { _id: "$allowedLocationIds", count: { $sum: 1 } } }
  ]);
  const countMap = counts.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.count;
    return acc;
  }, {});

  return locations.map(loc => {
    loc.assignedUsersCount = countMap[loc._id.toString()] || 0;
    return serializeLocation(loc);
  });
}

/** Create a new location. */
export async function createLocation({ name, latitude, longitude, radius, address, description, isActive = true, req }) {
  const loc = await GeoLocation.create({
    name: name.trim(),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    radius: parseFloat(radius),
    address: (address || '').trim(),
    description: (description || '').trim(),
    isActive,
    createdBy: req?.user?._id || null,
    createdByName: req?.user?.displayName || '',
  });
  return serializeLocation(loc);
}

/** Update an existing location. */
export async function updateLocation(id, updates, req) {
  const ALLOWED = ['name', 'latitude', 'longitude', 'radius', 'address', 'description', 'isActive'];
  const safe = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      safe[key] = updates[key];
    }
  }
  if (safe.name) safe.name = safe.name.trim();
  if (safe.description !== undefined) safe.description = (safe.description || '').trim();

  const loc = await GeoLocation.findByIdAndUpdate(id, { $set: safe }, { new: true });
  if (!loc) return null;
  return serializeLocation(loc);
}

/** Delete a location. */
export async function deleteLocation(id) {
  const result = await GeoLocation.findByIdAndDelete(id);
  return !!result;
}

/** Get a single location by ID. */
export async function getLocationById(id) {
  const loc = await GeoLocation.findById(id).lean();
  return loc ? serializeLocation(loc) : null;
}

// ─── User location assignment ─────────────────────────────────────────────────

/**
 * Get all location assignments for a user.
 * Returns populated location objects.
 */
export async function getUserLocations(userId) {
  const user = await SystemUser.findById(userId)
    .select('allowedLocationIds')
    .populate('allowedLocationIds', 'name latitude longitude radius isActive description')
    .lean();

  if (!user) return [];
  return (user.allowedLocationIds || []).map(serializeLocation);
}

/**
 * Replace a user's allowed location assignments.
 * locationIds — array of GeoLocation ObjectId strings.
 */
export async function setUserLocations(userId, locationIds) {
  const user = await SystemUser.findByIdAndUpdate(
    userId,
    { $set: { allowedLocationIds: locationIds } },
    { new: true }
  )
    .select('allowedLocationIds')
    .populate('allowedLocationIds', 'name latitude longitude radius isActive description')
    .lean();

  if (!user) return null;
  return (user.allowedLocationIds || []).map(serializeLocation);
}

// ─── Audit log queries ────────────────────────────────────────────────────────

/** Paginated geo audit log for the admin view. */
export async function listGeoAuditLogs({
  organizationId = 'default',
  userId,
  result,
  page = 1,
  limit = 50,
} = {}) {
  const filter = { organizationId };
  if (userId) filter.userId = userId;
  if (result) filter.result = result;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [logs, total] = await Promise.all([
    GeoLoginAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    GeoLoginAuditLog.countDocuments(filter),
  ]);

  return {
    logs,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
}
