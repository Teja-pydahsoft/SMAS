import { MIN_ATTENDANCE_HOURS } from '../constants/index.js';

/**
 * Compute on-site activity window (login → logout) and hours for a day.
 * Prefer gate entry → gate exit; if still inside today, use now as the end.
 * Past days with check-in but no checkout close at end-of-day so hours
 * are not zeroed (which was marking those days Absent incorrectly).
 */
export function computeActivityWindow(dayLogs = [], session = null, date, { now = new Date(), today } = {}) {
  const todayKey = today || new Date().toISOString().slice(0, 10);

  let start = session?.gateEntryAt ? new Date(session.gateEntryAt) : null;
  let end = session?.gateExitAt ? new Date(session.gateExitAt) : null;

  const sorted = [...(dayLogs || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  const entries = sorted.filter((l) => l.eventType === 'entry');
  const exits = sorted.filter((l) => l.eventType === 'exit');

  if (!start && entries[0]?.createdAt) start = new Date(entries[0].createdAt);
  if (!end && exits.length) end = new Date(exits[exits.length - 1].createdAt);

  if (start && !end) {
    if (date === todayKey) {
      end = now;
    } else {
      // Open session on a past day (forgot checkout) — close at end of that day
      end = new Date(`${date}T23:59:59.999Z`);
    }
  }

  if (!start || !end) {
    return { start: null, end: null, hours: 0 };
  }

  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    return { start, end, hours: 0 };
  }

  return { start, end, hours: roundHours(ms / (1000 * 60 * 60)) };
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

function dateToDayMinutes(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/**
 * Total shift duration in hours from start/end (HH:mm).
 * Overnight windows (end <= start) wrap past midnight.
 */
export function getShiftDurationHours(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  let durationMinutes = end - start;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return roundHours(durationMinutes / 60);
}

function roundHours(hours) {
  return Math.round(Number(hours) * 100) / 100;
}

function intervalOverlapMinutes(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

/**
 * Split shift into first/second half and measure overlap with login→logout activity.
 * Late login and early logout reduce overlap with the missed half automatically.
 *
 * @returns {{ half: 'first'|'second', firstOverlapHours: number, secondOverlapHours: number, inShiftHours: number }|null}
 */
export function resolveNearestHalf({
  checkIn,
  checkOut,
  startTime,
  endTime,
} = {}) {
  const shiftStart = timeToMinutes(startTime);
  const shiftEnd = timeToMinutes(endTime);
  let actStart = dateToDayMinutes(checkIn);
  let actEnd = dateToDayMinutes(checkOut);

  if (shiftStart === null || shiftEnd === null || actStart === null || actEnd === null) {
    return null;
  }

  let shiftEndAbs = shiftEnd;
  if (shiftEndAbs <= shiftStart) shiftEndAbs += 24 * 60;

  // Activity that crosses midnight
  if (actEnd < actStart) actEnd += 24 * 60;

  // Late login / early logout: clip presence to the shift window
  const clipStart = Math.max(actStart, shiftStart);
  const clipEnd = Math.min(actEnd, shiftEndAbs);
  if (clipEnd <= clipStart) {
    // Completely outside shift — fall back to login proximity to midpoint
    const duration = shiftEndAbs - shiftStart;
    const mid = shiftStart + duration / 2;
    const login = actStart < shiftStart ? shiftStart : actStart > shiftEndAbs ? shiftEndAbs : actStart;
    return {
      half: login < mid ? 'first' : 'second',
      firstOverlapHours: 0,
      secondOverlapHours: 0,
      inShiftHours: 0,
    };
  }

  const duration = shiftEndAbs - shiftStart;
  const mid = shiftStart + duration / 2;

  const firstOverlap = intervalOverlapMinutes(clipStart, clipEnd, shiftStart, mid);
  const secondOverlap = intervalOverlapMinutes(clipStart, clipEnd, mid, shiftEndAbs);

  let half;
  if (firstOverlap > secondOverlap) half = 'first';
  else if (secondOverlap > firstOverlap) half = 'second';
  else {
    // Tie (or both zero after clip weirdness): use activity mid-point / login side
    const activityMid = (clipStart + clipEnd) / 2;
    half = activityMid < mid ? 'first' : 'second';
  }

  return {
    half,
    firstOverlapHours: roundHours(firstOverlap / 60),
    secondOverlapHours: roundHours(secondOverlap / 60),
    inShiftHours: roundHours((clipEnd - clipStart) / 60),
  };
}

/**
 * Pay factor from hours worked vs shift total (0–1).
 */
export function computeHourlyPayFactor(activityHours, shiftTotalHours) {
  const total = Number(shiftTotalHours);
  const hours = Number(activityHours) || 0;
  if (!total || total <= 0 || hours <= 0) return 0;
  return roundHours(Math.min(1, hours / total));
}

/**
 * Resolve attendance against shift thresholds with first/second half logic.
 * Late login + early logout are evaluated via login→logout overlap with each half;
 * nearest half wins for FH/SH labeling. Pay stays prorated by hours worked.
 */
export function resolveShiftDayStatus(activityHours, shift, { checkIn = null, checkOut = null } = {}) {
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

  const shiftTotalHours = getShiftDurationHours(shift.startTime, shift.endTime);
  const payDenominator =
    shiftTotalHours ?? (hasFull ? full : hasHalf ? roundHours(half * 2) : null);
  const payFactor = payDenominator ? computeHourlyPayFactor(hours, payDenominator) : 0;
  const hoursLabel = formatActivityHours(hours);

  const nearest = resolveNearestHalf({
    checkIn,
    checkOut,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  const halfSide = nearest?.half || null;
  const halfLabel =
    halfSide === 'first' ? 'First Half' : halfSide === 'second' ? 'Second Half' : 'Partial Day';
  const halfCode = halfSide === 'first' ? 'FH' : halfSide === 'second' ? 'SH' : 'HD';

  if (hasFull && hours >= full) {
    return {
      status: 'P',
      code: 'P',
      label: payDenominator && hours < payDenominator
        ? `Present (${hoursLabel}h)`
        : 'Present (Full Day)',
      payFactor,
      halfSide: null,
      firstOverlapHours: nearest?.firstOverlapHours ?? null,
      secondOverlapHours: nearest?.secondOverlapHours ?? null,
      inShiftHours: nearest?.inShiftHours ?? null,
    };
  }

  if (hasHalf && hours >= half) {
    return {
      status: halfCode,
      code: halfCode,
      label: `${halfLabel} (${hoursLabel}h)`,
      payFactor,
      halfSide,
      firstOverlapHours: nearest?.firstOverlapHours ?? null,
      secondOverlapHours: nearest?.secondOverlapHours ?? null,
      inShiftHours: nearest?.inShiftHours ?? null,
    };
  }

  // Below half-day minimum but still on site — pay for hours worked
  return {
    status: 'PT',
    code: 'PT',
    label: halfSide
      ? `Hours Worked · ${halfLabel} (${hoursLabel}h)`
      : `Hours Worked (${hoursLabel}h)`,
    payFactor,
    halfSide,
    firstOverlapHours: nearest?.firstOverlapHours ?? null,
    secondOverlapHours: nearest?.secondOverlapHours ?? null,
    inShiftHours: nearest?.inShiftHours ?? null,
  };
}

export function formatActivityHours(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return null;
  const n = roundHours(hours);
  return Number.isInteger(n) ? String(n) : String(n);
}
