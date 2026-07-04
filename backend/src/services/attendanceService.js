import Pass from '../models/Pass.js';
import GateLog from '../models/GateLog.js';
import Division from '../models/Division.js';
import Department from '../models/Department.js';
import { PASS_TYPES, GATE_EVENT_TYPES, SCAN_TYPES } from '../constants/index.js';
import { getRequiredSteps } from '../constants/accessRules.js';
import { buildQrDataUrl, formatPassResponse } from './passService.js';
import { photoUrlFromPath } from '../utils/displayInfo.js';

export function todayDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getActiveDayPass(registrationId, divisionId) {
  const validDate = todayDateString();
  return Pass.findOne({
    registrationId,
    divisionId,
    passType: PASS_TYPES.DAY_PASS,
    validDate,
    isActive: true,
  }).sort({ createdAt: -1 });
}

export const DEPARTMENT_DENIAL_REASONS = {
  NO_GATE_ENTRY: 'no_gate_entry',
  ACTIVE_IN_OTHER_DEPARTMENT: 'active_in_other_department',
  ACTIVE_IN_OTHER_DIVISION: 'active_in_other_division',
  ALREADY_IN_DEPARTMENT: 'already_in_department',
  NOT_IN_DEPARTMENT: 'not_in_department',
  NOT_CHECKED_IN: 'not_checked_in',
};

export const GATE_DENIAL_REASONS = {
  ALREADY_IN_DIVISION: 'already_in_division',
  ACTIVE_IN_OTHER_DIVISION: 'active_in_other_division',
  DEPARTMENT_STILL_ACTIVE: 'department_still_active',
  NOT_CHECKED_IN: 'not_checked_in',
};

export function getPassSessionState(pass) {
  if (!pass?.qrPayload) {
    return {
      divisionInside: false,
      currentDepartmentId: null,
      currentDepartmentName: null,
      departmentVisits: [],
    };
  }
  const payload = pass.qrPayload;
  return {
    divisionInside: Boolean(payload.divisionInside),
    currentDepartmentId: payload.currentDepartmentId || null,
    currentDepartmentName: payload.currentDepartmentName || null,
    departmentVisits: Array.isArray(payload.departmentVisits) ? payload.departmentVisits : [],
    gateEntryAt: payload.gateEntryAt || null,
    gateExitAt: payload.gateExitAt || null,
  };
}

function activeDivisionFromSession(session) {
  if (!session) return null;
  return {
    divisionId: session.divisionId,
    divisionName: session.divisionName,
  };
}

export async function isPersonInsideTargetDivision(registrationId, targetDivisionId) {
  const targetId = targetDivisionId?.toString();
  const activeSession = registrationId ? await getActiveDivisionSession(registrationId) : null;
  if (activeSession && activeSession.divisionId === targetId) {
    return Boolean(activeSession.sessionState?.divisionInside);
  }
  const pass = registrationId ? await getActiveDayPass(registrationId, targetId) : null;
  return Boolean(getPassSessionState(pass).divisionInside);
}

export async function resolveAutoGateEventType(registrationId, targetDivisionId) {
  const inside = await isPersonInsideTargetDivision(registrationId, targetDivisionId);
  return inside ? GATE_EVENT_TYPES.EXIT : GATE_EVENT_TYPES.ENTRY;
}

export function isOppositeGateEvent(personInside, eventType) {
  if (eventType === GATE_EVENT_TYPES.ENTRY) return personInside;
  if (eventType === GATE_EVENT_TYPES.EXIT) return !personInside;
  return false;
}

