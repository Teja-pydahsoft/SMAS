import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Pass from '../models/Pass.js';
import Role from '../models/Role.js';
import Shift from '../models/Shift.js';
import mongoose from 'mongoose';
import { REGISTRATION_STATUS, PASS_TYPES, GENDER_LABELS, MIN_ATTENDANCE_HOURS } from '../constants/index.js';
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
  getShiftDurationHours,
  resolveShiftDayStatus,
} from '../utils/shiftAttendance.js';

function logDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
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
  const logMatch = grantedGateLogFilter({
    registrationId: { $ne: null },
    divisionId: { $in: divisionObjIds },
  });
  const passMatch = {
    passType: PASS_TYPES.DAY_PASS,
    divisionId: { $in: divisionObjIds },
  };
  if (from && toDate) {
    logMatch.createdAt = {
      $gte: new Date(`${from}T00:00:00.000Z`),
      $lte: new Date(`${toDate}T23:59:59.999Z`),
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
  if (filterGrantedLogs(dayLogs).length) return true;
  if (session?.gateEntryAt || session?.gateExitAt) return true;
  return false;
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

function resolveDayAttendance({ date, registeredAt, dayLogs, session, shift = null }) {
  const joinDate = logDateKey(registeredAt);
  const grantedLogs = filterGrantedLogs(dayLogs || []);
  const timings = extractDayTimings(dayLogs || [], session);
  const activityWindow = computeActivityWindow(grantedLogs, session, date, {
    today: todayDateString(),
  });
  const activityHours = activityWindow.hours;
  const shiftMeta = {
    activityHours,
    shiftId: shift?._id?.toString?.() || shift?.id || session?.shiftId || null,
    shiftName: shift?.name || session?.shiftName || null,
    shiftTotalHours: shift ? getShiftDurationHours(shift.startTime, shift.endTime) : null,
    halfDayMinHours: shift?.halfDayMinHours ?? null,
    fullDayMinHours: shift?.fullDayMinHours ?? null,
  };

  if (date < joinDate) {
    return {
      status: 'blank',
      code: 'NR',
      label: 'Not Registered',
      payFactor: 0,
      halfSide: null,
      ...timings,
      ...shiftMeta,
    };
  }

  if (!hasDayActivity(dayLogs, session)) {
    return {
      status: 'A',
      code: 'A',
      label: 'Absent',
      checkInTime: null,
      payFactor: 0,
      halfSide: null,
      ...timings,
      ...shiftMeta,
    };
  }

  const shiftStatus = resolveShiftDayStatus(activityHours, shift, {
    checkIn: activityWindow.start || timings.checkIn,
    checkOut: activityWindow.end || timings.lastActivityAt,
  });
  if (shiftStatus) {
    return {
      ...shiftStatus,
      checkInTime: formatTimeFromDate(timings.checkIn),
      ...timings,
      ...shiftMeta,
      halfSide: shiftStatus.halfSide ?? null,
      firstOverlapHours: shiftStatus.firstOverlapHours ?? null,
      secondOverlapHours: shiftStatus.secondOverlapHours ?? null,
      inShiftHours: shiftStatus.inShiftHours ?? null,
    };
  }

  // No shift thresholds configured — still require at least 1 hour on site
  if (activityHours < MIN_ATTENDANCE_HOURS) {
    return {
      status: 'A',
      code: 'A',
      label: 'Absent',
      checkInTime: formatTimeFromDate(timings.checkIn),
      payFactor: 0,
      halfSide: null,
      ...timings,
      ...shiftMeta,
    };
  }

  return {
    status: 'P',
    code: 'P',
    label: 'Present',
    checkInTime: formatTimeFromDate(timings.checkIn),
    payFactor: 1,
    halfSide: null,
    ...timings,
    ...shiftMeta,
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
  return shiftMap.get(shiftId) || null;
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

function groupEntriesByDate(logs) {
  const groups = new Map();

  for (const log of logs) {
    const date = logDateKey(log.createdAt);
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
    logQuery.createdAt = {
      $gte: new Date(`${dateFrom}T00:00:00.000Z`),
      $lte: new Date(`${dateTo}T23:59:59.999Z`),
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

  const todayActive = hasDateRange
    ? []
    : await buildTodayActiveForRegistration(registration._id, divisionScoped ? divisionObjIds : null);
  const entriesByDate = groupEntriesByDate(logs).map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      ...entry,
      label: scanLabel(entry),
    })),
  }));

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

    const logsByDate = new Map();
    for (const log of logs) {
      const date = logDateKey(log.createdAt);
      if (!logsByDate.has(date)) logsByDate.set(date, []);
      logsByDate.get(date).push(log);
    }

    const passByDate = new Map();
    for (const pass of passes) {
      const existing = passByDate.get(pass.validDate);
      if (!existing || pass.createdAt > existing.createdAt) {
        passByDate.set(pass.validDate, pass);
      }
    }

    const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes));

    const days = dates.map((date) => {
      const dayLogs = logsByDate.get(date) || [];
      const pass = passByDate.get(date);
      const session = pass ? getPassSessionState(pass) : null;
      const shift = shiftFromSession(session, shiftMap);
      return {
        date,
        ...resolveDayAttendance({
          date,
          registeredAt: registration.createdAt,
          dayLogs,
          session,
          shift,
        }),
      };
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

  const sessionState = activeSession?.sessionState || {
    divisionInside: false,
    currentDepartmentId: null,
    currentDepartmentName: null,
    departmentVisits: [],
  };

  const divisionNames = [...new Set(logs.map((log) => log.divisionId?.name).filter(Boolean))];

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
      totalScans: logs.length,
      divisionsVisited: divisionNames,
      lastScanAt: logs[0]?.createdAt || null,
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
 * today's day-pass status for every person.
 */
export async function getDailyPassByRole({ divisionIds = null } = {}) {
  const today = todayDateString();

  // 1. All active roles
  const roles = await Role.find({ isActive: true }).sort({ name: 1 }).lean();

  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped && divisionObjIds.length === 0) {
    return { date: today, roles: [] };
  }

  // 2. Today's day passes (one per registration+division), scoped when applicable
  const passQuery = { passType: PASS_TYPES.DAY_PASS, validDate: today };
  if (divisionScoped) passQuery.divisionId = { $in: divisionObjIds };
  const todayPasses = await Pass.find(passQuery).lean();

  // 3. Verified registrations grouped by roleId. When division-scoped, restrict
  //    to people who checked into an accessible division today.
  const regQuery = { status: REGISTRATION_STATUS.VERIFIED };
  if (divisionScoped) {
    const scopedRegIds = [
      ...new Set(todayPasses.map((p) => p.registrationId?.toString()).filter(Boolean)),
    ];
    if (scopedRegIds.length === 0) {
      return { date: today, roles: [] };
    }
    regQuery._id = { $in: scopedRegIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const registrations = await Registration.find(regQuery)
    .select('-faceEmbedding')
    .populate('roleId', 'name slug isShiftBased')
    .populate('formId', 'fields')
    .lean();

  // Build a map: registrationId → array of today's passes
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
        const hadActivityToday = passes.length > 0;

        return {
          registrationId: reg._id.toString(),
          displayName: display.displayName,
          registrationCode: reg.registrationCode,
          photoUrl: photoUrlFromPath(reg.photoPath),
          hadActivityToday,
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

  return { date: today, roles: result };
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
  limit = 500,
  divisionIds = null,
} = {}) {
  const today = todayDateString();
  const from = dateFrom || today.slice(0, 8) + '01';
  const toDate = dateTo || today;
  const dates = eachDateInRange(from, toDate);
  if (dates.length === 0) {
    return { dateFrom: from, dateTo: toDate, dates: [], employees: [] };
  }

  const regQuery = { status: REGISTRATION_STATUS.VERIFIED };
  if (roleId) regQuery.roleId = roleId;

  // Division-scope (RBAC): restrict to people with check-in activity in the
  // user's accessible divisions, and only count activity from those divisions.
  const divisionScoped = Array.isArray(divisionIds);
  const divisionObjIds = divisionScoped ? toObjectIdArray(divisionIds) : [];
  if (divisionScoped) {
    if (divisionObjIds.length === 0) {
      return emptyAttendanceGrid(from, toDate, dates);
    }
    const scopedRegIds = await registrationIdsWithDivisionActivity(divisionObjIds, { from, toDate });
    if (scopedRegIds.size === 0) {
      return emptyAttendanceGrid(from, toDate, dates);
    }
    regQuery._id = { $in: [...scopedRegIds].map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const registrations = await Registration.find(regQuery)
    .select('-faceEmbedding')
    .populate('roleId', 'name slug')
    .populate('formId', 'fields')
    .sort({ createdAt: 1 })
    .limit(parseInt(limit, 10) || 500)
    .lean();

  if (registrations.length === 0) {
    return emptyAttendanceGrid(from, toDate, dates);
  }

  const registrationIds = registrations.map((reg) => reg._id);
  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const rangeEnd = new Date(`${toDate}T23:59:59.999Z`);

  const [logs, passes] = await Promise.all([
    GateLog.find(
      grantedGateLogFilter({
        registrationId: { $in: registrationIds },
        createdAt: { $gte: rangeStart, $lte: rangeEnd },
        ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {}),
      })
    )
      .select('registrationId scanType eventType createdAt')
      .lean(),
    Pass.find({
      registrationId: { $in: registrationIds },
      passType: PASS_TYPES.DAY_PASS,
      validDate: { $gte: from, $lte: toDate },
      ...(divisionScoped ? { divisionId: { $in: divisionObjIds } } : {}),
    })
      .select('registrationId validDate qrPayload createdAt')
      .lean(),
  ]);

  const logsByRegDate = new Map();
  for (const log of logs) {
    const regId = log.registrationId.toString();
    const date = logDateKey(log.createdAt);
    const key = `${regId}|${date}`;
    if (!logsByRegDate.has(key)) logsByRegDate.set(key, []);
    logsByRegDate.get(key).push(log);
  }

  const passByRegDate = new Map();
  for (const pass of passes) {
    const key = `${pass.registrationId.toString()}|${pass.validDate}`;
    const existing = passByRegDate.get(key);
    if (!existing || pass.createdAt > existing.createdAt) {
      passByRegDate.set(key, pass);
    }
  }

  const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes));

  const normalizedSearch = search.trim().toLowerCase();

  const employees = registrations
    .map((reg) => {
      const display = buildDisplayInfo(reg.formData, reg.formId?.fields || []);
      const regId = reg._id.toString();
      const registeredAt = reg.createdAt;

      const days = dates.map((date) => {
        const key = `${regId}|${date}`;
        const dayLogs = logsByRegDate.get(key) || [];
        const pass = passByRegDate.get(key);
        const session = pass ? getPassSessionState(pass) : null;
        const shift = shiftFromSession(session, shiftMap);

        return {
          date,
          ...resolveDayAttendance({
            date,
            registeredAt,
            dayLogs,
            session,
            shift,
          }),
        };
      });

      return {
        registrationId: regId,
        displayName: display.displayName,
        displayPhone: display.displayPhone || null,
        registrationCode: reg.registrationCode,
        roleName: reg.roleId?.name || '—',
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
    })
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  return {
    dateFrom: from,
    dateTo: toDate,
    dates: dates.map((date) => ({ date, day: dayNumber(date), weekday: dayAbbrev(date) })),
    employees,
  };
}

/**
 * Sync day-pass shift snapshots from the live Shift documents, then rebuild
 * attendance + payroll for the range using current shift timings/thresholds.
 */
export async function recalculateAttendanceHistory({
  dateFrom,
  dateTo,
  search = '',
  roleId = '',
  limit = 500,
  divisionIds = null,
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
  if (divisionScoped) {
    if (divisionObjIds.length === 0) {
      const emptyGrid = await getAttendanceHistoryGrid({
        dateFrom: from,
        dateTo: toDate,
        search,
        roleId,
        limit,
        divisionIds,
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

  const passes = await Pass.find(passSyncQuery);

  const shiftMap = await loadShiftMap(collectShiftIdsFromPasses(passes.map((p) => p.toObject?.() || p)));
  let passesUpdated = 0;

  for (const pass of passes) {
    const payload = pass.qrPayload || {};
    const shiftId = payload.shiftId ? String(payload.shiftId) : null;
    if (!shiftId) continue;

    const shift = shiftMap.get(shiftId);
    if (!shift) continue;

    const nextName = shift.name || payload.shiftName || '';
    const nextStart = shift.startTime || '';
    const nextEnd = shift.endTime || '';
    const nextHalf = shift.halfDayMinHours ?? null;
    const nextFull = shift.fullDayMinHours ?? null;

    const changed =
      payload.shiftName !== nextName ||
      payload.shiftStartTime !== nextStart ||
      payload.shiftEndTime !== nextEnd ||
      payload.halfDayMinHours !== nextHalf ||
      payload.fullDayMinHours !== nextFull;

    if (!changed) continue;

    pass.qrPayload = {
      ...payload,
      shiftId,
      shiftName: nextName,
      shiftStartTime: nextStart,
      shiftEndTime: nextEnd,
      halfDayMinHours: nextHalf,
      fullDayMinHours: nextFull,
    };
    pass.markModified('qrPayload');
    await pass.save();
    passesUpdated += 1;
  }

  const grid = await getAttendanceHistoryGrid({
    dateFrom: from,
    dateTo: toDate,
    search,
    roleId,
    limit,
    divisionIds,
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
