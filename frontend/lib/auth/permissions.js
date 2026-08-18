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
  { key: 'geo_login_activity', label: 'Geo Login Audit' },
  { key: 'vehicle_types', label: 'Vehicle Types' },
  { key: 'vehicle_categories', label: 'Vehicle Categories' },
  { key: 'vehicle_registrations', label: 'Vehicle Registrations' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'vehicle_activity', label: 'Vehicle Activity Log' },
  { key: 'vehicle_reports', label: 'Vehicle Reports' },
  { key: 'equipment_movements', label: 'Equipment Movements' },
  { key: 'idle_monitoring', label: 'Idle Monitoring' },
  { key: 'idle_reports', label: 'Idle Reports' },
  { key: 'idle_dashboard', label: 'Idle Dashboard' },
];

export function emptyPermissions() {
  return PERMISSION_MODULES.reduce((acc, { key }) => {
    acc[key] = { read: false, write: false };
    return acc;
  }, {});
}
