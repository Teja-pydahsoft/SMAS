import Pass from '../models/Pass.js';
import Division from '../models/Division.js';
import Department from '../models/Department.js';
import { PASS_TYPES, GATE_EVENT_TYPES, SCAN_TYPES } from '../constants/index.js';
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

export async function validateGateScan(pass, eventType) {
  const state = getPassSessionState(pass);

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    if (state.divisionInside) {
      return { ok: false, error: 'Already checked in at this division gate today. Check out first.' };
    }
    return { ok: true };
  }

  if (eventType === GATE_EVENT_TYPES.EXIT) {
    if (!state.divisionInside) {
      return { ok: false, error: 'Not checked in at division gate. Entry required before exit.' };
    }
    if (state.currentDepartmentId) {
      return {
        ok: false,
        error: `Check out of department "${state.currentDepartmentName || 'current'}" before leaving the division.`,
      };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Invalid event type' };
}

export async function validateDepartmentScan(pass, department, eventType) {
  const state = getPassSessionState(pass);

  if (!state.divisionInside) {
    return { ok: false, error: 'Division gate entry required before department check-in.' };
  }

  if (eventType === GATE_EVENT_TYPES.ENTRY) {
    if (state.currentDepartmentId) {
      if (state.currentDepartmentId === department._id.toString()) {
        return { ok: false, error: 'Already checked into this department. Check out first.' };
      }
      return {
        ok: false,
        error: `Still checked into "${state.currentDepartmentName}". Check out before entering another department.`,
      };
    }
    return { ok: true };
  }

  if (eventType === GATE_EVENT_TYPES.EXIT) {
    if (!state.currentDepartmentId) {
      return { ok: false, error: 'Not checked into any department.' };
    }
    if (state.currentDepartmentId !== department._id.toString()) {
      return {
        ok: false,
        error: `Currently checked into "${state.currentDepartmentName}", not this department.`,
      };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Invalid event type' };
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

  return formatPassResponse(pass, await buildQrDataUrl(qrPayload));
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

  return formatPassResponse(pass, await buildQrDataUrl(payload));
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

  return formatPassResponse(pass, await buildQrDataUrl(payload));
}

export async function loadDivisionAndDepartment(divisionId, departmentId) {
  const division = divisionId ? await Division.findById(divisionId) : null;
  const department = departmentId ? await Department.findById(departmentId) : null;
  return { division, department };
}

export { SCAN_TYPES };
