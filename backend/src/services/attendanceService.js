import Pass from '../models/Pass.js';
import GateLog from '../models/GateLog.js';
import Division from '../models/Division.js';
import Department from '../models/Department.js';
import {
  PASS_TYPES,
  GATE_EVENT_TYPES,
  SCAN_TYPES,
  MIN_CHECKOUT_INTERVAL_MS,
  DAY_PASS_DURATION_MS,
  SHIFT_OVERSTAY_GRACE_MS,
} from '../constants/index.js';
import { getRequiredSteps } from '../constants/accessRules.js';
import { buildQrDataUrl, formatPassResponse } from './passService.js';
import { photoUrlFromPath } from '../utils/displayInfo.js';
import { grantedGateLogFilter } from '../utils/gateLogFilters.js';
import {
  todayDateStringIst,
  startOfDayIst,
  endOfDayIst,
  resolveDayPassValidUntil,
  shiftEndAtIst,
} from '../utils/istTime.js';

export function todayDateString(date = new Date()) {
  return todayDateStringIst(date);
}

export function startOfDay(date = new Date()) {
  return startOfDayIst(date);
}

export function endOfDay(date = new Date()) {
  return endOfDayIst(date);
}

/**
 * Working-window end for a session:
 * assigned shift end + 4h grace when the pass has shift timings,
 * otherwise stored validUntil, otherwise gateEntryAt + 24h.
 */
export function resolvePassSessionEnd(pass) {
  if (!pass) return null;

  const payload = pass.qrPayload || {};
  const entryRaw = payload.gateEntryAt || pass.validFrom || pass.createdAt || null;
  const entryAt = entryRaw ? new Date(entryRaw) : null;
  const entryTime =
    entryAt && !Number.isNaN(entryAt.getTime()) ? entryAt.getTime() : null;

  const validDate = pass.validDate || payload.validDate || null;
  const shiftEnd = shiftEndAtIst(validDate, payload.shiftStartTime, payload.shiftEndTime);
  if (shiftEnd) {
    let windowEnd = shiftEnd.getTime() + SHIFT_OVERSTAY_GRACE_MS;
    // Late entries (after the shift window closed) still get the grace period
    if (entryTime && windowEnd <= entryTime) {
      windowEnd = entryTime + SHIFT_OVERSTAY_GRACE_MS;
    }
    return new Date(windowEnd);
  }

  if (pass.validUntil) {
    const stored = new Date(pass.validUntil);
    if (!Number.isNaN(stored.getTime())) return stored;
  }

  return entryTime ? new Date(entryTime + DAY_PASS_DURATION_MS) : null;
}

/**
 * True when a pass is still a live gate session within the 24h access window.
 */
function isLiveOpenSession(pass, now = new Date()) {
  if (!pass?.isActive) return false;
  if (!getPassSessionState(pass).divisionInside) return false;
  const sessionEnd = resolvePassSessionEnd(pass);
  if (!sessionEnd) return false;
  return sessionEnd.getTime() >= now.getTime();
}

/**
 * Active day pass for a registration + division.
 * Uses a rolling 24h window from gate check-in (not IST calendar midnight),
 * so overnight shifts stay valid across the day boundary.
 */
