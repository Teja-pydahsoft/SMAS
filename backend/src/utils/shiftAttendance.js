/**
 * Compute on-site activity hours for a day from the day pass session and/or gate logs.
 * Prefer gate entry → gate exit; if still inside today, use now as the end.
 */
export function computeActivityHours(dayLogs = [], session = null, date, { now = new Date(), today } = {}) {
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
    } else if (sorted.length) {
      end = new Date(sorted[sorted.length - 1].createdAt);
    }
  }

  if (!start || !end) return 0;

  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;

  return roundHours(ms / (1000 * 60 * 60));
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

/**
 * Pay factor from hours worked vs shift total (0–1).
 * Daily rate is multiplied by this factor for the day's payment.
 */
export function computeHourlyPayFactor(activityHours, shiftTotalHours) {
  const total = Number(shiftTotalHours);
  const hours = Number(activityHours) || 0;
  if (!total || total <= 0 || hours <= 0) return 0;
  return roundHours(Math.min(1, hours / total));
}

/**
 * Resolve attendance against shift thresholds.
 * Any worked hours earn prorated pay: payFactor = activityHours / shiftTotalHours (capped at 1).
 * Half/full mins only affect the status label — they do not zero-out pay.
 * Returns null when the shift has no thresholds (caller should fall back).
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
  if (hours <= 0) {
    return {
      status: 'A',
      code: 'A',
      label: 'Absent',
      payFactor: 0,
    };
  }

  const shiftTotalHours = getShiftDurationHours(shift.startTime, shift.endTime);
  const payDenominator =
    shiftTotalHours ?? (hasFull ? full : hasHalf ? roundHours(half * 2) : null);
  const payFactor = payDenominator ? computeHourlyPayFactor(hours, payDenominator) : 0;
  const hoursLabel = formatActivityHours(hours);

  if (hasFull && hours >= full) {
    return {
      status: 'P',
      code: 'P',
      label: payDenominator && hours < payDenominator
        ? `Present (${hoursLabel}h)`
        : 'Present (Full Day)',
      payFactor,
    };
  }

  if (hasHalf && hours >= half) {
    return {
      status: 'HD',
      code: 'HD',
      label: `Partial Day (${hoursLabel}h)`,
      payFactor,
    };
  }

  // Below half-day minimum but still on site — pay for hours worked
  return {
    status: 'PT',
    code: 'PT',
    label: `Hours Worked (${hoursLabel}h)`,
    payFactor,
  };
}

export function formatActivityHours(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return null;
  const n = roundHours(hours);
  return Number.isInteger(n) ? String(n) : String(n);
}
