/**
 * Parse HH:mm (or HH:mm:ss) to minutes from midnight.
 * @returns {number|null}
 */
export function timeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.trim().split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Total shift duration in hours from start/end (HH:mm).
 * Overnight windows (end <= start) wrap past midnight.
 * @returns {number|null}
 */
export function getShiftDurationHours(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  let durationMinutes = end - start;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  // Keep one decimal place max for display/compare (e.g. 6.5)
  return Math.round((durationMinutes / 60) * 100) / 100;
}

export function formatDurationHours(hours) {
  if (hours === null || hours === undefined) return '';
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Format HH:mm (24h) as 12-hour clock, e.g. "09:00" → "9:00 AM".
 */
export function formatShiftTime(value) {
  if (!value) return null;
  const [hStr, mStr] = String(value).split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(value);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Format assigned shift window, e.g. "9:00 AM – 6:00 PM".
 */
export function formatShiftWindow(startTime, endTime) {
  const start = formatShiftTime(startTime);
  const end = formatShiftTime(endTime);
  if (start && end) return `${start} – ${end}`;
  return start || end || null;
}

/**
 * Validate half/full day mins against shift window.
 * @returns {string|null} error message or null if ok
 */
export function validateShiftMinHours({ startTime, endTime, halfDayMinHours, fullDayMinHours }) {
  const totalHours = getShiftDurationHours(startTime, endTime);
  if (totalHours === null) return 'Enter valid shift start and end times';

  if (halfDayMinHours !== null && halfDayMinHours !== undefined) {
    if (Number.isNaN(halfDayMinHours) || halfDayMinHours < 0) {
      return 'Half day minimum hours must be a non-negative number';
    }
    if (halfDayMinHours > totalHours) {
      return `Half day minimum hours (${halfDayMinHours}) cannot exceed shift total hours (${formatDurationHours(totalHours)})`;
    }
  }

  if (fullDayMinHours !== null && fullDayMinHours !== undefined) {
    if (Number.isNaN(fullDayMinHours) || fullDayMinHours < 0) {
      return 'Full day minimum hours must be a non-negative number';
    }
    if (fullDayMinHours > totalHours) {
      return `Full day minimum hours (${fullDayMinHours}) cannot exceed shift total hours (${formatDurationHours(totalHours)})`;
    }
  }

  if (
    halfDayMinHours !== null &&
    halfDayMinHours !== undefined &&
    fullDayMinHours !== null &&
    fullDayMinHours !== undefined &&
    halfDayMinHours > fullDayMinHours
  ) {
    return 'Half day minimum hours cannot exceed full day minimum hours';
  }

  return null;
}
