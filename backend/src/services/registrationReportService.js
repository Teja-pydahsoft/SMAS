import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Pass from '../models/Pass.js';
import Role from '../models/Role.js';
import RegistrationForm from '../models/RegistrationForm.js';
import Shift from '../models/Shift.js';
import ActivitySighting from '../models/ActivitySighting.js';
import AttendanceOverride from '../models/AttendanceOverride.js';
import Department from '../models/Department.js';
import mongoose from 'mongoose';
import {
  REGISTRATION_STATUS,
  PASS_TYPES,
  GENDER_LABELS,
  MIN_ATTENDANCE_HOURS,
  SHIFT_OVERSTAY_GRACE_MS,
  SCAN_TYPES,
  GATE_EVENT_TYPES,
} from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import {
  getActiveDivisionSession,
  getPassSessionState,
  todayDateString,
} from './attendanceService.js';
import { calculatePaymentSummary, formatPayFrequencyLabel } from '../utils/paymentCalculation.js';
import { grantedGateLogFilter, filterGrantedLogs } from '../utils/gateLogFilters.js';
import {
  computeActivityWindow,
  computeDivisionBreaks,
  getShiftDurationHours,
  resolveShiftDayStatus,
} from '../utils/shiftAttendance.js';
import {
  todayDateStringIst,
  startOfDayIst,
  endOfDayIst,
  resolveDayPassValidUntil,
} from '../utils/istTime.js';

function logDateKey(date) {
  return todayDateStringIst(date);
}

/**
 * Return the IST calendar date one day before `dateStr` (YYYY-MM-DD).
 */
function prevDateIst(dateStr) {
  // Use noon IST to avoid any edge case when stepping back
  const base = new Date(`${dateStr}T12:00:00+05:30`);
  base.setTime(base.getTime() - 24 * 60 * 60 * 1000);
  return todayDateStringIst(base);
}

/**
 * Return the IST calendar date one day after `dateStr` (YYYY-MM-DD).
 */
function nextDateIst(dateStr) {
  const base = new Date(`${dateStr}T12:00:00+05:30`);
  base.setTime(base.getTime() + 24 * 60 * 60 * 1000);
  return todayDateStringIst(base);
}

/**
 * True when a pass belongs to an overnight shift (legacy clock-window only).
 * Total-hours shifts are calendar-day scoped and never overnight.
 */
