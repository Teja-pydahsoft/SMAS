export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox'];

export const REGISTRATION_STAGES = {
  FORM: 'form',
  PHOTO: 'photo',
  REVIEW: 'review',
  COMPLETED: 'completed',
};

export const REGISTRATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  PENDING_VERIFICATION: 'pending_verification',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const GATE_EVENT_TYPES = {
  ENTRY: 'entry',
  EXIT: 'exit',
  AUTO: 'auto',
};

export const SCAN_TYPES = {
  GATE: 'gate',
  DEPARTMENT: 'department',
};

export const GATE_TYPES = {
  ENTRY: 'entry',
  EXIT: 'exit',
  BOTH: 'both',
};

export const PASS_TYPES = {
  REGISTRATION: 'registration',
  DAY_PASS: 'day_pass',
};

export const PERMISSION_MODULES = {
  GATE: 'gate',
  DIVISIONS: 'divisions',
  DEPARTMENTS: 'departments',
  REGISTRATIONS: 'registrations',
  REGISTRATION_ROLES: 'registration_roles',
  REPORTS: 'reports',
  SYSTEM_USERS: 'system_users',
  SYSTEM_ROLES: 'system_roles',
};

export const PERMISSION_MODULE_LIST = Object.values(PERMISSION_MODULES);

export const PERMISSION_LABELS = {
  gate: 'Gate Entry / Exit',
  divisions: 'Divisions',
  departments: 'Departments',
  registrations: 'Registrations',
  registration_roles: 'Registration Roles',
  reports: 'Reports',
  system_users: 'System Users',
  system_roles: 'System Roles',
};

export function emptyPermissions() {
  return PERMISSION_MODULE_LIST.reduce((acc, module) => {
    acc[module] = { read: false, write: false };
    return acc;
  }, {});
}
