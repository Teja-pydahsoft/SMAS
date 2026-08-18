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

/**
 * Ignore a second granted punch for the same person / station / direction
 * within this window (double Capture, parallel requests, retries).
 */
export const DUPLICATE_SCAN_WINDOW_MS = 60 * 1000;

/** Fallback day-pass access window from gate check-in when no shift is assigned. */
export const DAY_PASS_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Working-window grace after the assigned shift ends. The session window is
 * shift end + this grace; past it the session is expired/overstayed and new
 * scans must start with a fresh gate entry.
 */
export const SHIFT_OVERSTAY_GRACE_MS = 4 * 60 * 60 * 1000;

/** How often the backend checks for overstayed open sessions. */
export const OVERSTAY_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum gap between repeated overstay push notifications for the same worker. */
export const OVERSTAY_RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;

/** Minimum on-site hours required for a day to count as attendance (else Absent). */
export const MIN_ATTENDANCE_HOURS = 1;

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

export const PROJECT_TYPES = {
  UNIVERSAL: 'universal',
  DEPARTMENT_SPECIFIC: 'department_specific',
  DIVISION_SPECIFIC: 'division_specific',
};

export const PROJECT_TYPE_LIST = Object.values(PROJECT_TYPES);

export const PROJECT_TYPE_LABELS = {
  universal: 'Universal',
  department_specific: 'Department Specific',
  division_specific: 'Division Specific',
};

export const PROJECT_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  ARCHIVED: 'archived',
};

export const PROJECT_STATUS_LIST = Object.values(PROJECT_STATUSES);

export const PROJECT_STATUS_LABELS = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
  archived: 'Archived',
};

export const PROJECT_ASSIGNMENT_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  REMOVED: 'removed',
};

export const PROJECT_ASSIGNMENT_STATUS_LIST = Object.values(PROJECT_ASSIGNMENT_STATUSES);

// ─── Device Maintenance ───────────────────────────────────────────────────────

/** Approval lifecycle states for a registered device. */
export const DEVICE_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
};

export const DEVICE_STATUS_LIST = Object.values(DEVICE_STATUSES);

export const DEVICE_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  blocked: 'Blocked',
};

/**
 * Common operating-system strings used for UI dropdowns.
 * Not an exhaustive enum — stored values may differ.
 */
export const DEVICE_OS_LIST = [
  'Windows 11',
  'Windows 10',
  'Windows Server 2022',
  'Windows Server 2019',
  'macOS',
  'Ubuntu',
  'Debian',
  'CentOS',
  'Other Linux',
  'Other',
];

/** All actions recorded in the DeviceAuditLog. */
export const DEVICE_AUDIT_ACTIONS = {
  REGISTERED: 'registered',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
  UNBLOCKED: 'unblocked',
  DELETED: 'deleted',
  LOGIN_ATTEMPT: 'login_attempt',
  VALIDATION_FAILED: 'validation_failed',
  SETTINGS_UPDATED: 'settings_updated',
  BOOTSTRAP_APPROVED: 'bootstrap_approved',
};

export const DEVICE_AUDIT_ACTION_LIST = Object.values(DEVICE_AUDIT_ACTIONS);

export const DEVICE_AUDIT_ACTION_LABELS = {
  registered: 'Device Registered',
  approved: 'Device Approved',
  rejected: 'Device Rejected',
  blocked: 'Device Blocked',
  unblocked: 'Device Unblocked',
  deleted: 'Device Deleted',
  login_attempt: 'Login Attempt',
  validation_failed: 'Validation Failed',
  settings_updated: 'Settings Updated',
  bootstrap_approved: 'Bootstrap Approved (Initial Super Admin)',
};

// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_MODULES = {
  GATE: 'gate',
  ACTIVITY: 'activity',
  DIVISIONS: 'divisions',
  DEPARTMENTS: 'departments',
  REGISTRATIONS: 'registrations',
  REGISTRATION_ROLES: 'registration_roles',
  SHIFTS: 'shifts',
  PROJECTS: 'projects',
  REPORTS: 'reports',
  SYSTEM_USERS: 'system_users',
  SYSTEM_ROLES: 'system_roles',
  DEVICES: 'devices',
  LOCATIONS: 'locations',
  GEO_LOGIN_ACTIVITY: 'geo_login_activity',
  VEHICLE_TYPES: 'vehicle_types',
  VEHICLE_CATEGORIES: 'vehicle_categories',
  VEHICLE_REGISTRATIONS: 'vehicle_registrations',
  VEHICLES: 'vehicles',
  VEHICLE_ACTIVITY: 'vehicle_activity',
  VEHICLE_REPORTS: 'vehicle_reports',
  EQUIPMENT_MOVEMENTS: 'equipment_movements',
  IDLE_MONITORING: 'idle_monitoring',
  IDLE_REPORTS: 'idle_reports',
  IDLE_DASHBOARD: 'idle_dashboard',
};

export const PERMISSION_MODULE_LIST = Object.values(PERMISSION_MODULES);

export const PERMISSION_LABELS = {
  gate: 'Gate Entry / Exit',
  activity: 'Activity',
  divisions: 'Divisions',
  departments: 'Departments',
  registrations: 'Registrations',
  registration_roles: 'Registration Roles',
  shifts: 'Shifts',
  projects: 'Project Management',
  reports: 'Reports',
  system_users: 'System Users',
  system_roles: 'System Roles',
  devices: 'Device Maintenance',
  locations: 'Geo Location Access',
  geo_login_activity: 'Geo Login Audit',
  vehicle_types: 'Vehicle Types',
  vehicle_categories: 'Vehicle Categories',
  vehicle_registrations: 'Vehicle Registrations',
  vehicles: 'Vehicles',
  vehicle_activity: 'Vehicle Activity Log',
  vehicle_reports: 'Vehicle Reports',
  equipment_movements: 'Equipment Movements',
  idle_monitoring: 'Idle Monitoring',
  idle_reports: 'Idle Reports',
  idle_dashboard: 'Idle Dashboard',
};

export function emptyPermissions() {
  return PERMISSION_MODULE_LIST.reduce((acc, module) => {
    acc[module] = { read: false, write: false };
    return acc;
  }, {});
}

// ─── Geo Location Access Control ─────────────────────────────────────────────

/** All audit result types for geo login checks. */
export const GEO_AUDIT_RESULTS = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  BYPASSED: 'bypassed',
  ERROR: 'error',
  VERIFIED: 'verified',
};

export const GEO_AUDIT_RESULT_LIST = Object.values(GEO_AUDIT_RESULTS);

export const GEO_AUDIT_RESULT_LABELS = {
  allowed: 'Access Allowed',
  denied: 'Access Denied — Outside Radius',
  bypassed: 'Location Check Bypassed',
  error: 'System Error',
  verified: 'Location Verified (Continuous)',
};