function isOvernightPass(pass) {
  const start = pass?.qrPayload?.shiftStartTime;
  const end = pass?.qrPayload?.shiftEndTime;
  if (!start || !end) return false;
  const toMins = (t) => {
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const s = toMins(start);
  const e = toMins(end);
  return s !== null && e !== null && e <= s;
}

/**
 * Instant of shift end on `wallDate` (the calendar day after an overnight
 * work-date), plus the same overstay grace used by live gate sessions.
 * Logs up to this cutoff still belong to the previous night's work-date.
 */
function overnightRebucketCutoff(wallDate, endTime) {
  if (!endTime || !wallDate) return null;
  const [eh, em] = String(endTime).split(':').map(Number);
  if (!Number.isFinite(eh) || !Number.isFinite(em)) return null;
  const shiftEndOnNextDay = new Date(
    `${wallDate}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00+05:30`
  );
  if (Number.isNaN(shiftEndOnNextDay.getTime())) return null;
  return new Date(shiftEndOnNextDay.getTime() + SHIFT_OVERSTAY_GRACE_MS);
}

/**
 * Assigned working window for one work-date.
 * Prefer entry + totalHours + grace; legacy falls back to start/end clock window.
 */
function assignedShiftWindow(workDate, pass) {
  if (!workDate || !pass) return null;
  const payload = pass.qrPayload || {};
  const totalHours = Number(payload.totalHours);
  const entryRaw = payload.gateEntryAt || null;

  if (Number.isFinite(totalHours) && totalHours > 0 && entryRaw) {
    const start = new Date(entryRaw);
    if (!Number.isNaN(start.getTime())) {
      return {
        start,
        end: new Date(start.getTime() + (totalHours * 60 * 60 * 1000) + SHIFT_OVERSTAY_GRACE_MS),
      };
    }
  }

  const startTime = payload.shiftStartTime;
  const endTime = payload.shiftEndTime;
  if (!startTime || !endTime) return null;

  const start = new Date(`${workDate}T${startTime}:00+05:30`);
  const endDate = isOvernightPass(pass) ? nextDateIst(workDate) : workDate;
  const end = new Date(`${endDate}T${endTime}:00+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return {
    start,
    end: new Date(end.getTime() + SHIFT_OVERSTAY_GRACE_MS),
  };
}

function isWithinAssignedShiftWindow(value, workDate, pass) {
  const window = assignedShiftWindow(workDate, pass);
  if (!window) return true;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return false;
  
  // If log falls inherently within the same calendar day, it belongs here.
  // We strictly enforce window.end to prevent stealing from the next day.
  // But enforcing window.start strictly can falsely discard morning logs 
  // if the shift window's start was derived from a later re-entry.
  if (logDateKey(value) === workDate) {
    return at <= window.end;
  }
  
  return at >= window.start && at <= window.end;
}

/**
 * Resolve a timestamp to an assigned work-date. The previous date is checked
 * first so post-midnight events stay attached to the prior night shift.
 */
function assignedWorkDateForTimestamp(value, fallbackDate, shiftPassByDate) {
  if (!(shiftPassByDate instanceof Map) || shiftPassByDate.size === 0) {
    return fallbackDate;
  }
  const wallDate = logDateKey(value);
  const previousDate = prevDateIst(wallDate);
  const previousPass = shiftPassByDate.get(previousDate);
  if (
    previousPass &&
    isWithinAssignedShiftWindow(value, previousDate, previousPass)
  ) {
    return previousDate;
  }
  const wallPass = shiftPassByDate.get(wallDate);
  if (wallPass && isWithinAssignedShiftWindow(value, wallDate, wallPass)) {
    return wallDate;
  }
  return fallbackDate || wallDate;
}

/**
 * Build a map of  logId → workDate  for logs that should be re-attributed to
 * the previous calendar day's shift window (overnight shifts only).
 *
 * Single-registration variant used in getRegistrationReport.
 * `passByDate`  — Map<validDate, pass>
 * `logs`        — raw GateLog documents (createdAt available)
 */
function buildOvernightRebucketMap(logs, passByDate) {
  const absorbedDates = buildAbsorbedDatesSet(passByDate);
  const rebucket = new Map(); // logId (string) → workDate to use instead

  for (const log of logs) {
    const wallDate = logDateKey(log.createdAt);
    const prevDate = prevDateIst(wallDate);

    if (absorbedDates.has(prevDate)) continue;

    const prevPass = passByDate.get(prevDate);
    if (!prevPass) continue;

    if (isWithinAssignedShiftWindow(log.createdAt, prevDate, prevPass)) {
      const wallPass = passByDate.get(wallDate);
      let belongsToNewShift = false;
      if (wallPass && !absorbedDates.has(wallDate)) {
        const wallWindow = assignedShiftWindow(wallDate, wallPass);
        if (wallWindow && new Date(log.createdAt) >= wallWindow.start) {
          belongsToNewShift = true;
          console.log(`[DEBUG REBUCKET] Log ${log._id} (${log.createdAt}) belongs to NEW shift on ${wallDate} (window start: ${wallWindow.start})`);
        }
      }
      
      if (!belongsToNewShift) {
        console.log(`[DEBUG REBUCKET] Rebucketing log ${log._id} (${log.createdAt}) from ${wallDate} to ${prevDate}!`);
        rebucket.set(log._id.toString(), prevDate);
      }
    } else {
      console.log(`[DEBUG REBUCKET] Log ${log._id} (${log.createdAt}) is NOT within prev shift window for ${prevDate}`);
    }
  }
  return rebucket;
}

/**
 * Multi-registration variant used in getAttendanceHistoryGrid.
 * `passByRegDate` — Map<"regId|validDate", pass>
 * `logs`          — raw GateLog documents (registrationId + createdAt available)
 */
function buildOvernightRebucketMapByReg(logs, passByRegDate) {
  // Group passes by registration first
  const passesByReg = new Map(); // regId → Map<validDate, pass>
  for (const [key, pass] of passByRegDate) {
    const [regId, validDate] = key.split('|');
    if (!passesByReg.has(regId)) passesByReg.set(regId, new Map());
    passesByReg.get(regId).set(validDate, pass);
  }

  const absorbedDatesByReg = buildAbsorbedDatesByReg(passByRegDate);
  const rebucket = new Map(); // logId (string) → workDate to use instead

  for (const log of logs) {
    const regId = log.registrationId.toString();
    const passMap = passesByReg.get(regId);
    if (!passMap) continue;

    const absorbedDates = absorbedDatesByReg.get(regId) || new Set();
    const wallDate = logDateKey(log.createdAt);
    const prevDate = prevDateIst(wallDate);

    if (absorbedDates.has(prevDate)) continue;

    const prevPass = passMap.get(prevDate);
    if (!prevPass) continue;

    if (isWithinAssignedShiftWindow(log.createdAt, prevDate, prevPass)) {
      const wallPass = passMap.get(wallDate);
      let belongsToNewShift = false;
      if (wallPass && !absorbedDates.has(wallDate)) {
        const wallWindow = assignedShiftWindow(wallDate, wallPass);
        if (wallWindow && new Date(log.createdAt) >= wallWindow.start) {
          belongsToNewShift = true;
          console.log(`[DEBUG REBUCKET] Log ${log._id} (${log.createdAt}) belongs to NEW shift on ${wallDate} (window start: ${wallWindow.start})`);
        }
      }
      
      if (!belongsToNewShift) {
        console.log(`[DEBUG REBUCKET] Rebucketing log ${log._id} (${log.createdAt}) from ${wallDate} to ${prevDate}!`);
        rebucket.set(log._id.toString(), prevDate);
      }
    } else {
      console.log(`[DEBUG REBUCKET] Log ${log._id} (${log.createdAt}) is NOT within prev shift window for ${prevDate}`);
    }
  }
  return rebucket;
}

/**
 * Returns a Set of validDates that are "absorbed" into the previous calendar day's
 * overnight shift — i.e. dates where the pass was created by a post-midnight
 * gate re-entry that still falls within the previous night's shift window.
 *
 * These dates should be suppressed in the attendance grid (merged into the prior row).
 *
 * Single-registration variant: `passByDate` — Map<validDate, pass>
 */
function buildAbsorbedDatesSet(passByDate) {
  const absorbed = new Set();
  for (const [validDate, pass] of passByDate) {
    const nextDate = nextDateIst(validDate);
    const nextPass = passByDate.get(nextDate);
    if (!nextPass) continue;

    const window = assignedShiftWindow(validDate, pass);
    if (!window) continue;

    // Check if the next-day pass was created inside this shift's window (re-entry)
    const nextPassCreated = new Date(nextPass.createdAt);
    if (nextPassCreated >= window.start && nextPassCreated <= window.end) {
      absorbed.add(nextDate);
    }
  }
  return absorbed;
}

/**
 * Multi-registration variant: `passByRegDate` — Map<"regId|validDate", pass>
 * Returns Map<regId, Set<absorbedDate>>
 */
function buildAbsorbedDatesByReg(passByRegDate) {
  // Group passes by registration first
  const passesByReg = new Map(); // regId → Map<validDate, pass>
  for (const [key, pass] of passByRegDate) {
    const [regId, validDate] = key.split('|');
    if (!passesByReg.has(regId)) passesByReg.set(regId, new Map());
    passesByReg.get(regId).set(validDate, pass);
  }

  const result = new Map(); // regId → Set<absorbedDate>
  for (const [regId, passMap] of passesByReg) {
    result.set(regId, buildAbsorbedDatesSet(passMap));
  }
  return result;
}

function eachDateInRange(dateFrom, dateTo) {
  const dates = [];
  const cur = new Date(`${dateFrom}T12:00:00.000Z`);
  const end = new Date(`${dateTo}T12:00:00.000Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}


function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value?.toISOString?.() || value;
}

function toObjectIdArray(ids) {
  return (ids || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Registration ids that have any check-in activity (granted gate log or day pass)
 * inside the given divisions, optionally constrained to a date range.
 */
async function registrationIdsWithDivisionActivity(divisionObjIds, { from, toDate } = {}) {
  return registrationIdsWithActivity({
    from,
    toDate,
    divisionObjIds: divisionObjIds?.length ? divisionObjIds : null,
  });
}

/**
 * Registration ids with granted gate activity or a day pass in the date range.
 * Optional division filter. Used to prioritize people who actually appear in the grid.
 */
async function registrationIdsWithActivity({ from, toDate, divisionObjIds = null } = {}) {
  const logMatch = grantedGateLogFilter({
    registrationId: { $ne: null },
    ...(divisionObjIds?.length ? { divisionId: { $in: divisionObjIds } } : {}),
  });
  const passMatch = {
    passType: PASS_TYPES.DAY_PASS,
    ...(divisionObjIds?.length ? { divisionId: { $in: divisionObjIds } } : {}),
  };
  if (from && toDate) {
    logMatch.createdAt = {
      $gte: startOfDayIst(from),
      $lte: endOfDayIst(nextDateIst(toDate)),
    };
    passMatch.validDate = { $gte: from, $lte: toDate };
  }

  const [logRegIds, passRegIds] = await Promise.all([
    GateLog.distinct('registrationId', logMatch),
    Pass.distinct('registrationId', passMatch),
  ]);

  const set = new Set();
  for (const id of logRegIds) if (id) set.add(id.toString());
  for (const id of passRegIds) if (id) set.add(id.toString());
  return set;
}

function extractDayTimings(dayLogs, session) {
  const sorted = [...filterGrantedLogs(dayLogs)].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  const entries = sorted.filter((l) => l.eventType === 'entry');
  const exits = sorted.filter((l) => l.eventType === 'exit');

  let checkIn = entries[0]?.createdAt || null;

  if (session?.gateEntryAt) {
    const passEntry = new Date(session.gateEntryAt);
    if (!checkIn || passEntry < new Date(checkIn)) {
      checkIn = session.gateEntryAt;
    }
  }

  const activityEvents = [];
  for (const log of sorted) {
    activityEvents.push({
      at: log.createdAt,
      type: log.eventType === 'exit' ? 'exit' : 'entry',
    });
  }
  if (session?.gateEntryAt) {
    activityEvents.push({ at: session.gateEntryAt, type: 'entry' });
  }
  if (session?.gateExitAt) {
    activityEvents.push({ at: session.gateExitAt, type: 'exit' });
  }

  activityEvents.sort((a, b) => new Date(a.at) - new Date(b.at));
  const last = activityEvents.length ? activityEvents[activityEvents.length - 1] : null;

  return {
    checkIn: toIso(checkIn),
    lastActivityAt: last ? toIso(last.at) : null,
    lastActivityType: last?.type || null,
  };
}

function hasDayActivity(dayLogs, session) {
  if (dayLogs?.length && filterGrantedLogs(dayLogs).length) return true;
  if (session?.gateEntryAt || session?.gateExitAt) return true;
  return false;
}

/** Keep only shift/session fields needed for attendance + pay (drops fat qrPayload). */
function slimPassForAttendance(pass) {
  if (!pass) return pass;
  const payload = pass.qrPayload || {};
  return {
    _id: pass._id,
    registrationId: pass.registrationId,
    validDate: pass.validDate,
    createdAt: pass.createdAt,
    qrPayload: {
      shiftId: payload.shiftId || null,
      shiftName: payload.shiftName || null,
      totalHours: payload.totalHours ?? null,
      shiftStartTime: payload.shiftStartTime || null,
      shiftEndTime: payload.shiftEndTime || null,
      halfDayMinHours: payload.halfDayMinHours ?? null,
      fullDayMinHours: payload.fullDayMinHours ?? null,
      gateEntryAt: payload.gateEntryAt || null,
      gateExitAt: payload.gateExitAt || null,
    },
  };
}

function dayAbbrev(dateStr) {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
    new Date(`${dateStr}T12:00:00.000Z`).getUTCDay()
  ];
}

function dayNumber(dateStr) {
  return new Date(`${dateStr}T12:00:00.000Z`).getUTCDate();
}

function emptyAttendanceGrid(from, toDate, dates) {
  return {
    dateFrom: from,
    dateTo: toDate,
    dates: dates.map((date) => ({ date, day: dayNumber(date), weekday: dayAbbrev(date) })),
    employees: [],
  };
}

function formatTimeFromDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
}

function resolveDayAttendance({
  date,
  registeredAt,
  dayLogs,
  session,
  shift = null,
  today = null,
}) {
  const joinDate = logDateKey(registeredAt);

  // Fast path: empty cells skip all log sorting / hour math (most of a month grid).
  if (date < joinDate) {
    return {
      status: 'blank',
      code: 'NR',
      label: 'Not Registered',
      payFactor: 0,
    };
  }

  if (!hasDayActivity(dayLogs, session)) {
    return {
      status: 'A',
      code: 'A',
      label: 'Absent',
      payFactor: 0,
    };
  }

  const grantedLogs = filterGrantedLogs(dayLogs || []);
  const timings = extractDayTimings(dayLogs || [], session);
  const todayKey = today || todayDateString();
  const activityWindow = computeActivityWindow(grantedLogs, session, date, {
    today: todayKey,
  });
  const activityHours = activityWindow.hours;
  const divisionBreaks = computeDivisionBreaks(grantedLogs);
  const shiftTotalHours =
    getShiftDurationHours(shift) ??
    (session?.totalHours != null ? Number(session.totalHours) : null) ??
    getShiftDurationHours({
      startTime: shift?.startTime || session?.shiftStartTime || null,
      endTime: shift?.endTime || session?.shiftEndTime || null,
    });
  const shiftMeta = {
    activityHours,
    breakHours: divisionBreaks.breakHours,
    ...(divisionBreaks.breaks.length > 0 ? { breaks: divisionBreaks.breaks } : {}),
    shiftId: shift?._id?.toString?.() || shift?.id || session?.shiftId || null,
    shiftName: shift?.name || session?.shiftName || null,
    shiftTotalHours,
    halfDayMinHours: shift?.halfDayMinHours ?? session?.halfDayMinHours ?? null,
    fullDayMinHours: shift?.fullDayMinHours ?? session?.fullDayMinHours ?? null,
  };

  const shiftStatus = resolveShiftDayStatus(activityHours, {
    ...(shift || {}),
    totalHours: shiftTotalHours,
    halfDayMinHours: shiftMeta.halfDayMinHours,
    fullDayMinHours: shiftMeta.fullDayMinHours,
  });
  if (shiftStatus) {
    return {
      status: shiftStatus.status,
      code: shiftStatus.code,
      label: shiftStatus.label,
      payFactor: shiftStatus.payFactor,
      halfSide: shiftStatus.halfSide ?? null,
      checkInTime: formatTimeFromDate(timings.checkIn),
      ...timings,
      ...shiftMeta,
    };
  }

  // No shift thresholds configured — still require at least 1 hour on site
  if (activityHours < MIN_ATTENDANCE_HOURS) {
    return {
      status: 'A',
      code: 'A',
      label: `Absent (< ${MIN_ATTENDANCE_HOURS}h on site)`,
      payFactor: 0,
      checkInTime: formatTimeFromDate(timings.checkIn),
      ...timings,
      ...shiftMeta,
    };
  }

  return {
    status: 'P',
    code: 'P',
    label: 'Present',
    payFactor: 1,
    checkInTime: formatTimeFromDate(timings.checkIn),
    ...timings,
    ...shiftMeta,
  };
}

/* ─── Manual attendance status overrides ─────────────────────────────────── */

/** Canonical override presets. `AUTO` clears the override (delete row). */
export const ATTENDANCE_OVERRIDE_STATUSES = {
  P: { status: 'P', code: 'P', label: 'Present', payFactor: 1 },
  HD: { status: 'HD', code: 'HD', label: 'Half Day', payFactor: 0.5 },
  A: { status: 'A', code: 'A', label: 'Absent', payFactor: 0 },
  DS: { status: 'P', code: 'DS', label: 'Double Shift', payFactor: 2 },
  '1.5S': { status: 'P', code: '1.5S', label: '1.5 Shift', payFactor: 1.5 },
  OT: { status: 'P', code: 'OT', label: 'Overtime', payFactor: 1.25 },
};

/**
 * Apply a stored override onto a computed day. Timings/hours/shift metadata are
 * preserved — only the final status/code/label/payFactor are replaced so the
 * timeline still shows what actually happened while payroll follows the manual
 * decision. Blank/absorbed rows are never overridden.
 */
function applyDayOverride(day, override) {
  if (!day || !override) return day;
  if (day.status === 'blank') return day;
  const preset = ATTENDANCE_OVERRIDE_STATUSES[override.status];
  if (!preset) return day;
  return {
    ...day,
    status: preset.status,
    code: preset.code,
    label: preset.label,
    payFactor: preset.payFactor,
    overridden: true,
    overrideStatus: override.status,
    overrideNote: override.note || '',
    overrideBy: override.updatedByName || '',
    overrideAt: override.updatedAt?.toISOString?.() || override.updatedAt || null,
  };
}

/** date (YYYY-MM-DD) → override doc, for one registration. */
async function loadOverrideMapForRegistration(registrationId, dateFrom, dateTo) {
  const query = { registrationId };
  if (dateFrom && dateTo) query.date = { $gte: dateFrom, $lte: dateTo };
  const rows = await AttendanceOverride.find(query).lean();
  const map = new Map();
  for (const row of rows) map.set(row.date, row);
  return map;
}

/** `${regId}|${date}` → override doc, for many registrations. */
async function loadOverrideMapForRegistrations(registrationIds, dateFrom, dateTo) {
  const map = new Map();
  if (!registrationIds || registrationIds.length === 0) return map;
  const query = { registrationId: { $in: registrationIds } };
  if (dateFrom && dateTo) query.date = { $gte: dateFrom, $lte: dateTo };
  const rows = await AttendanceOverride.find(query).lean();
  for (const row of rows) {
    map.set(`${row.registrationId.toString()}|${row.date}`, row);
  }
  return map;
}

/**
 * Create/update/clear a manual attendance status override for one
 * registration + work-date, then return the refreshed registration report.
 */
export async function setAttendanceStatusOverride({
  registrationId,
  date,
  status,
  note = '',
  user = null,
  divisionIds = null,
} = {}) {
  if (!registrationId) throw new Error('registrationId is required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('A valid work-date (YYYY-MM-DD) is required');
    err.status = 400;
    throw err;
  }

  const registration = await Registration.findOne({
    _id: registrationId,
    status: REGISTRATION_STATUS.VERIFIED,
  }).lean();
  if (!registration) {
    const err = new Error('Registration not found or not verified');
    err.status = 404;
    throw err;
  }

  const normalized = String(status || '').toUpperCase();
  if (normalized === 'AUTO' || normalized === '') {
    await AttendanceOverride.deleteOne({ registrationId, date });
    return { registrationId: registrationId.toString(), date, status: 'AUTO', cleared: true };
  }

  if (!ATTENDANCE_OVERRIDE_STATUSES[normalized]) {
    const err = new Error(`Unsupported status "${status}"`);
    err.status = 400;
    throw err;
  }

  const saved = await AttendanceOverride.findOneAndUpdate(
    { registrationId, date },
    {
      $set: {
        status: normalized,
        note: String(note || '').slice(0, 500),
        updatedByName: user?.name || user?.username || '',
        updatedById: user?._id || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    registrationId: registrationId.toString(),
    date,
    status: saved.status,
    note: saved.note || '',
    updatedByName: saved.updatedByName || '',
    updatedAt: saved.updatedAt?.toISOString?.() || saved.updatedAt || null,
  };
}

function summarizeAttendanceDays(days) {
  let present = 0;
  let halfDay = 0;
  let absent = 0;

  for (const day of days) {
    if (day.status === 'P') present += 1;
    else if (day.status === 'HD' || day.status === 'FH' || day.status === 'SH' || day.status === 'PT') {
      halfDay += 1;
    } else if (day.status === 'A') absent += 1;
  }

  return {
    present,
    halfDay,
    absent,
    totalDays: present + halfDay + absent,
  };
}

function collectShiftIdsFromPasses(passes) {
  const ids = new Set();
  for (const pass of passes || []) {
    const id = pass?.qrPayload?.shiftId;
    if (id) ids.add(String(id));
  }
  return [...ids];
}

async function loadShiftMap(shiftIds) {
  const map = new Map();
  if (!shiftIds?.length) return map;
  const validIds = shiftIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return map;
  const shifts = await Shift.find({ _id: { $in: validIds } }).lean();
  for (const shift of shifts) {
    map.set(shift._id.toString(), shift);
  }
  return map;
}

function shiftFromSession(session, shiftMap) {
  const shiftId = session?.shiftId ? String(session.shiftId) : null;
  if (!shiftId) return null;
  const fromMap = shiftMap.get(shiftId);
  if (fromMap) return fromMap;

  // Pass still has shift snapshot even if the Shift document was removed
  if (
    !session?.shiftName &&
    session?.totalHours == null &&
    !session?.shiftStartTime &&
    !session?.shiftEndTime &&
    session?.halfDayMinHours == null &&
    session?.fullDayMinHours == null
  ) {
    return null;
  }

  return {
    _id: shiftId,
    name: session.shiftName || null,
    totalHours: session.totalHours ?? null,
    startTime: session.shiftStartTime || null,
    endTime: session.shiftEndTime || null,
    halfDayMinHours: session.halfDayMinHours ?? null,
    fullDayMinHours: session.fullDayMinHours ?? null,
  };
}

function formatLogEntry(log) {
  return {
    id: log._id.toString(),
    scanType: log.scanType,
    eventType: log.eventType,
    at: log.createdAt?.toISOString?.() || log.createdAt,
    divisionId: log.divisionId?._id?.toString() || log.divisionId?.toString() || null,
    divisionName: log.divisionId?.name || null,
    gateName: log.gateRefId?.name || null,
    departmentId: log.departmentId?._id?.toString() || log.departmentId?.toString() || null,
    departmentName: log.departmentId?.name || null,
    matchScore: log.matchScore,
    photoUrl: photoUrlFromPath(log.photoPath),
    remark: typeof log.remark === 'string' && log.remark.trim() ? log.remark.trim() : '',
  };
}

function scanLabel(entry) {
  if (entry.scanType === 'activity') {
    return entry.inActivity
      ? 'Activity monitor — Seen (gate in)'
      : 'Activity monitor — Seen (no gate in)';
  }
  const place =
    entry.scanType === 'department'
      ? entry.departmentName || 'Department'
      : entry.gateName || 'Division gate';
  const action =
    entry.scanType === 'department'
      ? entry.eventType === 'entry'
        ? 'Check-in'
        : 'Check-out'
      : entry.eventType === 'entry'
        ? 'Entry'
        : 'Exit';
  const division = entry.divisionName ? ` (${entry.divisionName})` : '';
  return `${place}${division} — ${action}`;
}

function formatActivitySightingEntry(sighting) {
  return {
    id: sighting._id.toString(),
    scanType: 'activity',
    eventType: 'seen',
    at: sighting.createdAt?.toISOString?.() || sighting.createdAt,
    divisionId: sighting.metadata?.divisionId || null,
    divisionName: sighting.metadata?.divisionName || null,
    gateName: null,
    departmentId: null,
    departmentName: null,
    matchScore: sighting.matchScore,
    photoUrl: photoUrlFromPath(sighting.photoPath),
    remark: '',
    inActivity: Boolean(sighting.inActivity),
    label: null,
  };
}

function groupEntriesByDate(logs, overnightRebucket = null) {
  const groups = new Map();

  for (const log of logs) {
    const date = (overnightRebucket && overnightRebucket.get(log._id.toString()))
      || logDateKey(log.createdAt);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(formatLogEntry(log));
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) => new Date(b.at) - new Date(a.at)),
    }));
}

