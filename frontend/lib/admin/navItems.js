/**
 * Super admin sidebar nav items.
 * Items with `children` render as an expandable group in the sidebar.
 */
export const SUPER_ADMIN_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate' },
  { path: '/roles', label: 'Roles', icon: 'roles', module: 'registration_roles' },
  { path: '/registrations', label: 'Registrations', icon: 'registrations', module: 'registrations' },
  {
    path: '/organization',
    label: 'Organization',
    icon: 'organization',
    module: 'divisions',
    altModule: 'departments',
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
    children: [
      { path: '/reports?tab=today', label: "Today's Activity", module: 'reports' },
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
    children: [
      { path: '/system/roles/manage', label: 'Manage Roles', module: 'system_roles' },
      { path: '/system/users/manage', label: 'Manage Users', module: 'system_users' },
    ],
  },
];

/** @deprecated use SUPER_ADMIN_NAV_ITEMS */
export const ADMIN_NAV_ITEMS = SUPER_ADMIN_NAV_ITEMS;
