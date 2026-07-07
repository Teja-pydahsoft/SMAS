import Registration from '../models/Registration.js';
import GateLog from '../models/GateLog.js';
import Pass from '../models/Pass.js';
import Role from '../models/Role.js';
import { REGISTRATION_STATUS, PASS_TYPES } from '../constants/index.js';
import { buildDisplayInfo, photoUrlFromPath } from '../utils/displayInfo.js';
import {
  getActiveDivisionSession,
  getPassSessionState,
  todayDateString,
} from './attendanceService.js';

function logDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
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

async function buildTodayActiveForRegistration(registrationId) {
  const validDate = todayDateString();
  const activePasses = await Pass.find({
    registrationId,
    passType: PASS_TYPES.DAY_PASS,
    validDate,
    isActive: true,
  });

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

export async function listRegistrationReports({ search = '', limit = 100 } = {}) {
  const matchedLogs = await GateLog.aggregate([
    { $match: { matched: true, registrationId: { $ne: null } } },
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

export async function getRegistrationReport(registrationId) {
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

  const logs = await GateLog.find({
    registrationId: registration._id,
    matched: true,
  })
    .populate('divisionId', 'name slug')
    .populate('departmentId', 'name slug')
    .populate('gateRefId', 'name gateType slug')
    .sort({ createdAt: -1 })
    .limit(1000);

  const todayEntries = logs
    .filter((log) => logDateKey(log.createdAt) === today)
    .map((entry) => ({
      ...formatLogEntry(entry),
      label: scanLabel(formatLogEntry(entry)),
    }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const todayActive = await buildTodayActiveForRegistration(registration._id);
  const entriesByDate = groupEntriesByDate(logs).map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      ...entry,
      label: scanLabel(entry),
    })),
  }));

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
export async function getDailyPassByRole() {
  const today = todayDateString();

  // 1. All active roles
  const roles = await Role.find({ isActive: true }).sort({ name: 1 }).lean();

  // 2. All verified registrations, grouped by roleId
  const registrations = await Registration.find({ status: REGISTRATION_STATUS.VERIFIED })
    .select('-faceEmbedding')
    .populate('roleId', 'name slug isShiftBased')
    .populate('formId', 'fields')
    .lean();

  // 3. All today's day passes (one per registration+division)
  const todayPasses = await Pass.find({
    passType: PASS_TYPES.DAY_PASS,
    validDate: today,
  }).lean();

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
