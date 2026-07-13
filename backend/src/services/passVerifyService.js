import Pass from '../models/Pass.js';
import GateLog from '../models/GateLog.js';
import { formatPassResponse } from './passService.js';
import { getPassSessionState, todayDateString } from './attendanceService.js';
import { grantedGateLogFilter } from '../utils/gateLogFilters.js';

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
  return `${place} — ${action}`;
}

function buildTodayActive(sessionState, pass) {
  const divisionName = pass.qrPayload?.divisionName || 'Division';
  const active = [];

  if (sessionState.divisionInside) {
    active.push({
      id: 'gate-active',
      type: 'gate',
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
      id: `dept-${visit.departmentId}`,
      type: 'department',
      scanType: 'department',
      eventType: 'entry',
      label: `${visit.departmentName} — Check-in`,
      divisionName,
      departmentName: visit.departmentName,
      status: 'Active',
      entryAt: visit.entryAt,
      exitAt: null,
    });
  }

  return active;
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

export async function getPassVerifyInfo(passCode) {
  const passDoc = await Pass.findOne({ passCode }).sort({ createdAt: -1 });
  if (!passDoc) return null;

  const pass = await formatPassResponse(passDoc);
  const now = new Date();
  const expired = pass.validUntil && new Date(pass.validUntil) < now;
  const sessionState = getPassSessionState(passDoc);
  const today = todayDateString(now);
  const divisionId = pass.divisionId?.toString?.() || pass.divisionId || pass.qrPayload?.divisionId || null;

  const logFilter = grantedGateLogFilter({
    registrationId: pass.registrationId,
  });
  if (divisionId) logFilter.divisionId = divisionId;

  const logs = await GateLog.find(logFilter)
    .populate('divisionId', 'name slug')
    .populate('departmentId', 'name slug')
    .populate('gateRefId', 'name gateType slug')
    .sort({ createdAt: -1 })
    .limit(500);

  const todayEntries = logs
    .filter((log) => logDateKey(log.createdAt) === today)
    .map((entry) => ({
      ...formatLogEntry(entry),
      label: scanLabel(formatLogEntry(entry)),
    }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const todayActive = buildTodayActive(sessionState, pass);
  const entriesByDate = groupEntriesByDate(logs).map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      ...entry,
      label: scanLabel(entry),
    })),
  }));

  return {
    valid: passDoc.isActive && !expired,
    expired,
    inactive: !passDoc.isActive,
    pass,
    sessionState,
    details: {
      holderName: pass.holderName,
      holderPhotoUrl: pass.holderPhotoUrl,
      roleName: pass.roleName,
      registrationCode: pass.registrationCode,
      passCode: pass.passCode,
      passType: pass.passType,
      passTitle: pass.passTitle,
      validDate: pass.validDate,
      validFrom: pass.validFrom,
      validUntil: pass.validUntil,
      divisionId,
      divisionName: pass.qrPayload?.divisionName || null,
      shiftId: pass.qrPayload?.shiftId || null,
      shiftName: pass.qrPayload?.shiftName || null,
      details: pass.details || [],
      issuedAt: pass.qrPayload?.issuedAt || pass.createdAt,
    },
    todayActive,
    todayEntries,
    entriesByDate,
  };
}
