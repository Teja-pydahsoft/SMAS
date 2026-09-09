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

/** Active employees (not super admin) must be signed out after 9pm IST. */
export function shouldAutoLogoutEmployee(user, date = new Date()) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;
  if (user.isActive === false) return false;
  return isPastEmployeeAutoLogoutHour(date);
}
