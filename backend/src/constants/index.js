export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox', 'media'];

export const PAY_FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom_days'];

export const PAY_FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom_days: 'Custom Days',
};

export const GENDERS = ['male', 'female'];

export const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
};

/** Prefix letter for registration codes by pay frequency (e.g. DM0001). */
export const PAY_FREQUENCY_CODE_LETTERS = {
  daily: 'D',
  weekly: 'W',
  monthly: 'M',
  custom_days: 'C',
};

export const GENDER_CODE_LETTERS = {
  male: 'M',
  female: 'F',
};

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

/** Minimum time after check-in before check-out is allowed (gate and department). */
export const MIN_CHECKOUT_INTERVAL_MS = 2 * 60 * 1000;

export const SCAN_TYPES = {
  GATE: 'gate',
  DEPARTMENT: 'department',
  QR: 'qr',
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
  SHIFTS: 'shifts',
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
  shifts: 'Shifts',
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