async function buildTodayActiveForRegistration(registrationId, divisionObjIds = null) {
  const validDate = todayDateString();
  const passQuery = {
    registrationId,
    passType: PASS_TYPES.DAY_PASS,
    validDate,
    isActive: true,
  };
  if (Array.isArray(divisionObjIds) && divisionObjIds.length) {
    passQuery.divisionId = { $in: divisionObjIds };
  }
  const activePasses = await Pass.find(passQuery);

  const active = [];

  for (const pass of activePasses) {
    const sessionState = getPassSessionState(pass);
    const divisionName = pass.qrPayload?.divisionName || 'Division';

    if (sessionState.divisionInside) {
      active.push({
        id: `gate-${pass._id}`,
        scanType: 'gate',
        eventType: 'entry',
        label: `${divisionName} — Gate entry`,
        divisionName,
        status: 'Active',
        entryAt: sessionState.gateEntryAt,
        exitAt: null,
      });
    }

    for (const visit of sessionState.departmentVisits || []) {
      if (visit.exitAt) continue;
      active.push({
        id: `dept-${pass._id}-${visit.departmentId}`,
        scanType: 'department',
        eventType: 'entry',
        label: `${visit.departmentName} — Check-in (${divisionName})`,
        divisionName,
        departmentName: visit.departmentName,
        status: 'Active',
        entryAt: visit.entryAt,
        exitAt: null,
      });
    }
  }

  return active;
}

