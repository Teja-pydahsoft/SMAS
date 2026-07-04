import { userHasPermission } from '../middleware/auth.js';

/**
 * Non–super-admin users assigned specific gates or departments for entry/exit.
 */
export function hasAssignedEntryExitScope(user) {
  if (!user || user.isSuperAdmin) return false;
  if (!userHasPermission(user, 'gate', 'read')) return false;

  const gateIds = user.gateIds || [];
  const departmentIds = user.departmentIds || [];
  return gateIds.length > 0 || departmentIds.length > 0;
}

/**
 * Login precheck flow type:
 * - standard: username then password (super admin and general users)
 * - gate: username → gate selection → password
 */
export function getLoginFlow(user) {
  if (!user || !user.isActive) return 'standard';
  if (user.isSuperAdmin) return 'standard';
  if (hasAssignedEntryExitScope(user)) return 'gate';
  return 'standard';
}