export async function getActiveDivisionSession(registrationId) {
  const validDate = todayDateString();
  const startOfDay = new Date(`${validDate}T00:00:00.000Z`);
  const endOfDayDate = endOfDay();

  const activePasses = await Pass.find({
    registrationId,
    passType: PASS_TYPES.DAY_PASS,
    validDate,
    isActive: true,
  }).populate('divisionId', 'name');

  for (const pass of activePasses) {
    const state = getPassSessionState(pass);
    if (!state.divisionInside) continue;
    const divisionId = pass.divisionId?._id?.toString() || pass.divisionId?.toString();
    return {
      divisionId,
      divisionName: pass.qrPayload?.divisionName || pass.divisionId?.name || 'Division',
      sessionState: state,
      pass,
    };
  }

  const divisionIds = await GateLog.distinct('divisionId', {
    registrationId,
    scanType: SCAN_TYPES.GATE,
    matched: true,
    createdAt: { $gte: startOfDay, $lte: endOfDayDate },
  });

  for (const divId of divisionIds) {
    const entry = await hasTodayGateEntry(registrationId, divId);
    if (!entry.ok) continue;
    const division = await Division.findById(divId).select('name');
    const pass = await getActiveDayPass(registrationId, divId);
    return {
      divisionId: divId.toString(),
      divisionName: pass?.qrPayload?.divisionName || division?.name || 'Division',
      sessionState: getPassSessionState(pass),
      pass,
    };
  }

  return null;
}

function denialExtras(reason, sessionState = null) {
  return {
    requiredSteps: getRequiredSteps(reason, {
      hasActiveDepartment: Boolean(sessionState?.currentDepartmentId),
    }),
  };
}

export async function validateGateScan(pass, eventType, registrationId, targetDivisionId) {
  const targetId = targetDivisionId?.toString();
  const state = getPassSessionState(pass);
  const activeSession = registrationId ? await getActiveDivisionSession(registrationId) : null;
  const activeDivision = activeDivisionFromSession(activeSession);

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    if (state.divisionInside) {
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.ALREADY_IN_DIVISION,
        error: 'Active gate entry exists. Check out at this division gate before another gate entry.',
        activeDivision,
        sessionState: state,
        ...denialExtras(GATE_DENIAL_REASONS.ALREADY_IN_DIVISION, state),
      };
    }
    if (activeSession && activeSession.divisionId !== targetId) {
      const deptName = activeSession.sessionState.currentDepartmentName;
      const error = deptName
        ? `Checked into "${activeSession.divisionName}" (department: ${deptName}). Check out of the department, then check out at the division gate, before entering another division.`
        : `Already checked in at "${activeSession.divisionName}". Check out at that division gate before entering another.`;
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION,
        error,
        activeDivision,
        activeDepartment: activeDepartmentFromState(activeSession.sessionState),
        sessionState: activeSession.sessionState,
        pass: activeSession.pass,
        ...denialExtras(GATE_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION, activeSession.sessionState),
      };
    }
    return { ok: true };
  }

  if (eventType === GATE_EVENT_TYPES.EXIT) {
    if (!activeSession) {
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.NOT_CHECKED_IN,
        error: 'Not checked in at any division gate today. Entry required before exit.',
        activeDivision: null,
      };
    }
    if (activeSession.divisionId !== targetId) {
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION,
        error: `Currently checked in at "${activeSession.divisionName}". Use that division's gate to check out.`,
        activeDivision,
        sessionState: activeSession.sessionState,
        pass: activeSession.pass,
        ...denialExtras(GATE_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION, activeSession.sessionState),
      };
    }
    const exitState = activeSession.sessionState;
    if (exitState.currentDepartmentId) {
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.DEPARTMENT_STILL_ACTIVE,
        error: `Check out of department "${exitState.currentDepartmentName || 'current'}" before leaving the division.`,
        activeDivision,
        activeDepartment: activeDepartmentFromState(exitState),
        sessionState: exitState,
        ...denialExtras(GATE_DENIAL_REASONS.DEPARTMENT_STILL_ACTIVE, exitState),
      };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Invalid event type' };
}

function activeDepartmentFromState(state) {
  if (!state.currentDepartmentId) return null;
  return {
    departmentId: state.currentDepartmentId,
    departmentName: state.currentDepartmentName,
  };
}

