/**
 * Super admin sidebar — same routes as the standard app sidebar.
 * Gate Access is omitted; super admin uses Entry & Exit directly.
 */
export const SUPER_ADMIN_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate' },
  { path: '/roles', label: 'Roles', icon: 'roles', module: 'registration_roles' },
  { path: '/registrations', label: 'Registrations', icon: 'registrations', module: 'registrations' },
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

/** @deprecated use SUPER_ADMIN_NAV_ITEMS */
export const ADMIN_NAV_ITEMS = SUPER_ADMIN_NAV_ITEMS;
