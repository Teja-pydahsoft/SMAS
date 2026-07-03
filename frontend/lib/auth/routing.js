import { PERMISSION_MODULES } from '@/lib/auth/permissions';
import { hasPermission } from '@/lib/auth/session';

export const MODULE_ROUTES = [
  { module: 'gate', path: '/gate', label: 'Gate Entry / Exit' },
  { module: 'divisions', path: '/divisions/manage', label: 'Divisions' },
  { module: 'departments', path: '/departments/manage', label: 'Departments' },
  { module: 'registrations', path: '/registrations/manage', label: 'Registrations' },
  { module: 'registration_roles', path: '/roles/manage', label: 'Registration Roles' },
  { module: 'reports', path: '/reports', label: 'Reports' },
  { module: 'system_users', path: '/system/users/manage', label: 'System Users' },
  { module: 'system_roles', path: '/system/roles/manage', label: 'System Roles' },
];

export function getAccessibleModules(user) {
  return MODULE_ROUTES.filter(({ module }) => hasPermission(user, module, 'read'));
}

export function getHomeRoute() {
  return '/';
}
