import { hasAssignedEntryExitScope } from '@/lib/auth/routing';

export const APP_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null },
  { path: '/access-scope', label: 'Gate Access', icon: 'gateAccess', module: 'gate', gateOnly: true },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate' },
  { path: '/roles', label: 'Roles', icon: 'roles', module: 'registration_roles' },
  { path: '/registrations', label: 'Registrations', icon: 'registrations', module: 'registrations' },
  { path: '/shifts', label: 'Shifts', icon: 'shifts', module: 'shifts' },
  { path: '/divisions', label: 'Divisions', icon: 'divisions', module: 'divisions' },
  { path: '/departments', label: 'Departments', icon: 'departments', module: 'departments' },
  { path: '/reports', label: 'Reports', icon: 'reports', module: 'reports' },
  {
    path: '/system/users/manage',
    label: 'System Access',
    icon: 'system',
    module: 'system_users',
    altModule: 'system_roles',
  },
];

export function getNavItemsForUser(user, can, gateSessionUrl) {
  return APP_NAV_ITEMS.filter((item) => {
    if (item.gateOnly) {
      if (user?.isSuperAdmin) return false;
      return hasAssignedEntryExitScope(user);
    }
    if (item.path === '/entry-exit') {
      if (user?.isSuperAdmin) return can('gate', 'read');
      return Boolean(gateSessionUrl);
    }
    if (!item.module) return true;
    if (can(item.module, 'read')) return true;
    if (item.altModule && can(item.altModule, 'read')) return true;
    return false;
  });
}

export function getUserRoleLabel(user) {
  if (user?.isSuperAdmin) return 'Super Admin';
  if (user?.systemRoleId?.name) return user.systemRoleId.name;
  return 'User';
}
