import { Router } from 'express';
import bcrypt from 'bcryptjs';
import SystemUser from '../models/SystemUser.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { getUserAccessScope } from '../services/accessScopeService.js';
import { getLoginFlow } from '../services/loginFlowService.js';
import { userHasPermission } from '../middleware/auth.js';
import {
  hasPrimaryAdminDevice,
  bootstrapApproveDevice,
  getOrCreateSettings,
} from '../services/deviceService.js';

const router = Router();

function serializeUser(user) {
  const role = user.systemRoleId;
  const permissions =
    user.isSuperAdmin || !role
      ? null
      : role.permissions instanceof Map
        ? Object.fromEntries(role.permissions.entries())
        : role.permissions;

  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    divisionIds: user.divisionIds,
    gateIds: user.gateIds,
    gateAccessModes:
      user.gateAccessModes instanceof Map
        ? Object.fromEntries(user.gateAccessModes.entries())
        : user.gateAccessModes || {},
    departmentIds: user.departmentIds,
    systemRoleId: role
      ? {
          _id: role._id,
          name: role.name,
          slug: role.slug,
          permissions,
        }
      : null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Shared query builder ────────────────────────────────────────────────────
// Lean query for precheck (no passwordHash needed, lean object is faster)
function userQueryLean(username) {
  return SystemUser.findOne({ username: username.toLowerCase().trim() })
    .populate('systemRoleId', 'name slug permissions isActive')
    .populate('divisionIds', 'name slug')
    .populate('gateIds', 'name slug gateType divisionId')
    .populate('departmentIds', 'name slug');
}

// ─── /precheck ───────────────────────────────────────────────────────────────
// Optimised: skip full scope fetch for standard-flow users
router.post(
  '/precheck',
  asyncHandler(async (req, res) => {
    const { username } = req.body;
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Minimal projection for users that will end up on standard flow
    const user = await SystemUser.findOne({ username: username.toLowerCase().trim() })
      .select('displayName isActive isSuperAdmin systemRoleId gateIds gateAccessModes departmentIds divisionIds')
      .populate('systemRoleId', 'name slug permissions isActive')
      .populate('gateIds', '_id')          // only need IDs to check length
      .populate('departmentIds', '_id');   // only need IDs to check length

    if (!user || !user.isActive) {
      return res.json({ flow: 'standard', isSuperAdmin: false });
    }

    if (!user.isSuperAdmin && user.systemRoleId && !user.systemRoleId.isActive) {
      return res.json({ flow: 'standard', isSuperAdmin: false });
    }

    const flow = getLoginFlow(user);

    if (flow !== 'gate') {
      // Standard flow — no scope fetch needed at all
      return res.json({ flow: 'standard', displayName: user.displayName, isSuperAdmin: user.isSuperAdmin });
    }

    // Gate flow — now fetch full scope (only reached for gate operators)
    const fullUser = await userQueryLean(username);
    const scope = await getUserAccessScope(fullUser);
    const hasScopeItems = (scope.divisions || []).some(
      (d) => (d.gates || []).length > 0 || (d.departments || []).length > 0
    );

    if (!hasScopeItems) {
      return res.json({ flow: 'standard', displayName: user.displayName, isSuperAdmin: user.isSuperAdmin });
    }

    return res.json({
      flow: 'gate',
      displayName: user.displayName,
      isSuperAdmin: user.isSuperAdmin,
      canGateWrite: userHasPermission(fullUser, 'gate', 'write'),
      accessScope: scope,
    });
  })
);

// ─── /verify-location ────────────────────────────────────────────────────────
router.post(
  '/verify-location',
  asyncHandler(async (req, res) => {
    const { username, latitude, longitude, accuracy, timestamp } = req.body;
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const user = await SystemUser.findOne({ username: username.toLowerCase().trim() })
      .select('isSuperAdmin displayName username allowedLocationIds isActive')
      .populate('allowedLocationIds', '_id name latitude longitude radius isActive')
      .lean();

    if (!user || !user.isActive) {
      // We simulate access denied to avoid user enumeration if they somehow bypass the UI
      return res.status(403).json({ error: 'Access denied. You are outside the permitted organization location.' });
    }

    // Dynamic import to avoid circular dependencies if any, though auth.js can import from geoLocationService
    const { verifyGeoAccess } = await import('../services/geoLocationService.js');
    const result = await verifyGeoAccess({ user, latitude, longitude, req });

    if (!result.ok) {
      return res.status(403).json({
        error: result.message || 'Access denied. You are outside the permitted organization location.',
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

// ─── /login ──────────────────────────────────────────────────────────────────
// Optimised: run bcrypt + DB fetch in parallel, update lastLoginAt without blocking
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password, fingerprint } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Fetch user with passwordHash — run concurrently with nothing else yet
    const user = await SystemUser.findOne({ username: username.toLowerCase().trim() })
      .select('+passwordHash displayName email isActive isSuperAdmin divisionIds gateIds gateAccessModes departmentIds lastLoginAt createdAt updatedAt')
      .populate('systemRoleId', 'name slug permissions isActive')
      .populate('divisionIds', 'name slug')
      .populate('gateIds', 'name slug gateType divisionId')
      .populate('departmentIds', 'name slug');

    if (!user || !user.isActive) {
      // Still run a dummy bcrypt to prevent timing-based username enumeration
      await bcrypt.compare(password, '$2b$10$dummyhashfordummycompareXXXXXXXXXXXXXXXXXXXXXXXX');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.isSuperAdmin && user.systemRoleId && !user.systemRoleId.isActive) {
      return res.status(403).json({ error: 'Your assigned role is inactive. Contact an administrator.' });
    }

    // ── Bootstrap: auto-approve the very first Super Admin device ────────────
    // Only runs when Device Maintenance Mode is enabled.
    // Conditions (ALL must be true):
    //   1. Device Maintenance Mode is ON.
    //   2. Authenticating user is a Super Admin.
    //   3. A device fingerprint was supplied in the login body.
    //   4. No approved Super Admin device exists yet (fresh installation).
    if (user.isSuperAdmin && fingerprint) {
      try {
        const settings = await getOrCreateSettings('default');
        if (settings.deviceMaintenanceEnabled) {
          const hasPrimary = await hasPrimaryAdminDevice('default');
          if (!hasPrimary) {
            const bootstrapResult = await bootstrapApproveDevice({
              fingerprint,
              req,
              organizationId: 'default',
            });
            if (bootstrapResult.ok && bootstrapResult.bootstrapped) {
              console.log(
                `[Bootstrap] Super Admin "${user.username}" — device auto-approved on first login.`
              );
            }
          }
        }
      } catch (err) {
        // Bootstrap failure must never block login — log and continue
        console.warn('[Bootstrap] device approval failed (non-fatal):', err.message);
      }
    }

    // Fire-and-forget lastLoginAt update — do NOT await, never block the response
    SystemUser.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).catch(() => {});

    const token = signToken(user);
    res.json({ token, user: serializeUser(user) });
  })
);

router.post(
  '/verify-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await SystemUser.findById(req.user._id).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({ ok: true });
  })
);

router.get(
  '/access-scope',
  authenticate,
  asyncHandler(async (req, res) => {
    const scope = await getUserAccessScope(req.user);
    res.json(scope);
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(serializeUser(req.user));
  })
);

router.put(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({ error: 'Password and confirmation are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const user = await SystemUser.findById(req.user._id).select('+passwordHash');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();

    res.json({ ok: true, message: 'Password updated successfully' });
  })
);

export default router;