export async function hasTodayGateEntry(registrationId, divisionId) {
  const pass = await getActiveDayPass(registrationId, divisionId);
  const state = getPassSessionState(pass);
  if (state.divisionInside) {
    return { ok: true, gateEntryAt: state.gateEntryAt || null };
  }

  const validDate = todayDateString();
  const startOfDay = new Date(`${validDate}T00:00:00.000Z`);
  const endOfDayDate = endOfDay();

  const lastGateEntry = await GateLog.findOne({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.ENTRY,
    matched: true,
    createdAt: { $gte: startOfDay, $lte: endOfDayDate },
  }).sort({ createdAt: -1 });

  if (!lastGateEntry) {
    return { ok: false, gateEntryAt: null };
  }

  const lastGateExit = await GateLog.findOne({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.EXIT,
    matched: true,
    createdAt: { $gt: lastGateEntry.createdAt, $lte: endOfDayDate },
  }).sort({ createdAt: -1 });

  return {
    ok: !lastGateExit,
    gateEntryAt: lastGateEntry.createdAt?.toISOString?.() || lastGateEntry.createdAt,
  };
}

export async function madeGateEntryToday(registrationId, divisionId) {
  if (!registrationId || !divisionId) return false;
  const validDate = todayDateString();
  const startOfDay = new Date(`${validDate}T00:00:00.000Z`);
  const endOfDayDate = endOfDay();

  const count = await GateLog.countDocuments({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.ENTRY,
    matched: true,
    createdAt: { $gte: startOfDay, $lte: endOfDayDate },
  });

  return count > 0;
}

export async function validateDepartmentScan(pass, department, eventType, registrationId, divisionId) {
  const state = getPassSessionState(pass);
  const activeSession = await getActiveDivisionSession(registrationId);
  const targetDivisionId = divisionId.toString();

  if (activeSession && activeSession.divisionId !== targetDivisionId) {
    const deptName = activeSession.sessionState.currentDepartmentName;
    const error = deptName
      ? `Active in "${activeSession.divisionName}" (department: ${deptName}). Check out of the department, then check out at the division gate, before using another division.`
      : `Currently checked in at division "${activeSession.divisionName}". Check out at the division gate before using another division.`;
    return {
      ok: false,
      reason: DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION,
      error,
      hasGateEntry: false,
      activeDepartment: activeDepartmentFromState(activeSession.sessionState),
      activeDivision: activeDivisionFromSession(activeSession),
      sessionState: activeSession.sessionState,
      pass: activeSession.pass,
      ...denialExtras(DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DIVISION, activeSession.sessionState),
    };
  }

  const gateEntry = await hasTodayGateEntry(registrationId, divisionId);
  const hasGateEntry = gateEntry.ok;
  const activeDepartment = activeDepartmentFromState(state);

  if (!hasGateEntry) {
    return {
      ok: false,
      reason: DEPARTMENT_DENIAL_REASONS.NO_GATE_ENTRY,
      error: 'No division gate entry today. Complete gate entry before department check-in or check-out.',
      hasGateEntry: false,
      activeDepartment,
      ...denialExtras(DEPARTMENT_DENIAL_REASONS.NO_GATE_ENTRY),
    };
  }

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    if (state.currentDepartmentId) {
      if (state.currentDepartmentId === department._id.toString()) {
        return {
          ok: false,
          reason: DEPARTMENT_DENIAL_REASONS.ALREADY_IN_DEPARTMENT,
          error: 'Already checked into this department. Check out first before another check-in.',
          hasGateEntry: true,
          activeDepartment,
          ...denialExtras(DEPARTMENT_DENIAL_REASONS.ALREADY_IN_DEPARTMENT, state),
        };
      }
      return {
        ok: false,
        reason: DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT,
        error: `Still checked into "${state.currentDepartmentName}". Check out before entering another department.`,
        hasGateEntry: true,
        activeDepartment,
        ...denialExtras(DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT, state),
      };
    }
    return { ok: true, hasGateEntry: true, activeDepartment: null };
  }

  if (eventType === GATE_EVENT_TYPES.EXIT) {
    if (!state.currentDepartmentId) {
      return {
        ok: false,
        reason: DEPARTMENT_DENIAL_REASONS.NOT_CHECKED_IN,
        error: 'Not checked into any department.',
        hasGateEntry: true,
        activeDepartment: null,
      };
    }
    if (state.currentDepartmentId !== department._id.toString()) {
      return {
        ok: false,
        reason: DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT,
        error: `Currently checked into "${state.currentDepartmentName}", not this department.`,
        hasGateEntry: true,
        activeDepartment,
        ...denialExtras(DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT, state),
      };
    }
    return { ok: true, hasGateEntry: true, activeDepartment };
  }

  return { ok: false, error: 'Invalid event type', hasGateEntry };
}