export async function getActiveDayPass(registrationId, divisionId) {
  if (!registrationId || !divisionId) return null;

  const now = new Date();
  const candidates = await Pass.find({
    registrationId,
    divisionId,
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const liveOpen = candidates.find((pass) => isLiveOpenSession(pass, now));
  if (liveOpen) return liveOpen;

  // Same calendar day fallback (e.g. pass still active but already checked out of division).
  const validDate = todayDateString();
  return candidates.find((pass) => pass.validDate === validDate) || null;
}

export const DEPARTMENT_DENIAL_REASONS = {
  NO_GATE_ENTRY: 'no_gate_entry',
  ACTIVE_IN_OTHER_DEPARTMENT: 'active_in_other_department',
  ACTIVE_IN_OTHER_DIVISION: 'active_in_other_division',
  ALREADY_IN_DEPARTMENT: 'already_in_department',
  NOT_IN_DEPARTMENT: 'not_in_department',
  NOT_CHECKED_IN: 'not_checked_in',
  TOO_SOON_AFTER_ENTRY: 'too_soon_after_entry',
};

export const GATE_DENIAL_REASONS = {
  ALREADY_IN_DIVISION: 'already_in_division',
  ACTIVE_IN_OTHER_DIVISION: 'active_in_other_division',
  DEPARTMENT_STILL_ACTIVE: 'department_still_active',
  NOT_CHECKED_IN: 'not_checked_in',
  TOO_SOON_AFTER_ENTRY: 'too_soon_after_entry',
};

function remainingCheckoutWaitMs(entryAt, now = new Date()) {
  if (!entryAt) return 0;
  const entryTime = new Date(entryAt).getTime();
  if (Number.isNaN(entryTime)) return 0;
  const remaining = MIN_CHECKOUT_INTERVAL_MS - (now.getTime() - entryTime);
  return remaining > 0 ? remaining : 0;
}

function formatCheckoutWaitMessage(remainingMs, contextLabel) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const waitLabel = minutes > 0
    ? `${minutes} minute${minutes !== 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds !== 1 ? 's' : ''}` : ''}`
    : `${seconds} second${seconds !== 1 ? 's' : ''}`;
  return `Check-out not allowed yet. Wait at least 2 minutes after ${contextLabel} (about ${waitLabel} remaining).`;
}

function getOpenDepartmentEntryAt(state, departmentId) {
  const visits = state?.departmentVisits;
  if (!Array.isArray(visits)) return null;
  const deptId = departmentId?.toString();
  const openVisit = [...visits].reverse().find(
    (visit) => visit.departmentId === deptId && !visit.exitAt
  );
  return openVisit?.entryAt || null;
}

export function getPassSessionState(pass) {
  if (!pass?.qrPayload) {
    return {
      divisionInside: false,
      currentDepartmentId: null,
      currentDepartmentName: null,
      departmentVisits: [],
      shiftId: null,
      shiftName: null,
      shiftStartTime: null,
      shiftEndTime: null,
      halfDayMinHours: null,
      fullDayMinHours: null,
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
    shiftId: payload.shiftId || null,
    shiftName: payload.shiftName || null,
    shiftStartTime: payload.shiftStartTime || null,
    shiftEndTime: payload.shiftEndTime || null,
    halfDayMinHours: payload.halfDayMinHours ?? null,
    fullDayMinHours: payload.fullDayMinHours ?? null,
  };
}

/**
 * Rebuild department visit pairs from GateLog (source of truth for in/out times).
 * Window follows the active pass from work-date start through the 24h access window
 * so overnight sessions keep department visits across IST midnight.
 */
export async function buildDepartmentVisitsFromLogs(registrationId, divisionId, sessionPass = null) {
  if (!registrationId || !divisionId) return [];

  const pass = sessionPass || (await getActiveDayPass(registrationId, divisionId));
  const workDate = pass?.validDate || todayDateString();
  const dayStart = startOfDay(workDate);
  const todayEnd = endOfDay(todayDateString());
  const sessionEnd = resolvePassSessionEnd(pass) || todayEnd;
  const endOfDayDate =
    sessionEnd.getTime() > todayEnd.getTime() ? sessionEnd : todayEnd;

  const logs = await GateLog.find(
    grantedGateLogFilter({
      registrationId,
      divisionId,
      scanType: SCAN_TYPES.DEPARTMENT,
      createdAt: { $gte: dayStart, $lte: endOfDayDate },
    })
  )
    .populate('departmentId', 'name')
    .sort({ createdAt: 1 });

  const visits = [];
  /** @type {Map<string, object>} */
  const openByDept = new Map();

  for (const log of logs) {
    const departmentId =
      log.departmentId?._id?.toString() || log.departmentId?.toString() || null;
    if (!departmentId) continue;

    const departmentName = log.departmentId?.name || 'Department';
    const at = log.createdAt?.toISOString?.() || log.createdAt;
    const remark =
      typeof log.remark === 'string' && log.remark.trim() ? log.remark.trim() : '';

    if (log.eventType === GATE_EVENT_TYPES.ENTRY) {
      const visit = {
        departmentId,
        departmentName,
        entryAt: at,
        exitAt: null,
        remark,
      };
      visits.push(visit);
      openByDept.set(departmentId, visit);
    } else if (log.eventType === GATE_EVENT_TYPES.EXIT) {
      const open = openByDept.get(departmentId);
      if (open) {
        open.exitAt = at;
        openByDept.delete(departmentId);
      } else {
        visits.push({
          departmentId,
          departmentName,
          entryAt: null,
          exitAt: at,
          remark,
        });
      }
    }
  }

  return visits;
}

/**
 * Refresh pass.qrPayload.departmentVisits from GateLog so activity times stay accurate.
 */
export async function syncDepartmentVisitsFromLogs(pass, registrationId, divisionId) {
  if (!pass) return getPassSessionState(pass);

  const visits = await buildDepartmentVisitsFromLogs(registrationId, divisionId, pass);
  const payload = { ...(pass.qrPayload || {}) };
  payload.departmentVisits = visits;
  payload.updatedAt = new Date().toISOString();

  const open = [...visits].reverse().find((v) => !v.exitAt) || null;
  payload.currentDepartmentId = open?.departmentId || null;
  payload.currentDepartmentName = open?.departmentName || null;

  pass.qrPayload = payload;
  pass.markModified('qrPayload');
  await pass.save();

  return getPassSessionState(pass);
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

/**
 * Auto-resolve department event type.
 * If the person is currently checked into THIS department → checkout (exit).
 * Otherwise → checkin (entry).
 */
export async function resolveAutoDepartmentEventType(registrationId, divisionId, departmentId) {
  const pass = await getActiveDayPass(registrationId, divisionId?.toString());
  const state = getPassSessionState(pass);
  const isInDept = state.currentDepartmentId &&
    state.currentDepartmentId === departmentId?.toString();
  return isInDept ? GATE_EVENT_TYPES.EXIT : GATE_EVENT_TYPES.ENTRY;
}

export function isOppositeGateEvent(personInside, eventType) {
  if (eventType === GATE_EVENT_TYPES.ENTRY) return personInside;
  if (eventType === GATE_EVENT_TYPES.EXIT) return !personInside;
  return false;
}

export async function getActiveDivisionSession(registrationId) {
  const validDate = todayDateString();
  const now = new Date();
  const dayStart = startOfDay(validDate);
  const endOfDayDate = endOfDay(validDate);

  const activePasses = await Pass.find({
    registrationId,
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
  })
    .populate('divisionId', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

  for (const pass of activePasses) {
    const state = getPassSessionState(pass);
    if (!state.divisionInside) continue;
    if (!isLiveOpenSession(pass, now)) continue;
    const divisionId = pass.divisionId?._id?.toString() || pass.divisionId?.toString();
    return {
      divisionId,
      divisionName: pass.qrPayload?.divisionName || pass.divisionId?.name || 'Division',
      sessionState: state,
      pass,
    };
  }

  const divisionIds = await GateLog.distinct('divisionId', grantedGateLogFilter({
    registrationId,
    scanType: SCAN_TYPES.GATE,
    createdAt: { $gte: dayStart, $lte: endOfDayDate },
  }));

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

    const gateEntryAt = exitState.gateEntryAt
      || (await hasTodayGateEntry(registrationId, targetId)).gateEntryAt;
    const gateWaitMs = remainingCheckoutWaitMs(gateEntryAt);
    if (gateWaitMs > 0) {
      return {
        ok: false,
        reason: GATE_DENIAL_REASONS.TOO_SOON_AFTER_ENTRY,
        error: formatCheckoutWaitMessage(gateWaitMs, 'gate entry'),
        activeDivision,
        sessionState: exitState,
        checkoutWaitRemainingMs: gateWaitMs,
        ...denialExtras(GATE_DENIAL_REASONS.TOO_SOON_AFTER_ENTRY, exitState),
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
  const dayStart = startOfDay(validDate);
  const endOfDayDate = endOfDay(validDate);

  const lastGateEntry = await GateLog.findOne(grantedGateLogFilter({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.ENTRY,
    createdAt: { $gte: dayStart, $lte: endOfDayDate },
  })).sort({ createdAt: -1 });

  if (!lastGateEntry) {
    return { ok: false, gateEntryAt: null };
  }

  const lastGateExit = await GateLog.findOne(grantedGateLogFilter({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.EXIT,
    createdAt: { $gt: lastGateEntry.createdAt, $lte: endOfDayDate },
  })).sort({ createdAt: -1 });

  return {
    ok: !lastGateExit,
    gateEntryAt: lastGateEntry.createdAt?.toISOString?.() || lastGateEntry.createdAt,
  };
}

export async function madeGateEntryToday(registrationId, divisionId) {
  if (!registrationId || !divisionId) return false;

  // Open session within the 24h check-in window still counts after IST midnight.
  const openEntry = await hasTodayGateEntry(registrationId, divisionId);
  if (openEntry.ok) return true;

  const validDate = todayDateString();
  const dayStart = startOfDay(validDate);
  const endOfDayDate = endOfDay(validDate);

  const count = await GateLog.countDocuments(grantedGateLogFilter({
    registrationId,
    divisionId,
    scanType: SCAN_TYPES.GATE,
    eventType: GATE_EVENT_TYPES.ENTRY,
    createdAt: { $gte: dayStart, $lte: endOfDayDate },
  }));

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
      sessionState: state,
      ...denialExtras(DEPARTMENT_DENIAL_REASONS.NO_GATE_ENTRY, state),
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
          sessionState: state,
          ...denialExtras(DEPARTMENT_DENIAL_REASONS.ALREADY_IN_DEPARTMENT, state),
        };
      }
      return {
        ok: false,
        reason: DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT,
        error: `Still checked into "${state.currentDepartmentName}". Check out before entering another department.`,
        hasGateEntry: true,
        activeDepartment,
        sessionState: state,
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
        sessionState: state,
        ...denialExtras(DEPARTMENT_DENIAL_REASONS.ACTIVE_IN_OTHER_DEPARTMENT, state),
      };
    }

    const deptEntryAt = getOpenDepartmentEntryAt(state, department._id);
    const deptWaitMs = remainingCheckoutWaitMs(deptEntryAt);
    if (deptWaitMs > 0) {
      return {
        ok: false,
        reason: DEPARTMENT_DENIAL_REASONS.TOO_SOON_AFTER_ENTRY,
        error: formatCheckoutWaitMessage(deptWaitMs, 'department check-in'),
        hasGateEntry: true,
        activeDepartment,
        sessionState: state,
        checkoutWaitRemainingMs: deptWaitMs,
        ...denialExtras(DEPARTMENT_DENIAL_REASONS.TOO_SOON_AFTER_ENTRY, state),
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
  const validUntil = resolveDayPassValidUntil({ entryAt: now, fallbackDate: now });

  const existing = await getActiveDayPass(registration._id, divisionId);
  if (existing) {
    const state = getPassSessionState(existing);
    if (state.divisionInside) {
      return formatPassResponse(existing);
    }
  }

  // Deactivate any prior day pass for this division (including expired overnight sessions).
  // Also clear divisionInside so stale passes don't appear as open sessions in reports.
  await Pass.updateMany(
    {
      registrationId: registration._id,
      divisionId,
      passType: PASS_TYPES.DAY_PASS,
      isActive: true,
    },
    {
      isActive: false,
      $set: { 'qrPayload.divisionInside': false },
    }
  );

  // Also close any stale passes from OTHER divisions whose session window has
  // already expired. These accumulate when a person entered a different division
  // days ago and never exited — the session window (shiftEnd+4h or entry+24h)
  // has long passed so they are genuinely no longer active.
  const now2 = new Date();
  const staleOtherDivision = await Pass.find({
    registrationId: registration._id,
    divisionId: { $ne: divisionId },
    passType: PASS_TYPES.DAY_PASS,
    isActive: true,
    'qrPayload.divisionInside': true,
  });
  for (const stalePass of staleOtherDivision) {
    const sessionEnd = resolvePassSessionEnd(stalePass);
    // Only close if the session window is genuinely expired — don't touch
    // passes that are still live (e.g. long overnight or no-shift 24h window).
    if (sessionEnd && sessionEnd.getTime() <= now2.getTime()) {
      stalePass.isActive = false;
      stalePass.qrPayload = {
        ...(stalePass.qrPayload || {}),
        divisionInside: false,
        updatedAt: now2.toISOString(),
      };
      stalePass.markModified('qrPayload');
      await stalePass.save();
    }
  }

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
    validUntil: validUntil.toISOString(),
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
    validUntil,
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

export async function updateDayPassAfterDepartmentScan(pass, department, eventType, scannedAt = null) {
  const now = scannedAt ? new Date(scannedAt) : new Date();
  const payload = { ...(pass.qrPayload || {}) };
  const visits = Array.isArray(payload.departmentVisits) ? [...payload.departmentVisits] : [];
  const departmentId = department._id.toString();

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    visits.push({
      departmentId,
      departmentName: department.name,
      entryAt: now.toISOString(),
      exitAt: null,
    });
    payload.currentDepartmentId = departmentId;
    payload.currentDepartmentName = department.name;
  } else {
    const openIdx = [...visits].reverse().findIndex(
      (v) => String(v.departmentId) === departmentId && !v.exitAt
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