export async function listRegistrationReports({ search = '', limit = 100, divisionIds = null } = {}) {
  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped && divisionObjIds.length === 0) return [];

  const logMatch = grantedGateLogFilter({ registrationId: { $ne: null } });
  if (divisionScoped) logMatch.divisionId = { $in: divisionObjIds };

  const matchedLogs = await GateLog.aggregate([
    { $match: logMatch },
    {
      $group: {
        _id: '$registrationId',
        totalScans: { $sum: 1 },
        lastScanAt: { $max: '$createdAt' },
      },
    },
    { $sort: { lastScanAt: -1 } },
    { $limit: parseInt(limit, 10) || 100 },
  ]);

  if (matchedLogs.length === 0) return [];

  const registrationIds = matchedLogs.map((row) => row._id);
  const statsById = new Map(matchedLogs.map((row) => [row._id.toString(), row]));

  const registrations = await Registration.find({
    _id: { $in: registrationIds },
    status: REGISTRATION_STATUS.VERIFIED,
  })
    .select('-faceEmbedding')
    .populate('roleId', 'name slug')
    .populate('formId', 'fields');

  const items = await Promise.all(
    registrations.map(async (reg) => {
      const obj = reg.toObject();
      const display = buildDisplayInfo(obj.formData, obj.formId?.fields || []);
      const stats = statsById.get(reg._id.toString()) || {};
      const activeSession = await getActiveDivisionSession(reg._id);

      return {
        registrationId: reg._id.toString(),
        displayName: display.displayName,
        displayPhone: display.displayPhone,
        registrationCode: reg.registrationCode,
        roleName: reg.roleId?.name || '—',
        photoUrl: photoUrlFromPath(reg.photoPath),
        totalScans: stats.totalScans || 0,
        lastScanAt: stats.lastScanAt || null,
        activeDivisionName: activeSession?.divisionName || null,
        divisionInside: Boolean(activeSession?.sessionState?.divisionInside),
        currentDepartmentName: activeSession?.sessionState?.currentDepartmentName || null,
      };
    })
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? items.filter(
        (item) =>
          item.displayName?.toLowerCase().includes(normalizedSearch) ||
          item.registrationCode?.toLowerCase().includes(normalizedSearch) ||
          item.roleName?.toLowerCase().includes(normalizedSearch)
      )
    : items;

  return filtered.sort(
    (a, b) => new Date(b.lastScanAt || 0) - new Date(a.lastScanAt || 0)
  );
}

