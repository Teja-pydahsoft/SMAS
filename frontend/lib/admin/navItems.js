/**
 * Super admin sidebar nav items.
 * Items with `children` render as an expandable group in the sidebar.
 */
export const SUPER_ADMIN_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate' },
  { path: '/activity', label: 'Activity', icon: 'cameras', module: 'activity' },
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
    ],
  },
  {
    path: '/projects/create',
    label: 'Project Management',
    icon: 'projects',
    module: 'projects',
    children: [
      { path: '/projects/create', label: 'Project Portfolio', module: 'projects' },
      { path: '/projects/maintenance', label: 'Project Maintenance', module: 'project_maintenance' },
      { path: '/projects/photo-capture', label: 'Project Photo Capture', module: 'project_photo_capture' },
      { path: '/projects/reports', label: 'Project Reports', module: 'project_reports' },
    ],
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: 'reports',
    module: 'reports',
    children: [
      { path: '/reports?tab=today', label: "Today's Activity", module: 'reports' },
      { path: '/reports?tab=division', label: 'Division Activity', module: 'reports' },
      { path: '/reports?tab=department', label: 'Department Activity', module: 'reports' },
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
      { path: '/system/devices/overview', label: 'Device Maintenance', module: 'devices' },
      { path: '/system/geo-locations', label: 'Geo Locations', module: 'locations' },
    ],
  },
];

/** @deprecated use SUPER_ADMIN_NAV_ITEMS */
export const ADMIN_NAV_ITEMS = SUPER_ADMIN_NAV_ITEMS;
