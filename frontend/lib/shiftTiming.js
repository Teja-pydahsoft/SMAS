/**
 * Parse HH:mm (or HH:mm:ss) to minutes from midnight.
 * Kept for legacy shift documents that still have start/end.
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
 * Duration from legacy start/end (HH:mm). Overnight windows wrap past midnight.
 * @returns {number|null}
 */
export function durationFromStartEnd(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  let durationMinutes = end - start;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return Math.round((durationMinutes / 60) * 100) / 100;
}

/**
 * Resolve shift total hours from `totalHours`, with legacy start/end fallback.
 * Accepts either (shiftOrTotal, endTime?) for backward compatibility.
 * @returns {number|null}
 */
export function getShiftDurationHours(shiftOrTotal, endTime) {
  if (shiftOrTotal != null && typeof shiftOrTotal === 'object') {
    const direct = Number(shiftOrTotal.totalHours);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.round(direct * 100) / 100;
    }
    return durationFromStartEnd(
      shiftOrTotal.startTime || shiftOrTotal.shiftStartTime,
      shiftOrTotal.endTime || shiftOrTotal.shiftEndTime
    );
  }

  if (typeof shiftOrTotal === 'number' || (typeof shiftOrTotal === 'string' && endTime === undefined)) {
    const direct = Number(shiftOrTotal);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.round(direct * 100) / 100;
    }
    return null;
  }

  return durationFromStartEnd(shiftOrTotal, endTime);
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
 * Format shift for display: "8h" or legacy "9:00 AM – 6:00 PM".
 */
export function formatShiftHoursLabel(shift) {
  const total = getShiftDurationHours(shift);
  if (total != null) return `${formatDurationHours(total)}h`;
  const start = formatShiftTime(shift?.startTime);
  const end = formatShiftTime(shift?.endTime);
  if (start && end) return `${start} – ${end}`;
  return null;
}

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Current time-of-day in IST as minutes from midnight,
 * independent of the device's local timezone.
 */
export function currentIstMinutes(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const [h, m] = formatted.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Classify an assigned shift for the Activity monitor.
 * Without a clock window, assigned shifts show as "Shift assigned".
 * @param {{shiftId?: string, totalHours?: number, shiftStartTime?: string, shiftEndTime?: string}|null} shift
 * @returns {{status: 'on'|'off'|'unknown'|'none', label: string}}
 */
export function getShiftStatus(shift) {
  if (!shift || !shift.shiftId) return { status: 'none', label: 'No shift' };
  const total = getShiftDurationHours(shift);
  if (total != null) {
    return { status: 'on', label: `Shift · ${formatDurationHours(total)}h` };
  }
  return { status: 'unknown', label: 'Shift assigned' };
}

/**
 * Format assigned shift window (legacy) or total hours.
 */
export function formatShiftWindow(startTimeOrShift, endTime) {
  if (startTimeOrShift != null && typeof startTimeOrShift === 'object') {
    return formatShiftHoursLabel(startTimeOrShift);
  }
  const start = formatShiftTime(startTimeOrShift);
  const end = formatShiftTime(endTime);
  if (start && end) return `${start} – ${end}`;
  return start || end || null;
}

/**
 * Validate total / half / full day hours.
 * @returns {string|null} error message or null if ok
 */
export function validateShiftMinHours({ totalHours, halfDayMinHours, fullDayMinHours }) {
  const total = Number(totalHours);
  if (!Number.isFinite(total) || total <= 0) {
    return 'Total hours must be a positive number';
  }

  if (halfDayMinHours !== null && halfDayMinHours !== undefined) {
    if (Number.isNaN(halfDayMinHours) || halfDayMinHours < 0) {
      return 'Half day minimum hours must be a non-negative number';
    }
    if (halfDayMinHours > total) {
      return `Half day minimum hours (${halfDayMinHours}) cannot exceed shift total hours (${formatDurationHours(total)})`;
    }
  }

  if (fullDayMinHours !== null && fullDayMinHours !== undefined) {
    if (Number.isNaN(fullDayMinHours) || fullDayMinHours < 0) {
      return 'Full day minimum hours must be a non-negative number';
    }
    if (fullDayMinHours > total) {
      return `Full day minimum hours (${fullDayMinHours}) cannot exceed shift total hours (${formatDurationHours(total)})`;
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