export async function createOrRefreshDayPass({
  registration,
  role,
  display,
  gateLogId,
  divisionId,
  divisionName,
}) {
  const now = new Date();
  const validDate = todayDateString(now);

  const existing = await getActiveDayPass(registration._id, divisionId);
  if (existing) {
    const state = getPassSessionState(existing);
    if (state.divisionInside) {
      return formatPassResponse(existing);
    }
  }

  await Pass.updateMany(
    {
      registrationId: registration._id,
      divisionId,
      passType: PASS_TYPES.DAY_PASS,
      validDate,
      isActive: true,
    },
    { isActive: false }
  );

  const passCode = existing?.passCode || `DAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const qrPayload = {
    type: PASS_TYPES.DAY_PASS,
    passCode,
    registrationCode: registration.registrationCode,
    registrationId: registration._id.toString(),
    gateLogId: gateLogId?.toString(),
    divisionId: divisionId.toString(),
    divisionName: divisionName || '',
    holderName: display.displayName,
    role: role.name,
    validDate,
    validUntil: endOfDay(now).toISOString(),
    issuedAt: now.toISOString(),
    gateEntryAt: now.toISOString(),
    gateExitAt: null,
    divisionInside: true,
    currentDepartmentId: null,
    currentDepartmentName: null,
    departmentVisits: [],
  };

  const pass = await Pass.create({
    passCode,
    passType: PASS_TYPES.DAY_PASS,
    registrationId: registration._id,
    roleId: role._id || registration.roleId,
    gateLogId,
    divisionId,
    validDate,
    validFrom: now,
    validUntil: endOfDay(now),
    holderName: display.displayName,
    holderPhotoUrl: photoUrlFromPath(registration.photoPath),
    roleName: role.name,
    registrationCode: registration.registrationCode,
    details: display.details,
    qrPayload,
    isActive: true,
  });

  return formatPassResponse(pass, await buildQrDataUrl(passCode));
}

export async function updateDayPassAfterDepartmentScan(pass, department, eventType) {
  const now = new Date();
  const payload = { ...(pass.qrPayload || {}) };
  const visits = Array.isArray(payload.departmentVisits) ? [...payload.departmentVisits] : [];

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    visits.push({
      departmentId: department._id.toString(),
      departmentName: department.name,
      entryAt: now.toISOString(),
      exitAt: null,
    });
    payload.currentDepartmentId = department._id.toString();
    payload.currentDepartmentName = department.name;
  } else {
    const openIdx = [...visits].reverse().findIndex(
      (v) => v.departmentId === department._id.toString() && !v.exitAt
    );
    if (openIdx >= 0) {
      const idx = visits.length - 1 - openIdx;
      visits[idx] = { ...visits[idx], exitAt: now.toISOString() };
    }
    payload.currentDepartmentId = null;
    payload.currentDepartmentName = null;
  }

  payload.departmentVisits = visits;
  payload.updatedAt = now.toISOString();

  pass.qrPayload = payload;
  pass.markModified('qrPayload');
  await pass.save();

  return formatPassResponse(pass, await buildQrDataUrl(pass.passCode));
}

export async function updateDayPassAfterGateExit(pass) {
  const now = new Date();
  const payload = { ...(pass.qrPayload || {}) };
  payload.divisionInside = false;
  payload.gateExitAt = now.toISOString();
  payload.currentDepartmentId = null;
  payload.currentDepartmentName = null;
  payload.updatedAt = now.toISOString();

  pass.qrPayload = payload;
  pass.isActive = false;
  pass.markModified('qrPayload');
  await pass.save();

  return formatPassResponse(pass, await buildQrDataUrl(pass.passCode));
}

export async function loadDivisionAndDepartment(divisionId, departmentId) {
  const division = divisionId ? await Division.findById(divisionId) : null;
  const department = departmentId ? await Department.findById(departmentId) : null;
  return { division, department };
}

export { SCAN_TYPES };
