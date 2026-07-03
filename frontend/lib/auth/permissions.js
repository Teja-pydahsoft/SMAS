export const PERMISSION_MODULES = [
  { key: 'gate', label: 'Gate Entry / Exit' },
  { key: 'divisions', label: 'Divisions' },
  { key: 'departments', label: 'Departments' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'registration_roles', label: 'Registration Roles' },
  { key: 'reports', label: 'Reports' },
  { key: 'system_users', label: 'System Users' },
  { key: 'system_roles', label: 'System Roles' },
];

export function emptyPermissions() {
  return PERMISSION_MODULES.reduce((acc, { key }) => {
    acc[key] = { read: false, write: false };
    return acc;
  }, {});
}
