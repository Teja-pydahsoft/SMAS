/** Mirror of backend employee auto-logout (Asia/Kolkata, default 21:00). */
export const EMPLOYEE_AUTO_LOGOUT_HOUR = 21;
export const IST_TIMEZONE = 'Asia/Kolkata';

export function currentHourIst(date = new Date()) {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const hour = Number(hourStr);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

export function isPastEmployeeAutoLogoutHour(date = new Date()) {
  return currentHourIst(date) >= EMPLOYEE_AUTO_LOGOUT_HOUR;
}

export function isJattuUser(user) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;

  const directSlug = String(user.roleSlug || user.role || '').toLowerCase();
  const directName = String(user.roleName || '').toLowerCase();
  if (directSlug === 'jattu' || directName.includes('jattu')) return true;

  const role = user.systemRoleId;
  if (role && typeof role === 'object') {
    const slug = String(role.slug || '').toLowerCase();
    const name = String(role.name || '').toLowerCase();
    if (slug === 'jattu' || name.includes('jattu')) return true;

    const perms = role.permissions || {};
    const jattuKeys = [
      'jattu',
      'jattu_registrations',
      'jattu_entry_exit',
      'jattu_activity',
      'jattu_attendance',
    ];
    if (jattuKeys.some((key) => Boolean(perms[key]?.read || perms[key]?.write))) {
      return true;
    }
  }

  if (user.permissions && typeof user.permissions === 'object') {
    const jattuKeys = [
      'jattu',
      'jattu_registrations',
      'jattu_entry_exit',
      'jattu_activity',
      'jattu_attendance',
    ];
    if (jattuKeys.some((key) => Boolean(user.permissions[key]?.read || user.permissions[key]?.write))) {
      return true;
    }
  }

  return false;
}

/** Active JATTU employees (not super admin) must be signed out after 9pm IST. */
export function shouldAutoLogoutEmployee(user, date = new Date()) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;
  if (user.isActive === false) return false;
  if (!isJattuUser(user)) return false;
  return isPastEmployeeAutoLogoutHour(date);
}

