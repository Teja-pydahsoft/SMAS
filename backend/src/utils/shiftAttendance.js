import { MIN_ATTENDANCE_HOURS, SCAN_TYPES } from '../constants/index.js';

function isGateScanLog(log) {
  if (!log) return false;
  // Older logs may omit scanType; treat entry/exit without department markers as gate
  if (log.scanType === SCAN_TYPES.GATE || log.scanType === 'gate') return true;
  if (!log.scanType && (log.eventType === 'entry' || log.eventType === 'exit') && !log.departmentId) {
    return true;
  }
  return false;
}

function sortedGateLogs(dayLogs = []) {
  return [...(dayLogs || [])]
    .filter((log) => isGateScanLog(log) && (log.eventType === 'entry' || log.eventType === 'exit'))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Mid-day division break gaps: each Main Gate exit followed later by a gate entry.
 * Used for shift-breakdown roles that leave and re-enter the division.
 */
export function computeDivisionBreaks(dayLogs = []) {
  const gateLogs = sortedGateLogs(dayLogs);
  const breaks = [];
  let pendingExit = null;

  for (const log of gateLogs) {
    const at = new Date(log.createdAt);
    if (Number.isNaN(at.getTime())) continue;

    if (log.eventType === 'exit') {
      pendingExit = at;
      continue;
    }

    if (log.eventType === 'entry' && pendingExit) {
      const ms = at.getTime() - pendingExit.getTime();
      if (Number.isFinite(ms) && ms > 0) {
        breaks.push({
          from: pendingExit.toISOString(),
          to: at.toISOString(),
          hours: roundHours(ms / (1000 * 60 * 60)),
        });
      }
      pendingExit = null;
    }
  }

  const breakHours = roundHours(breaks.reduce((sum, item) => sum + item.hours, 0));
  return { breakHours, breaks };
}

/**
 * On-site segments from gate entry → gate exit pairs.
 * Open sessions close at `now` (today) or end-of-day (past days).
 */
function buildOnSiteSegments(dayLogs = [], session = null, date, { now = new Date(), today } = {}) {
  const todayKey = today || new Date().toISOString().slice(0, 10);
  const gateLogs = sortedGateLogs(dayLogs);
  const segments = [];
  let openStart = null;

  for (const log of gateLogs) {
    const at = new Date(log.createdAt);
    if (Number.isNaN(at.getTime())) continue;

    if (log.eventType === 'entry') {
      if (!openStart) openStart = at;
      continue;
    }

    if (log.eventType === 'exit' && openStart) {
      if (at.getTime() > openStart.getTime()) {
        segments.push({ start: openStart, end: at });
      }
      openStart = null;
    }
  }

  if (openStart) {
    const end =
      date === todayKey
        ? now
        : new Date(`${date}T23:59:59.999Z`);
    if (end.getTime() > openStart.getTime()) {
      segments.push({ start: openStart, end });
    }
  }

  // Fallback when gate logs are missing but the day-pass session has times
  if (!segments.length && (session?.gateEntryAt || session?.gateExitAt)) {
    let start = session?.gateEntryAt ? new Date(session.gateEntryAt) : null;
    let end = session?.gateExitAt ? new Date(session.gateExitAt) : null;
    if (start && !end) {
      end = date === todayKey ? now : new Date(`${date}T23:59:59.999Z`);
    }
    if (start && end && end.getTime() > start.getTime()) {
      segments.push({ start, end });
    }
  }

  return segments;
}

/**
 * Compute on-site activity window and hours for a day.
 * Hours = sum of gate on-site segments (exit→re-entry gaps are excluded as breaks).
 */
export function computeActivityWindow(dayLogs = [], session = null, date, options = {}) {
  const segments = buildOnSiteSegments(dayLogs, session, date, options);
  if (!segments.length) {
    return { start: null, end: null, hours: 0, segments: [] };
  }

  const hours = roundHours(
    segments.reduce((sum, seg) => sum + (seg.end.getTime() - seg.start.getTime()) / (1000 * 60 * 60), 0)
  );

  return {
    start: segments[0].start,
    end: segments[segments.length - 1].end,
    hours,
    segments,
  };
}

/**
 * Compute on-site activity hours for a day from the day pass session and/or gate logs.
 */
export function computeActivityHours(dayLogs = [], session = null, date, options = {}) {
  return computeActivityWindow(dayLogs, session, date, options).hours;
}

function timeToMinutes(value) {
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
 */
export function durationFromStartEnd(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  let durationMinutes = end - start;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return roundHours(durationMinutes / 60);
}

/**
 * Resolve shift total hours from `totalHours`, with legacy start/end fallback.
 * Accepts a shift-like object, or legacy (startTime, endTime) args.
 */
export function getShiftDurationHours(shiftOrStart, endTime) {
  if (shiftOrStart != null && typeof shiftOrStart === 'object') {
    const direct = Number(shiftOrStart.totalHours);
    if (Number.isFinite(direct) && direct > 0) return roundHours(direct);
    return durationFromStartEnd(
      shiftOrStart.startTime || shiftOrStart.shiftStartTime,
      shiftOrStart.endTime || shiftOrStart.shiftEndTime
    );
  }

  if (
    typeof shiftOrStart === 'number' ||
    (typeof shiftOrStart === 'string' &&
      endTime === undefined &&
      !String(shiftOrStart).includes(':'))
  ) {
    const direct = Number(shiftOrStart);
    if (Number.isFinite(direct) && direct > 0) return roundHours(direct);
    return null;
  }

  return durationFromStartEnd(shiftOrStart, endTime);
}

function roundHours(hours) {
  return Math.round(Number(hours) * 100) / 100;
}

/**
 * Pay factor from hours worked vs shift total (0–1).
 * Used only when attendance is below the half-day threshold (partial/hourly pay).
 */
export function computeHourlyPayFactor(activityHours, shiftTotalHours) {
  const total = Number(shiftTotalHours);
  const hours = Number(activityHours) || 0;
  if (!total || total <= 0 || hours <= 0) return 0;
  return roundHours(Math.min(1, hours / total));
}

/**
 * Resolve attendance against shift thresholds using sum of gate in→out segments.
 *
 * Pay rules:
 * - Full-day threshold met → full day pay (1)
 * - Half-day threshold met → half day pay (0.5) as HD
 * - Below half-day but on site → hourly proration vs totalHours
 */
export function resolveShiftDayStatus(activityHours, shift) {
  if (!shift) return null;

  const half =
    shift.halfDayMinHours === null || shift.halfDayMinHours === undefined
      ? null
      : Number(shift.halfDayMinHours);
  const full =
    shift.fullDayMinHours === null || shift.fullDayMinHours === undefined
      ? null
      : Number(shift.fullDayMinHours);

  const hasHalf = half !== null && !Number.isNaN(half);
  const hasFull = full !== null && !Number.isNaN(full);
  if (!hasHalf && !hasFull) return null;

  const hours = Number(activityHours) || 0;
  // Less than 1 hour on site counts as Absent (pay 0)
  if (hours < MIN_ATTENDANCE_HOURS) {
    return {
      status: 'A',
      code: 'A',
      label: 'Absent',
      payFactor: 0,
      halfSide: null,
    };
  }

  const shiftTotalHours = getShiftDurationHours(shift);
  const payDenominator =
    shiftTotalHours ?? (hasFull ? full : hasHalf ? roundHours(half * 2) : null);
  const hoursLabel = formatActivityHours(hours);

  if (hasFull && hours >= full) {
    return {
      status: 'P',
      code: 'P',
      label: 'Present (Full Day)',
      payFactor: 1,
      halfSide: null,
    };
  }

  if (hasHalf && hours >= half) {
    return {
      status: 'HD',
      code: 'HD',
      label: `Half Day (${hoursLabel}h)`,
      payFactor: 0.5,
      halfSide: null,
    };
  }

  // Below half-day minimum but still on site — hourly pay for hours worked
  const hourlyPayFactor = payDenominator ? computeHourlyPayFactor(hours, payDenominator) : 0;
  return {
    status: 'PT',
    code: 'PT',
    label: `Hours Worked (${hoursLabel}h)`,
    payFactor: hourlyPayFactor,
    halfSide: null,
  };
}

export function formatActivityHours(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return null;
  const n = roundHours(hours);
  return Number.isInteger(n) ? String(n) : String(n);
}
