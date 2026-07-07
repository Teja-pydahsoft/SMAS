import { hasPermission } from '@/lib/auth/session';
import { buildEntryExitUrl } from '@/lib/entryExit';
import { getGateSession } from '@/lib/gateSession';

export const MODULE_ROUTES = [
  { module: 'gate', path: '/access-scope', label: 'Gate Access' },
  { module: 'gate', path: '/entry-exit', label: 'Entry & Exit' },
  { module: 'divisions', path: '/divisions/manage', label: 'Divisions' },
  { module: 'departments', path: '/departments/manage', label: 'Departments' },
  { module: 'registrations', path: '/registrations/manage', label: 'Registrations' },
  { module: 'registration_roles', path: '/roles/manage', label: 'Registration Roles' },
  { module: 'shifts', path: '/shifts/manage', label: 'Shifts' },
  { module: 'reports', path: '/reports', label: 'Reports' },
  { module: 'system_users', path: '/system/users/manage', label: 'System Users' },
  { module: 'system_roles', path: '/system/roles/manage', label: 'System Roles' },
];

export function getAccessibleModules(user) {
  return MODULE_ROUTES.filter(({ module, path }) => {
    if (module === 'gate') {
      if (path === '/entry-exit') {
        if (user?.isSuperAdmin) return hasPermission(user, module, 'read');
        return false;
      }
      if (path === '/access-scope') {
        if (user?.isSuperAdmin) return false;
        return hasAssignedEntryExitScope(user);
      }
    }
    return hasPermission(user, module, 'read');
  });
}

export function getDashboardRoute() {
  return '/';
}

/**
 * Gate landing is only for non–super-admin users who were assigned
 * specific gates or departments in System User management.
 */
export function hasAssignedEntryExitScope(user) {
  if (!user || user.isSuperAdmin) return false;
  if (!hasPermission(user, 'gate', 'read')) return false;

  const gateIds = user.gateIds || [];
  const departmentIds = user.departmentIds || [];
  return gateIds.length > 0 || departmentIds.length > 0;
}

export function getPostLoginRoute(user) {
  if (!user) return '/login';

  if (typeof window !== 'undefined') {
    const gateSession = getGateSession();
    if (gateSession) {
      return buildEntryExitUrl(gateSession);
    }
  }

  if (user.isSuperAdmin) return getDashboardRoute();
  if (hasAssignedEntryExitScope(user)) return '/access-scope';
  return getDashboardRoute();
}

export function getHomeRoute(user) {
  return getPostLoginRoute(user);
}