export async function getRegistrationReport(
  registrationId,
  { dateFrom = '', dateTo = '', divisionIds = null } = {}
) {
  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped && divisionObjIds.length === 0) {
    return null;
  }

  const registration = await Registration.findById(registrationId)
    .select('-faceEmbedding')
    .populate('roleId', 'name slug')
    .populate('formId', 'fields');

  if (!registration || registration.status !== REGISTRATION_STATUS.VERIFIED) {
    return null;
  }

  const obj = registration.toObject();
  const display = buildDisplayInfo(obj.formData, obj.formId?.fields || []);
  const today = todayDateString();
  const activeSession = await getActiveDivisionSession(registration._id);
  const hasDateRange = Boolean(dateFrom && dateTo);

  const logQuery = grantedGateLogFilter({
    registrationId: registration._id,
  });
  if (divisionScoped) logQuery.divisionId = { $in: divisionObjIds };

  if (hasDateRange) {
    // Extend the upper bound by one extra IST day so that post-midnight logs
    // belonging to an overnight shift on `dateTo` are included in the fetch.
    logQuery.createdAt = {
      $gte: startOfDayIst(dateFrom),
      $lte: endOfDayIst(nextDateIst(dateTo)),
    };
  }

  const logs = await GateLog.find(logQuery)
    .populate('divisionId', 'name slug')
    .populate('departmentId', 'name slug')
    .populate('gateRefId', 'name gateType slug')
    .sort({ createdAt: -1 })
    .limit(hasDateRange ? 5000 : 1000);

  const todayEntries = hasDateRange
    ? []
    : logs
        .filter((log) => logDateKey(log.createdAt) === today)
        .map((entry) => ({
          ...formatLogEntry(entry),
          label: scanLabel(formatLogEntry(entry)),
        }))
        .sort((a, b) => new Date(b.at) - new Date(a.at));

  // Activity-monitor sightings for today (even without gate entry).
  if (!hasDateRange) {
    const todaySightings = await ActivitySighting.find({
      registrationId: registration._id,
      matched: true,
      sightingDate: today,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    for (const sighting of todaySightings) {
      const formatted = formatActivitySightingEntry(sighting);
      formatted.label = scanLabel(formatted);
      todayEntries.push(formatted);
    }
    todayEntries.sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  const todayActive = hasDateRange
    ? []
    : await buildTodayActiveForRegistration(registration._id, divisionScoped ? divisionObjIds : null);

  // Populated inside the hasDateRange block; reused for entriesByDate below.
  let overnightRebucketForRange = null;
  let shiftPassByDateForRange = null;
  let timelineLogs = logs;

  let attendanceRange = null;
  if (hasDateRange) {
    const dates = eachDateInRange(dateFrom, dateTo);
    const passes = await Pass.find({
      registrationId: registration._id,
      passType: PASS_TYPES.DAY_PASS,
      validDate: { $gte: dateFrom, $lte: dateTo },
      ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {}),
    })
      .select('registrationId validDate qrPayload createdAt')
      .lean();

    // Build passByDate first so the overnight rebucket map can reference it
    const passByDate = new Map();
    const initialShiftPassByDate = new Map();
    for (const pass of passes) {
      const existing = passByDate.get(pass.validDate);
      if (!existing || pass.createdAt > existing.createdAt) {
        passByDate.set(pass.validDate, pass);
      }

      if (pass.qrPayload?.shiftId) {
        const initialShiftPass = initialShiftPassByDate.get(pass.validDate);
        if (!initialShiftPass || pass.createdAt < initialShiftPass.createdAt) {
          initialShiftPassByDate.set(pass.validDate, pass);
        }
      }
    }

    // Prefer the first pass carrying the assigned shift snapshot.
    shiftPassByDateForRange = new Map();
    for (const date of dates) {
      const shiftPass = initialShiftPassByDate.get(date) || passByDate.get(date);
      if (shiftPass?.qrPayload?.shiftId) {
        shiftPassByDateForRange.set(date, shiftPass);
      }
    }

    // For overnight shifts, logs that fall after midnight are re-keyed to the
    // shift's work-date (the previous calendar day) so they appear in one row.
    const overnightRebucket = buildOvernightRebucketMap(logs, passByDate);
    overnightRebucketForRange = overnightRebucket;

    const logsByDate = new Map();
    for (const log of logs) {
      const date = overnightRebucket.get(log._id.toString()) || logDateKey(log.createdAt);
      const shiftPass = shiftPassByDateForRange.get(date);
      if (
        shiftPass &&
        !isWithinAssignedShiftWindow(log.createdAt, date, shiftPass)
      ) {
        continue;
      }
      if (!logsByDate.has(date)) logsByDate.set(date, []);
      logsByDate.get(date).push(log);
    }

    // The period timeline and Excel Activity sheet must use the exact same
    // shift-scoped logs as attendance calculations. This removes same-calendar
    // morning scans that occurred before a night shift began.
    timelineLogs = logs.filter((log) => {
      const date = overnightRebucket.get(log._id.toString()) || logDateKey(log.createdAt);
      if (date < dateFrom || date > dateTo) return false;
      const shiftPass = shiftPassByDateForRange.get(date);
      return !shiftPass || isWithinAssignedShiftWindow(log.createdAt, date, shiftPass);
    });

    const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes));

    // Dates whose pass was created by a post-midnight re-entry inside the previous
    // night's shift window — these are merged into the prior overnight row.
    const absorbedDates = buildAbsorbedDatesSet(passByDate);

    // Manual admin status overrides for this registration within the range.
    const overrideMap = await loadOverrideMapForRegistration(
      registration._id,
      dateFrom,
      dateTo
    );

    const days = dates.map((date) => {
      // Suppress dates absorbed into the previous overnight shift row
      if (absorbedDates.has(date)) {
        return { date, status: 'blank', code: 'NR', label: 'Absorbed into overnight shift' };
      }
      const dayLogs = logsByDate.get(date) || [];
      const pass = passByDate.get(date);
      const session = pass ? getPassSessionState(pass) : null;
      const initialShiftPass = initialShiftPassByDate.get(date);
      const shiftSession = initialShiftPass
        ? getPassSessionState(initialShiftPass)
        : session;
      const shift = shiftFromSession(shiftSession, shiftMap);
      const day = {
        date,
        ...resolveDayAttendance({
          date,
          registeredAt: registration.createdAt,
          dayLogs,
          session,
          shift,
        }),
      };
      return applyDayOverride(day, overrideMap.get(date));
    });

    attendanceRange = {
      dateFrom,
      dateTo,
      days,
      summary: summarizeAttendanceDays(days),
      payment: calculatePaymentSummary({
        payFrequency: registration.payFrequency,
        customPayDays: registration.customPayDays,
        payAmount: registration.payAmount,
        days,
      }),
    };
  }

  // Group all scan entries by their effective work-date (rebucketed for overnight shifts).
  const entriesByDate = groupEntriesByDate(timelineLogs, overnightRebucketForRange).map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      ...entry,
      label: scanLabel(entry),
    })),
  }));

  // Merge activity-monitor sightings into the per-date timeline.
  {
    const sightingQuery = {
      registrationId: registration._id,
      matched: true,
    };
    if (hasDateRange) {
      sightingQuery.sightingDate = { $gte: dateFrom, $lte: dateTo };
    } else {
      sightingQuery.sightingDate = today;
    }
    const sightings = await ActivitySighting.find(sightingQuery)
      .sort({ createdAt: -1 })
      .limit(hasDateRange ? 2000 : 100)
      .lean();

    const byDate = new Map(entriesByDate.map((g) => [g.date, g]));
    for (const sighting of sightings) {
      const date = hasDateRange
        ? assignedWorkDateForTimestamp(
            sighting.createdAt,
            sighting.sightingDate || logDateKey(sighting.createdAt),
            shiftPassByDateForRange
          )
        : sighting.sightingDate || logDateKey(sighting.createdAt);
      if (hasDateRange && (date < dateFrom || date > dateTo)) continue;
      const shiftPass = shiftPassByDateForRange?.get(date);
      if (
        shiftPass &&
        !isWithinAssignedShiftWindow(sighting.createdAt, date, shiftPass)
      ) {
        continue;
      }
      const formatted = formatActivitySightingEntry(sighting);
      formatted.label = scanLabel(formatted);
      if (!byDate.has(date)) {
        const group = { date, entries: [] };
        byDate.set(date, group);
        entriesByDate.push(group);
      }
      // Avoid duplicating the same sighting if already added to todayEntries path
      const group = byDate.get(date);
      if (!group.entries.some((e) => e.id === formatted.id)) {
        group.entries.push(formatted);
      }
    }
    for (const group of entriesByDate) {
      group.entries.sort((a, b) => new Date(b.at) - new Date(a.at));
    }
    entriesByDate.sort((a, b) => b.date.localeCompare(a.date));
  }

  const sessionState = activeSession?.sessionState || {
    divisionInside: false,
    currentDepartmentId: null,
    currentDepartmentName: null,
    departmentVisits: [],
  };

  const reportLogs = hasDateRange ? timelineLogs : logs;
  const divisionNames = [
    ...new Set(reportLogs.map((log) => log.divisionId?.name).filter(Boolean)),
  ];

  const rangeShiftDay = (attendanceRange?.days || [])
    .slice()
    .reverse()
    .find((day) => day.shiftName || day.shiftTotalHours != null || day.shiftId);
  const assignedShiftName =
    rangeShiftDay?.shiftName || sessionState.shiftName || null;
  const assignedShiftTotalHours =
    rangeShiftDay?.shiftTotalHours ?? sessionState.totalHours ?? null;

  return {
    valid: Boolean(activeSession?.sessionState?.divisionInside),
    expired: false,
    inactive: false,
    sessionState,
    dateFrom: hasDateRange ? dateFrom : null,
    dateTo: hasDateRange ? dateTo : null,
    attendanceRange,
    details: {
      holderName: display.displayName,
      holderPhotoUrl: photoUrlFromPath(registration.photoPath),
      roleName: registration.roleId?.name || '—',
      registrationCode: registration.registrationCode,
      passCode: registration.registrationCode,
      passType: 'registration',
      passTitle: 'Registered Person',
      validDate: today,
      divisionName: activeSession?.divisionName || divisionNames[0] || null,
      details: display.details,
      issuedAt: registration.createdAt,
      registeredAt: registration.createdAt,
      totalScans: reportLogs.length,
      divisionsVisited: divisionNames,
      lastScanAt: reportLogs[0]?.createdAt || null,
      shiftName: assignedShiftName,
      shiftTotalHours: assignedShiftTotalHours,
      payFrequency: registration.payFrequency || null,
      customPayDays: registration.customPayDays || null,
      payAmount: registration.payAmount ?? null,
      payFrequencyLabel: formatPayFrequencyLabel(
        registration.payFrequency,
        registration.customPayDays
      ),
      gender: registration.gender || null,
      genderLabel: registration.gender
        ? GENDER_LABELS[registration.gender] || registration.gender
        : null,
    },
    todayActive,
    todayEntries,
    entriesByDate,
  };
}

/**
 * getDailyPassByRole
 *
 * Returns all active roles, each with their verified registrations and
 * day-pass status for every person on the given date (defaults to today IST).
 */
