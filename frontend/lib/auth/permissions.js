export const PERMISSION_MODULES = [
  { key: 'gate', label: 'Gate Entry / Exit' },
  { key: 'activity', label: 'Activity' },
  { key: 'divisions', label: 'Divisions' },
  { key: 'departments', label: 'Departments' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'registration_roles', label: 'Registration Roles' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'projects', label: 'Project Management' },
  { key: 'reports', label: 'Reports' },
  { key: 'system_users', label: 'System Users' },
  { key: 'system_roles', label: 'System Roles' },
  { key: 'devices', label: 'Device Maintenance' },
  { key: 'locations', label: 'Geo Location Access' },
];

export function emptyPermissions() {
  return PERMISSION_MODULES.reduce((acc, { key }) => {
    acc[key] = { read: false, write: false };
    return acc;
  }, {});
}
