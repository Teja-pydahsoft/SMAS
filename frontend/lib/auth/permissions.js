export const PERMISSION_MODULES = [
  { key: 'gate', label: 'Entry & Exit' },
  { key: 'activity', label: 'Activity' },
  { key: 'divisions', label: 'Divisions' },
  { key: 'departments', label: 'Departments' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'registration_roles', label: 'Roles' },
  { key: 'projects', label: 'Project Portfolio' },
  { key: 'project_maintenance', label: 'Project Maintenance' },
  { key: 'project_photo_capture', label: 'Project Photo Capture' },
  { key: 'project_reports', label: 'Project Reports' },
  { key: 'reports', label: 'Reports' },
  { key: 'system_users', label: 'Manage Users' },
  { key: 'system_roles', label: 'Manage Roles' },
  { key: 'devices', label: 'Device Maintenance' },
  { key: 'locations', label: 'Geo Locations' },
  { key: 'geo_login_activity', label: 'Geo Login Activity' },
  { key: 'vehicle_registrations', label: 'Vehicle Registrations' },
  { key: 'vehicles', label: 'Vehicle Master' },
  { key: 'vehicle_reports', label: 'Vehicle Reports' },
  { key: 'equipment_movements', label: 'Vehicle Entry & Exit' },
  { key: 'payroll_rate_master', label: 'Payroll Calculation' },
];

/** Modules that can grant or manage other accounts — treat as privileged. */
export const SENSITIVE_PERMISSION_KEYS = ['system_roles', 'system_users'];

export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 60;

export function emptyPermissions() {
  return PERMISSION_MODULES.reduce((acc, { key }) => {
    acc[key] = { read: false, write: false };
    return acc;
  }, {});
}

/** Write always includes read (industry RBAC default). */
export function applyWriteImpliesRead(permissions) {
  const next = emptyPermissions();
  for (const { key } of PERMISSION_MODULES) {
    const value = permissions?.[key] || {};
    const write = Boolean(value.write);
    next[key] = {
      write,
      read: write || Boolean(value.read),
    };
  }
  return next;
}

export function summarizePermissions(permissions) {
  let readCount = 0;
  let writeCount = 0;
  for (const { key } of PERMISSION_MODULES) {
    const value = permissions?.[key];
    if (value?.write) writeCount += 1;
    else if (value?.read) readCount += 1;
  }
  return {
    readCount,
    writeCount,
    grantedCount: readCount + writeCount,
    total: PERMISSION_MODULES.length,
  };
}

export function hasElevatedPrivileges(permissions) {
  return SENSITIVE_PERMISSION_KEYS.some((key) => permissions?.[key]?.write);
}

export function validateRoleName(name, existingNames = []) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Role name is required';
  if (trimmed.length < ROLE_NAME_MIN) return `Role name must be at least ${ROLE_NAME_MIN} characters`;
  if (trimmed.length > ROLE_NAME_MAX) return `Role name must be ${ROLE_NAME_MAX} characters or fewer`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 &/()._-]*$/.test(trimmed)) {
    return 'Use letters, numbers, spaces, and basic punctuation only';
  }
  const taken = existingNames.some(
    (existing) => String(existing || '').trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (taken) return 'A role with this name already exists';
  return '';
}
