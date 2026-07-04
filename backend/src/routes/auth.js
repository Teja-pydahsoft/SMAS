import { Router } from 'express';
import bcrypt from 'bcryptjs';
import SystemUser from '../models/SystemUser.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { getUserAccessScope } from '../services/accessScopeService.js';
import { getLoginFlow } from '../services/loginFlowService.js';
import { userHasPermission } from '../middleware/auth.js';

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

router.post(
  '/precheck',
  asyncHandler(async (req, res) => {
    const { username } = req.body;
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const user = await SystemUser.findOne({ username: username.toLowerCase().trim() })
      .populate('systemRoleId', 'name slug permissions isActive')
      .populate('divisionIds', 'name slug')
      .populate('gateIds', 'name slug gateType divisionId')
      .populate('departmentIds', 'name slug');

    if (!user || !user.isActive) {
      return res.json({ flow: 'standard' });
    }

    if (!user.isSuperAdmin && user.systemRoleId && !user.systemRoleId.isActive) {
      return res.json({ flow: 'standard' });
    }

    const flow = getLoginFlow(user);

    if (flow === 'gate') {
      const scope = await getUserAccessScope(user);
      const hasScopeItems = (scope.divisions || []).some(
        (d) => (d.gates || []).length > 0 || (d.departments || []).length > 0
      );

      if (!hasScopeItems) {
        return res.json({
          flow: 'standard',
          displayName: user.displayName,
        });
      }

      return res.json({
        flow: 'gate',
        displayName: user.displayName,
        canGateWrite: userHasPermission(user, 'gate', 'write'),
        accessScope: scope,
      });
    }

    res.json({
      flow: 'standard',
      displayName: user.displayName,
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await SystemUser.findOne({ username: username.toLowerCase().trim() })
      .select('+passwordHash')
      .populate('systemRoleId', 'name slug permissions isActive')
      .populate('divisionIds', 'name slug')
      .populate('gateIds', 'name slug gateType divisionId')
      .populate('departmentIds', 'name slug');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.isSuperAdmin && user.systemRoleId && !user.systemRoleId.isActive) {
      return res.status(403).json({ error: 'Your assigned role is inactive. Contact an administrator.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

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

export default router;