export async function getDailyPassByRole({ divisionIds = null, date = null } = {}) {
  const today = todayDateString();
  const validDate =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  // 1. All active roles
  const roles = await Role.find({ isActive: true }).sort({ name: 1 }).lean();

  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped && divisionObjIds.length === 0) {
    return { date: validDate, roles: [] };
  }

  // 2. Day passes for the selected date (one per registration+division), scoped when applicable
  const passQuery = { passType: PASS_TYPES.DAY_PASS, validDate };
  if (divisionScoped) passQuery.divisionId = { $in: divisionObjIds };
  const todayPasses = await Pass.find(passQuery).lean();

  // 2b. Activity-monitor sightings for the date (matched people only)
  const daySightings = await ActivitySighting.find({
    sightingDate: validDate,
    matched: true,
    registrationId: { $ne: null },
  })
    .select('registrationId createdAt inActivity matchScore photoPath')
    .sort({ createdAt: -1 })
    .lean();

  const sightingsByReg = new Map();
  for (const sighting of daySightings) {
    const key = sighting.registrationId?.toString();
    if (!key) continue;
    if (!sightingsByReg.has(key)) sightingsByReg.set(key, []);
    sightingsByReg.get(key).push(sighting);
  }

  // 3. Verified registrations grouped by roleId. When division-scoped, include
  //    people who checked into an accessible division OR were seen on Activity.
  const regQuery = { status: REGISTRATION_STATUS.VERIFIED };
  if (divisionScoped) {
    const scopedRegIds = [
      ...new Set([
        ...todayPasses.map((p) => p.registrationId?.toString()).filter(Boolean),
        ...daySightings.map((s) => s.registrationId?.toString()).filter(Boolean),
      ]),
    ];
    if (scopedRegIds.length === 0) {
      return { date: validDate, roles: [] };
    }
    regQuery._id = { $in: scopedRegIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const registrations = await Registration.find(regQuery)
    .select('-faceEmbedding')
    .populate('roleId', 'name slug isShiftBased')
    .populate('formId', 'fields')
    .lean();

  // Build a map: registrationId → array of passes for the selected date
  const passesByReg = new Map();
  for (const pass of todayPasses) {
    const key = pass.registrationId.toString();
    if (!passesByReg.has(key)) passesByReg.set(key, []);
    passesByReg.get(key).push(pass);
  }

  // Build a map: roleId → registrations
  const regsByRole = new Map();
  for (const reg of registrations) {
    const roleId = reg.roleId?._id?.toString() || reg.roleId?.toString();
    if (!roleId) continue;
    if (!regsByRole.has(roleId)) regsByRole.set(roleId, []);
    regsByRole.get(roleId).push(reg);
  }

  // 4. Assemble per-role output
  const result = roles
    .filter((role) => regsByRole.has(role._id.toString()))
    .map((role) => {
      const roleId = role._id.toString();
      const regs = regsByRole.get(roleId) || [];

      const people = regs.map((reg) => {
        const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
        const passes = passesByReg.get(reg._id.toString()) || [];
        const sightings = sightingsByReg.get(reg._id.toString()) || [];

        // Pick the most relevant pass: active inside > active > latest
        const activeInsidePass = passes.find((p) => p.isActive && p.qrPayload?.divisionInside);
        const activePass = activeInsidePass || passes.find((p) => p.isActive) || passes[0] || null;

        const session = activePass ? getPassSessionState(activePass) : null;
        const divisionInside = Boolean(session?.divisionInside);
        const gateEntryAt = session?.gateEntryAt || null;
        const gateExitAt = session?.gateExitAt || null;
        const divisionName = activePass?.qrPayload?.divisionName || null;
        const shiftName = activePass?.qrPayload?.shiftName || null;
        const currentDepartmentName = session?.currentDepartmentName || null;
        const hadGateActivity = passes.length > 0;
        const activitySeenToday = sightings.length > 0;
        const lastActivitySeenAt = sightings[0]?.createdAt || null;
        const activitySeenCount = sightings.length;
        // Activity for the day = gate pass OR activity-monitor sighting
        const hadActivityToday = hadGateActivity || activitySeenToday;

        return {
          registrationId: reg._id.toString(),
          displayName: display.displayName,
          registrationCode: reg.registrationCode,
          photoUrl: photoUrlFromPath(reg.photoPath),
          hadActivityToday,
          hadGateActivity,
          activitySeenToday,
          activitySeenCount,
          lastActivitySeenAt,
          divisionInside,
          divisionName,
          gateEntryAt,
          gateExitAt,
          currentDepartmentName,
          shiftName,
          selections: display.selections || [],
          payFrequency: reg.payFrequency || null,
          customPayDays: reg.customPayDays || null,
          payAmount: reg.payAmount ?? null,
          payFrequencyLabel: formatPayFrequencyLabel(reg.payFrequency, reg.customPayDays),
        };
      });

      // Sort: inside first → had activity → alphabetical
      people.sort((a, b) => {
        if (a.divisionInside !== b.divisionInside) return b.divisionInside ? 1 : -1;
        if (a.hadActivityToday !== b.hadActivityToday) return b.hadActivityToday ? 1 : -1;
        return (a.displayName || '').localeCompare(b.displayName || '');
      });

      const insideCount = people.filter((p) => p.divisionInside).length;
      const activeCount = people.filter((p) => p.hadActivityToday).length;

      return {
        roleId,
        roleName: role.name,
        isShiftBased: Boolean(role.isShiftBased),
        totalPeople: people.length,
        insideCount,
        activeCount,
        people,
      };
    });

  return { date: validDate, roles: result };
}

/**
 * Attendance history grid — rows are employees, columns are days in range.
 * Dates before registration (createdAt) are returned as blank.
 */
export async function getAttendanceHistoryGrid({
  dateFrom,
  dateTo,
  search = '',
  roleId = '',
  limit = 50,
  page = 1,
  divisionIds = null,
  payFrequency = '',
  shiftName = '',
  selectionFilters = '{}',
} = {}) {
  const today = todayDateString();
  const from = dateFrom || today.slice(0, 8) + '01';
  const toDate = dateTo || today;
  const dates = eachDateInRange(from, toDate);
  if (dates.length === 0) {
    return {
      dateFrom: from,
      dateTo: toDate,
      dates: [],
      employees: [],
      page: 1,
      limit: 50,
      total: 0,
      hasMore: false,
    };
  }

  // Keep pages small — each Registration doc carries a large faceEmbedding on disk,
  // and Atlas round-trips dominate when we pull hundreds at once.
  const limitN = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const pageN = Math.max(parseInt(page, 10) || 1, 1);

  const regQuery = { status: REGISTRATION_STATUS.VERIFIED };
  if (roleId) regQuery.roleId = roleId;

  // Division-scope (RBAC): restrict to people with check-in activity in the
  // user's accessible divisions, and only count activity from those divisions.
  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped) {
    if (divisionObjIds.length === 0) {
      return {
        ...emptyAttendanceGrid(from, toDate, dates),
        page: pageN,
        limit: limitN,
        total: 0,
        hasMore: false,
      };
    }
    const scopedRegIds = await registrationIdsWithDivisionActivity(divisionObjIds, { from, toDate });
    if (scopedRegIds.size === 0) {
      return {
        ...emptyAttendanceGrid(from, toDate, dates),
        page: pageN,
        limit: limitN,
        total: 0,
        hasMore: false,
      };
    }
    regQuery._id = { $in: [...scopedRegIds].map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (shiftName && shiftName !== '__none__') {
    const shiftRegIds = await Pass.distinct('registrationId', {
      validDate: { $gte: from, $lte: toDate },
      'qrPayload.shiftName': shiftName,
      ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {})
    });
    if (regQuery._id) {
       const existingIds = new Set(regQuery._id.$in.map(id => id.toString()));
       regQuery._id.$in = shiftRegIds.filter(id => existingIds.has(id.toString())).map(id => new mongoose.Types.ObjectId(id));
    } else {
       regQuery._id = { $in: shiftRegIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
  }

  // Hydrate all registrations for JS filtering (fast because no GateLogs/Passes are fetched yet)
  const allRegDocs = await Registration.find(regQuery)
    .select({ _id: 1, formData: 1, registrationCode: 1, roleId: 1, payFrequency: 1, formId: 1, createdAt: 1, photoPath: 1, customPayDays: 1, payAmount: 1 })
    .populate('roleId', 'name slug')
    .populate('formId', 'fields')
    .sort({ createdAt: 1 })
    .lean();

  const normalizedSearch = search.trim().toLowerCase();
  let parsedSelectionFilters = {};
  try { parsedSelectionFilters = JSON.parse(selectionFilters || '{}'); } catch (e) {}

  let shiftNoneRegIds = null;
  if (shiftName === '__none__') {
    const withShiftIds = await Pass.distinct('registrationId', {
      validDate: { $gte: from, $lte: toDate },
      'qrPayload.shiftName': { $exists: true, $ne: null },
      ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {})
    });
    shiftNoneRegIds = new Set(withShiftIds.map(id => id.toString()));
  }

  const filteredRegs = allRegDocs.filter(reg => {
    if (payFrequency && reg.payFrequency !== payFrequency) return false;
    
    if (shiftNoneRegIds && shiftNoneRegIds.has(reg._id.toString())) return false;
    
    const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
    
    for (const [label, val] of Object.entries(parsedSelectionFilters)) {
      if (val && val !== 'all') {
        const sel = (display.selections || []).find((s) => s.label === label);
        if (!sel || sel.value !== val) return false;
      }
    }
    
    if (normalizedSearch) {
      const match = 
        (display.displayName || '').toLowerCase().includes(normalizedSearch) ||
        (reg.registrationCode || '').toLowerCase().includes(normalizedSearch) ||
        (reg.roleId?.name || '').toLowerCase().includes(normalizedSearch) ||
        (display.displayPhone || '').toLowerCase().includes(normalizedSearch);
      if (!match) return false;
    }
    
    reg._display = display; // cache it
    return true;
  });

  const total = filteredRegs.length;
  const startIdx = (pageN - 1) * limitN;
  const pageRegs = filteredRegs.slice(startIdx, startIdx + limitN);
  const pageIds = pageRegs.map(r => r._id);

  if (pageIds.length === 0) {
    return {
      ...emptyAttendanceGrid(from, toDate, dates),
      page: pageN,
      limit: limitN,
      total,
      hasMore: false,
    };
  }

  const rangeStart = startOfDayIst(from);
  // Extend upper bound by one extra IST day so post-midnight logs that belong
  // to an overnight shift on `toDate` are included in the fetch.
  const rangeEnd = endOfDayIst(nextDateIst(toDate));

  const passMatch = {
    registrationId: { $in: pageIds },
    passType: PASS_TYPES.DAY_PASS,
    validDate: { $gte: from, $lte: toDate },
    ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {}),
  };

  const [rawLogs, rawPasses] = await Promise.all([
    GateLog.find(
      grantedGateLogFilter({
        registrationId: { $in: pageIds },
        createdAt: { $gte: rangeStart, $lte: rangeEnd },
        ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {}),
      })
    )
      .select({ registrationId: 1, scanType: 1, eventType: 1, createdAt: 1 })
      .lean(),
    // Project only shift/session fields — full qrPayload is huge (QR images, visits).
    Pass.aggregate([
      { $match: passMatch },
      {
        $project: {
          registrationId: 1,
          validDate: 1,
          createdAt: 1,
          qrPayload: {
            shiftId: '$qrPayload.shiftId',
            shiftName: '$qrPayload.shiftName',
            totalHours: '$qrPayload.totalHours',
            shiftStartTime: '$qrPayload.shiftStartTime',
            shiftEndTime: '$qrPayload.shiftEndTime',
            halfDayMinHours: '$qrPayload.halfDayMinHours',
            fullDayMinHours: '$qrPayload.fullDayMinHours',
            gateEntryAt: '$qrPayload.gateEntryAt',
            gateExitAt: '$qrPayload.gateExitAt',
          },
        },
      },
    ]),
  ]);

  // Use pre-populated pageRegs
  const orderedRegs = pageRegs;

  const logs = rawLogs;
  const passes = rawPasses.map(slimPassForAttendance);

  // Build passByRegDate first so the overnight rebucket map can reference it.
  const passByRegDate = new Map();
  const initialShiftPassByRegDate = new Map();
  for (const pass of passes) {
    const key = `${pass.registrationId.toString()}|${pass.validDate}`;
    const existing = passByRegDate.get(key);
    if (!existing || pass.createdAt > existing.createdAt) {
      passByRegDate.set(key, pass);
    }

    if (pass.qrPayload?.shiftId) {
      const initialShiftPass = initialShiftPassByRegDate.get(key);
      if (!initialShiftPass || pass.createdAt < initialShiftPass.createdAt) {
        initialShiftPassByRegDate.set(key, pass);
      }
    }
  }

  // For overnight shifts, re-key post-midnight logs to the shift's work-date
  // so they are grouped under the correct shift row instead of the next day.
  const overnightRebucket = buildOvernightRebucketMapByReg(logs, passByRegDate);

  const logsByRegDate = new Map();
  for (const log of logs) {
    const regId = log.registrationId.toString();
    const wallDate = logDateKey(log.createdAt);
    const date = overnightRebucket.get(log._id.toString()) || wallDate;
    const key = `${regId}|${date}`;
    const shiftPass =
      initialShiftPassByRegDate.get(key) || passByRegDate.get(key);
    if (
      shiftPass?.qrPayload?.shiftId &&
      !isWithinAssignedShiftWindow(log.createdAt, date, shiftPass)
    ) {
      continue;
    }
    if (!logsByRegDate.has(key)) logsByRegDate.set(key, []);
    logsByRegDate.get(key).push(log);
  }

  const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes));

  // Dates absorbed into a previous overnight shift row — marked blank per registration.
  const absorbedByReg = buildAbsorbedDatesByReg(passByRegDate);

  // Manual admin status overrides across all registrations on this page.
  const overrideMap = await loadOverrideMapForRegistrations(
    orderedRegs.map((reg) => reg._id),
    from,
    toDate
  );

  const employees = orderedRegs
    .map((reg) => {
      const display = reg._display;
      const role = reg.roleId;
      const regId = reg._id.toString();
      const registeredAt = reg.createdAt;
      const absorbedDates = absorbedByReg.get(regId) || new Set();

      const days = dates.map((date) => {
        // Suppress dates absorbed into the previous overnight shift row
        if (absorbedDates.has(date)) {
          return {
            date,
            status: 'blank',
            code: 'NR',
            label: 'Absorbed into overnight shift',
            payFactor: 0,
          };
        }
        const key = `${regId}|${date}`;
        const dayLogs = logsByRegDate.get(key);
        const pass = passByRegDate.get(key);
        const session = pass ? getPassSessionState(pass) : null;
        const initialShiftPass = initialShiftPassByRegDate.get(key);
        const shiftSession = initialShiftPass
          ? getPassSessionState(initialShiftPass)
          : session;
        const shift = shiftFromSession(shiftSession, shiftMap);

        const day = {
          date,
          ...resolveDayAttendance({
            date,
            registeredAt,
            dayLogs,
            session,
            shift,
            today,
          }),
        };
        return applyDayOverride(day, overrideMap.get(`${regId}|${date}`));
      });

      return {
        registrationId: regId,
        displayName: display.displayName,
        displayPhone: display.displayPhone || null,
        registrationCode: reg.registrationCode,
        roleName: role?.name || '—',
        photoUrl: photoUrlFromPath(reg.photoPath),
        registeredAt: registeredAt?.toISOString?.() || registeredAt,
        selections: display.selections || [],
        payFrequency: reg.payFrequency || null,
        customPayDays: reg.customPayDays || null,
        payAmount: reg.payAmount ?? null,
        payFrequencyLabel: formatPayFrequencyLabel(reg.payFrequency, reg.customPayDays),
        summary: summarizeAttendanceDays(days),
        payment: calculatePaymentSummary({
          payFrequency: reg.payFrequency,
          customPayDays: reg.customPayDays,
          payAmount: reg.payAmount,
          days,
        }),
        days,
      };
    })
    .filter((emp) => {
      if (!normalizedSearch) return true;
      return (
        emp.displayName?.toLowerCase().includes(normalizedSearch) ||
        emp.registrationCode?.toLowerCase().includes(normalizedSearch) ||
        emp.roleName?.toLowerCase().includes(normalizedSearch)
      );
    });

  return {
    dateFrom: from,
    dateTo: toDate,
    dates: dates.map((date) => ({ date, day: dayNumber(date), weekday: dayAbbrev(date) })),
    employees,
    page: pageN,
    limit: limitN,
    total,
    hasMore: startIdx + limitN < total,
  };
}

