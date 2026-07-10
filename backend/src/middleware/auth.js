import jwt from 'jsonwebtoken';
import SystemUser from '../models/SystemUser.js';
import { PERMISSION_MODULE_LIST } from '../constants/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sams-dev-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ─── Simple in-process user cache ────────────────────────────────────────────
// Avoids hitting MongoDB + 4 populate() calls on every authenticated request.
// TTL: 60 seconds — short enough to pick up role/permission changes promptly.
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map(); // userId → { user, expiresAt }

function cacheGet(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function cacheSet(userId, user) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  // Evict stale entries if cache grows large (safety valve)
  if (userCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of userCache) {
      if (now > val.expiresAt) userCache.delete(key);
    }
  }
}

// Call this after updating a user's roles/permissions so the next request re-fetches
export function invalidateUserCache(userId) {
  if (userId) userCache.delete(userId.toString());
}
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_API_ROUTES = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/precheck' },
  { method: 'GET',  path: '/api/health' },
  { method: 'GET',  path: '/api/ping' },
  { method: 'GET',  prefix: '/api/passes/verify/' },
  { method: 'GET',  path: '/api/roles' },
  { method: 'GET',  prefix: '/api/forms/role/' },
  { method: 'POST', path: '/api/registrations' },
  { method: 'GET',  prefix: '/api/registrations/' },
  { method: 'PUT',  prefix: '/api/registrations/' },
  { method: 'POST', prefix: '/api/registrations/' },
];

function isPublicApiRoute(req) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return PUBLIC_API_ROUTES.some((route) => {
    if (route.method !== req.method) return false;
    if (route.path)   return path === route.path;
    if (route.prefix) return path.startsWith(route.prefix);
    return false;
  });
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      isSuperAdmin: Boolean(user.isSuperAdmin),
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function authenticateUnlessPublic(req, res, next) {
  const url = (req.originalUrl || req.url || '').split('?')[0];
  if (!url.startsWith('/api')) return next();
  if (isPublicApiRoute(req)) return next();
  return authenticate(req, res, next);
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify JWT first — cheap, synchronous, no DB
  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const userId = payload.sub;

  // ── Cache hit: skip DB round-trip entirely ─────────────────────────────
  const cached = cacheGet(userId);
  if (cached) {
    req.user = cached;
    return next();
  }

  // ── Cache miss: fetch from DB, populate, then cache ────────────────────
  try {
    const user = await SystemUser.findById(userId)
      .populate('systemRoleId', 'name slug permissions isActive')
      .populate('divisionIds', 'name slug')
      .populate('gateIds', 'name slug gateType divisionId')
      .populate('departmentIds', 'name slug')
      .select('-passwordHash');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    if (!user.isSuperAdmin && user.systemRoleId && !user.systemRoleId.isActive) {
      return res.status(403).json({ error: 'Assigned system role is inactive' });
    }

    cacheSet(userId, user);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function userHasPermission(user, module, action) {
  if (!PERMISSION_MODULE_LIST.includes(module)) return false;
  if (user.isSuperAdmin) return true;

  const role = user.systemRoleId;
  if (!role?.permissions) return false;

  const perms = role.permissions instanceof Map
    ? Object.fromEntries(role.permissions.entries())
    : role.permissions;

  const modulePerms = perms[module];
  if (!modulePerms) return false;
  if (action === 'read') return Boolean(modulePerms.read || modulePerms.write);
  return Boolean(modulePerms.write);
}

export function requirePermission(module, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (userHasPermission(req.user, module, action)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

function toIdString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
}

export function hasDivisionScope(user, divisionId) {
  if (user.isSuperAdmin) return true;
  if (!divisionId) return true;
  const target = toIdString(divisionId);
  return (user.divisionIds || []).some((id) => toIdString(id) === target);
}

export function hasDepartmentScope(user, departmentId) {
  if (user.isSuperAdmin) return true;
  if (!departmentId) return true;
  const target = toIdString(departmentId);
  return (user.departmentIds || []).some((id) => toIdString(id) === target);
}

export function hasGateScope(user, gateId) {
  if (user.isSuperAdmin) return true;
  if (!gateId) return true;
  const target = toIdString(gateId);
  return (user.gateIds || []).some((id) => toIdString(id) === target);
}

export function applyDivisionScopeFilter(user, filter = {}) {
  if (user.isSuperAdmin) return filter;
  const ids = user.divisionIds || [];
  if (ids.length === 0) {
    filter._id = { $in: [] };
    return filter;
  }
  filter._id = filter._id ? filter._id : { $in: ids };
  return filter;
}

export function applyDepartmentScopeFilter(user, filter = {}) {
  if (user.isSuperAdmin) return filter;
  const ids = user.departmentIds || [];
  if (ids.length === 0) {
    filter._id = { $in: [] };
    return filter;
  }
  if (filter.divisionIds) {
    filter._id = { $in: ids };
    return filter;
  }
  filter._id = { $in: ids };
  return filter;
}
