import { hasAssignedEntryExitScope } from '@/lib/auth/routing';

export const APP_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: null, section: 'GENERAL' },
  { path: '/access-scope', label: 'Gate Access', icon: 'gateAccess', module: 'gate', gateOnly: true, section: 'GENERAL' },
  { path: '/entry-exit', label: 'Entry & Exit', icon: 'entryExit', module: 'gate', section: 'GENERAL' },
  { path: '/equipment/movements', label: 'Vehicle Entry & Exit', icon: 'entryExit', module: 'equipment_movements', section: 'GENERAL' },
  { path: '/activity', label: 'Activity', icon: 'cameras', module: 'activity', section: 'GENERAL' },
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
      { path: '/shifts/manage', label: 'Shifts', module: 'shifts' },
    ],
  },
  {
    path: '/equipment/dashboard',
    label: 'Vehicle & Equipment',
    icon: 'cameras', // reusing an icon
    module: null,
    section: 'MANAGEMENT',
    children: [
      { path: '/vehicles/dashboard', label: 'Dashboard', icon: 'dashboard', module: 'vehicles' },
      { path: '/vehicles/registrations?status=Pending', label: 'Registrations', icon: 'registrations', module: 'vehicle_registrations' },
      { path: '/vehicles', label: 'Vehicle Master', icon: 'companies', module: 'vehicles' },
      { path: '/registrations?roleSlug=driver', label: 'Driver Registration', icon: 'registrations', module: 'registrations' },
      { path: '/equipment/movements', label: 'Entry & Exit', icon: 'entryExit', module: 'equipment_movements' },
      { path: '/vehicles/reports', label: 'Reports', icon: 'reports', module: 'vehicle_reports' },
    ],
  },
  {
    path: '/projects/create',
    label: 'Project Management',
    icon: 'projects',
    module: 'projects',
    section: 'MANAGEMENT',
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
    section: 'MANAGEMENT',
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
    path: '/payroll/rate-master',
    label: 'Payroll Calculation',
    icon: 'reports', // reusing an icon
    module: 'payroll_rate_master',
    section: 'MANAGEMENT',
    children: [
      { path: '/payroll/rate-master', label: 'Rate Master Setup', module: 'payroll_rate_master' },
      { path: '/payroll/pay-slips', label: 'Pay Slips & Locks', module: 'payroll_rate_master' },
      { path: '/payroll/attendance-changes', label: 'Attendance Change History', module: 'payroll_rate_master' },
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
      { path: '/system/audit-logs', label: 'Audit Logs', module: 'system_users' },
      { path: '/system/geo-login-activity', label: 'Geo Login Activity', module: 'geo_login_activity' },
      { path: '/system/devices/overview', label: 'Device Maintenance', module: 'devices' },
      { path: '/system/geo-locations', label: 'Geo Locations', module: 'locations' },
    ],
  },
];

function permissionKeyForNavItem(item) {
  return item.module || null;
}

function navItemToLeaf(item) {
  const key = permissionKeyForNavItem(item);
  if (!key) return null;
  return {
    key,
    label: item.label,
    id: `${item.path}::${item.label}`,
  };
}

/** Privilege matrix tree — same names, headers, and order as the sidebar. */
export function getPrivilegeTree() {
  const sections = new Map();

  for (const item of APP_NAV_ITEMS) {
    if (item.gateOnly || item.path === '/') continue;

    const section = item.section || 'OTHER';
    if (!sections.has(section)) sections.set(section, []);

    if (item.children?.length) {
      const children = item.children.map(navItemToLeaf).filter(Boolean);
      if (children.length === 0) continue;
      sections.get(section).push({
        title: item.label,
        items: children,
      });
      continue;
    }

    const leaf = navItemToLeaf(item);
    if (leaf) sections.get(section).push(leaf);
  }

  return Array.from(sections.entries()).map(([title, items]) => ({ title, items }));
}

function canReadModule(can, module) {
  return !module || can(module, 'read');
}

function isItemVisible(item, user, can, gateSessionUrl) {
  if (item.gateOnly) {
    if (user?.isSuperAdmin) return false;
    return hasAssignedEntryExitScope(user);
  }
  if (item.path === '/entry-exit') {
    if (user?.isSuperAdmin) return can('gate', 'read');
    return Boolean(gateSessionUrl);
  }

  const parentVisible =
    canReadModule(can, item.module) ||
    (item.altModule && can(item.altModule, 'read'));

  if (item.children?.length) {
    return parentVisible || item.children.some((child) => canReadModule(can, child.module));
  }

  return parentVisible;
}

export function getNavItemsForUser(user, can, gateSessionUrl) {
  return APP_NAV_ITEMS.filter((item) => isItemVisible(item, user, can, gateSessionUrl));
}

export function getUserRoleLabel(user) {
  if (user?.isSuperAdmin) return 'Super Admin';
  if (user?.systemRoleId?.name) return user.systemRoleId.name;
  return 'User';
}