export async function recalculateAttendanceHistory({
  dateFrom,
  dateTo,
  search = '',
  roleId = '',
  limit = 50,
  page = 1,
  divisionIds = null,
  registrationIds = null,
  payFrequency = '',
  shiftName = '',
  selectionFilters = '{}',
} = {}) {
  const today = todayDateString();
  const from = dateFrom || today.slice(0, 8) + '01';
  const toDate = dateTo || today;

  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];

  const passSyncQuery = {
    passType: PASS_TYPES.DAY_PASS,
    validDate: { $gte: from, $lte: toDate },
  };
  if (Array.isArray(registrationIds) && registrationIds.length > 0) {
    passSyncQuery.registrationId = { $in: toObjectIdArray(registrationIds) };
  }

  if (divisionScoped) {
    if (divisionObjIds.length === 0) {
      const emptyGrid = await getAttendanceHistoryGrid({
        dateFrom: from,
        dateTo: toDate,
        search,
        roleId,
        limit,
        page,
        divisionIds,
        payFrequency,
        shiftName,
        selectionFilters,
      });
      return {
        ...emptyGrid,
        recalculation: {
          recalculatedAt: new Date().toISOString(),
          dateFrom: from,
          dateTo: toDate,
          employeeCount: 0,
          passesUpdated: 0,
          shiftsApplied: 0,
          shiftDays: 0,
          presentDays: 0,
          partialDays: 0,
          absentDays: 0,
          totalPayroll: 0,
        },
      };
    }
    passSyncQuery.divisionId = { $in: divisionObjIds };
  }

  const passes = await Pass.find(passSyncQuery).lean();

  const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes));
  const bulkOps = [];

  for (const pass of passes) {
    const payload = pass.qrPayload || {};
    const shiftId = payload.shiftId ? String(payload.shiftId) : null;
    if (!shiftId) continue;

    const shift = shiftMap.get(shiftId);
    if (!shift) continue;

    const nextName = shift.name || payload.shiftName || '';
    const nextTotalHours = getShiftDurationHours(shift);
    const nextHalf = shift.halfDayMinHours ?? null;
    const nextFull = shift.fullDayMinHours ?? null;
    const nextValidUntil = resolveDayPassValidUntil({
      entryAt: payload.gateEntryAt || pass.validFrom || pass.createdAt,
      fallbackDate: pass.validFrom || new Date(),
      validDate: pass.validDate || payload.validDate || null,
      totalHours: nextTotalHours,
      startTime: shift.startTime || payload.shiftStartTime || null,
      endTime: shift.endTime || payload.shiftEndTime || null,
    });
    const hasExited = Boolean(payload.gateExitAt);

    const changed =
      payload.shiftName !== nextName ||
      payload.totalHours !== nextTotalHours ||
      payload.halfDayMinHours !== nextHalf ||
      payload.fullDayMinHours !== nextFull ||
      (!hasExited &&
        nextValidUntil &&
        new Date(pass.validUntil || 0).getTime() !== nextValidUntil.getTime());

    if (!changed) continue;

    const nextPayload = {
      ...payload,
      shiftId,
      shiftName: nextName,
      totalHours: nextTotalHours,
      halfDayMinHours: nextHalf,
      fullDayMinHours: nextFull,
      ...(!hasExited && nextValidUntil
        ? { validUntil: nextValidUntil.toISOString() }
        : {}),
    };
    const update = { qrPayload: nextPayload };
    if (!hasExited && nextValidUntil) {
      update.validUntil = nextValidUntil;
    }
    bulkOps.push({
      updateOne: {
        filter: { _id: pass._id },
        update: { $set: update },
      },
    });
  }

  let passesUpdated = 0;
  if (bulkOps.length > 0) {
    const bulkResult = await Pass.bulkWrite(bulkOps, { ordered: false });
    passesUpdated = bulkResult.modifiedCount || bulkOps.length;
  }

  const grid = await getAttendanceHistoryGrid({
    dateFrom: from,
    dateTo: toDate,
    search,
    roleId,
    limit,
    page,
    divisionIds,
    payFrequency,
    shiftName,
    selectionFilters,
  });

  let shiftDays = 0;
  let presentDays = 0;
  let partialDays = 0;
  let absentDays = 0;
  let totalPayroll = 0;

  for (const emp of grid.employees || []) {
    for (const day of emp.days || []) {
      if (day.status === 'blank') continue;
      if (day.shiftId || day.halfDayMinHours != null || day.fullDayMinHours != null) {
        shiftDays += 1;
      }
      if (day.status === 'P') presentDays += 1;
      else if (day.status === 'HD' || day.status === 'FH' || day.status === 'SH' || day.status === 'PT') {
        partialDays += 1;
      }
      else if (day.status === 'A') absentDays += 1;
    }
    if (emp.payment?.totalAmount) totalPayroll += Number(emp.payment.totalAmount) || 0;
  }

  return {
    ...grid,
    recalculation: {
      recalculatedAt: new Date().toISOString(),
      dateFrom: from,
      dateTo: toDate,
      employeeCount: (grid.employees || []).length,
      passesUpdated,
      shiftsApplied: shiftMap.size,
      shiftDays,
      presentDays,
      partialDays,
      absentDays,
      totalPayroll: Math.round(totalPayroll * 100) / 100,
    },
  };
}

