import { DAY_PASS_DURATION_MS, SHIFT_OVERSTAY_GRACE_MS } from '../constants/index.js';

/** India Standard Time helpers for attendance / day-pass expiry. */
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET = '+05:30';

/**
 * Calendar date in IST as YYYY-MM-DD.
 */
export function todayDateStringIst(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Start of the IST calendar day for `date` (00:00:00.000 IST).
 */
export function startOfDayIst(date = new Date()) {
  const dateStr =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : todayDateStringIst(date);
  return new Date(`${dateStr}T00:00:00.000${IST_OFFSET}`);
}

/**
 * End of the IST calendar day for `date` (23:59:59.999 IST).
 */
export function endOfDayIst(date = new Date()) {
  const dateStr =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : todayDateStringIst(date);
  return new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`);
}

function parseHhMm(value) {
  if (!value || typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes, total: hours * 60 + minutes };
}

function addCalendarDaysIst(dateStr, daysToAdd) {
  // Noon IST avoids DST edge cases (IST has none) when rolling the calendar day
  const base = new Date(`${dateStr}T12:00:00${IST_OFFSET}`);
  base.setTime(base.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return todayDateStringIst(base);
}

/**
 * Instant for shift end on an IST work date.
 * Overnight shifts (endTime <= startTime) land on the next IST calendar day.
 *
 * @param {string} validDate YYYY-MM-DD (IST work date on the pass)
 * @param {string} startTime HH:mm
 * @param {string} endTime HH:mm
 * @returns {Date|null}
 */
export function shiftEndAtIst(validDate, startTime, endTime) {
  if (!validDate || !endTime) return null;
  const end = parseHhMm(endTime);
  if (!end) return null;

  const start = parseHhMm(startTime);
  const overnight = start != null && end.total <= start.total;
  const endDate = overnight ? addCalendarDaysIst(validDate, 1) : validDate;
  const hh = String(end.hours).padStart(2, '0');
  const mm = String(end.minutes).padStart(2, '0');
  const instant = new Date(`${endDate}T${hh}:${mm}:00${IST_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * Day-pass access expiry (working window).
 * With an assigned shift: shift end + 4h grace (overnight shifts wrap to the
 * next IST day via shiftEndAtIst). Without a shift: gate check-in + 24h.
 */
export function resolveDayPassValidUntil({
  entryAt = null,
  fallbackDate = new Date(),
  validDate = null,
  startTime = null,
  endTime = null,
} = {}) {
  const base = entryAt ? new Date(entryAt) : new Date(fallbackDate);
  const baseTime = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();

  const shiftEnd = shiftEndAtIst(validDate, startTime, endTime);
  if (shiftEnd) {
    const windowEnd = shiftEnd.getTime() + SHIFT_OVERSTAY_GRACE_MS;
    // Late entries (after the shift window already closed) still get the grace period
    return new Date(Math.max(windowEnd, baseTime + SHIFT_OVERSTAY_GRACE_MS));
  }

  return new Date(baseTime + DAY_PASS_DURATION_MS);
}
