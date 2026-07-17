import { hasAssignedEntryExitScope } from '@/lib/auth/routing';

export const APP_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null, section: 'GENERAL' },
  { path: '/access-scope', label: 'Gate Access', icon: 'gateAccess', module: 'gate', gateOnly: true, section: 'GENERAL' },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate', section: 'GENERAL' },
  { path: '/roles', label: 'Roles', icon: 'roles', module: 'registration_roles', section: 'MANAGEMENT' },
  { path: '/registrations', label: 'Registrations', icon: 'registrations', module: 'registrations', section: 'MANAGEMENT' },
  {
    path: '/organization',
    label: 'Organization',
    icon: 'organization',
    module: 'divisions',
    altModule: 'departments',
    section: 'MANAGEMENT',
    children: [
      { path: '/organization?tab=divisions', label: 'Divisions', module: 'divisions' },
      { path: '/organization?tab=departments', label: 'Departments', module: 'departments' },
      { path: '/organization?tab=shifts', label: 'Shifts', module: 'shifts' },
    ],
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: 'reports',
    module: 'reports',
    section: 'MANAGEMENT',
    children: [
      { path: '/reports?tab=today', label: "Today's Activity", module: 'reports' },
      { path: '/reports?tab=division', label: 'Division Activity', module: 'reports' },
      { path: '/reports?tab=history', label: 'Attendance History', module: 'reports' },
      { path: '/reports?tab=analytics', label: 'Analytics', module: 'reports' },
      { path: '/reports?tab=export', label: 'Export Center', module: 'reports' },
    ],
  },
  {
    path: '/system/users/manage',
    label: 'System Access',
    icon: 'system',
    module: 'system_users',
    altModule: 'system_roles',
    section: 'SETTINGS',
    children: [
      { path: '/system/roles/manage', label: 'Manage Roles', module: 'system_roles' },
      { path: '/system/users/manage', label: 'Manage Users', module: 'system_users' },
    ],
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