/**
 * Department activity for a single division + department on a work date.
 * Counts (unique people):
 *   - enteredCount — had at least one department entry
 *   - inCount      — currently checked into the department (open visit)
 *   - exitCount    — had at least one department exit
 */
export async function getDepartmentActivity({
  divisionId = null,
  departmentId = null,
  date = null,
} = {}) {
  const today = todayDateString();
  const validDate =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  if (!divisionId || !mongoose.Types.ObjectId.isValid(divisionId)) {
    const err = new Error('divisionId is required');
    err.status = 400;
    throw err;
  }
  if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
    const err = new Error('departmentId is required');
    err.status = 400;
    throw err;
  }

  const department = await Department.findById(departmentId).lean();
  if (!department) {
    const err = new Error('Department not found');
    err.status = 404;
    throw err;
  }

  const belongsToDivision = (department.divisionIds || []).some(
    (id) => id.toString() === String(divisionId)
  );
  if (!belongsToDivision) {
    const err = new Error('Department does not belong to the selected division');
    err.status = 400;
    throw err;
  }

  const dayStart = startOfDayIst(validDate);
  const dayEnd = endOfDayIst(validDate);

  const logs = await GateLog.find(
    grantedGateLogFilter({
      divisionId,
      departmentId,
      scanType: SCAN_TYPES.DEPARTMENT,
      registrationId: { $ne: null },
      createdAt: { $gte: dayStart, $lte: dayEnd },
    })
  )
    .sort({ createdAt: 1 })
    .lean();

  const logsByReg = new Map();
  for (const log of logs) {
    const regId = log.registrationId?.toString();
    if (!regId) continue;
    if (!logsByReg.has(regId)) logsByReg.set(regId, []);
    logsByReg.get(regId).push(log);
  }

  const regIds = [...logsByReg.keys()];
  if (regIds.length === 0) {
    return {
      date: validDate,
      divisionId: String(divisionId),
      departmentId: String(departmentId),
      departmentName: department.name,
      enteredCount: 0,
      inCount: 0,
      exitCount: 0,
      people: [],
    };
  }

  const registrations = await Registration.find({
    _id: { $in: regIds.map((id) => new mongoose.Types.ObjectId(id)) },
    status: REGISTRATION_STATUS.VERIFIED,
  })
    .select('-faceEmbedding')
    .populate('roleId', 'name slug')
    .populate('formId', 'fields')
    .lean();

  const regMap = new Map(registrations.map((r) => [r._id.toString(), r]));
  const people = [];

  for (const [regId, personLogs] of logsByReg) {
    const reg = regMap.get(regId);
    if (!reg) continue;

    let openEntryAt = null;
    let firstEntryAt = null;
    let lastExitAt = null;
    let entryEvents = 0;
    let exitEvents = 0;
    let lastRemark = '';

    for (const log of personLogs) {
      const at = log.createdAt;
      const remark =
        typeof log.remark === 'string' && log.remark.trim() ? log.remark.trim() : '';

      if (log.eventType === GATE_EVENT_TYPES.ENTRY) {
        entryEvents += 1;
        if (!firstEntryAt) firstEntryAt = at;
        openEntryAt = at;
        if (remark) lastRemark = remark;
      } else if (log.eventType === GATE_EVENT_TYPES.EXIT) {
        exitEvents += 1;
        lastExitAt = at;
        openEntryAt = null;
        if (remark) lastRemark = remark;
      }
    }

    const currentlyIn = openEntryAt !== null;
    const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);

    people.push({
      registrationId: regId,
      displayName: display.displayName,
      registrationCode: reg.registrationCode,
      photoUrl: photoUrlFromPath(reg.photoPath),
      roleId: reg.roleId?._id?.toString() || null,
      roleName: reg.roleId?.name || null,
      entryAt: firstEntryAt || openEntryAt || null,
      exitAt: currentlyIn ? null : lastExitAt,
      currentlyIn,
      hadEntry: entryEvents > 0,
      hadExit: exitEvents > 0,
      remark: lastRemark,
      selections: display.selections || [],
    });
  }

  people.sort((a, b) => {
    if (a.currentlyIn !== b.currentlyIn) return a.currentlyIn ? -1 : 1;
    const ae = a.entryAt ? new Date(a.entryAt).getTime() : 0;
    const be = b.entryAt ? new Date(b.entryAt).getTime() : 0;
    return be - ae;
  });

  return {
    date: validDate,
    divisionId: String(divisionId),
    departmentId: String(departmentId),
    departmentName: department.name,
    enteredCount: people.filter((p) => p.hadEntry).length,
    inCount: people.filter((p) => p.currentlyIn).length,
    exitCount: people.filter((p) => p.hadExit).length,
    people,
  };
}
