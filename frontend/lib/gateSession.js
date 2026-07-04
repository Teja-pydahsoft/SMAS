import { buildEntryExitUrl } from '@/lib/entryExit';

const STORAGE_KEY = 'smas_gate_session';

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

export function normalizeGateSession(session) {
  if (!session) return null;
  const eventType =
    session.eventType === 'exit'
      ? 'exit'
      : session.eventType === 'auto'
        ? 'auto'
        : 'entry';
  return {
    scanType: session.scanType,
    divisionId: normalizeId(session.divisionId),
    gateId: normalizeId(session.gateId),
    departmentId: normalizeId(session.departmentId),
    eventType,
  };
}

export function gateSessionsEqual(a, b) {
  const left = normalizeGateSession(a);
  const right = normalizeGateSession(b);
  if (!left || !right) return false;
  if (left.scanType !== right.scanType) return false;
  if (left.divisionId !== right.divisionId) return false;
  if (left.scanType === 'gate') {
    if (left.gateId !== right.gateId) return false;
    if (left.eventType === 'auto' || right.eventType === 'auto') return true;
    return left.eventType === right.eventType;
  }
  return left.departmentId === right.departmentId && left.eventType === right.eventType;
}

function notifySessionChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('smas-gate-session'));
}

export function clearGateFlowState() {
  clearGateSession();
}

export function setGateSession(session) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeGateSession(session);
  if (!normalized) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  notifySessionChange();
}

export function getGateSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearGateSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
  notifySessionChange();
}

export function hasActiveGateSession() {
  return Boolean(getGateSession());
}

export function getEntryExitUrlFromSession() {
  const session = getGateSession();
  if (!session) return '/access-scope';
  return buildEntryExitUrl(session);
}

export function parseGateSessionFromSearchParams(searchParams) {
  const scanType = searchParams.get('scanType');
  const divisionId = searchParams.get('divisionId');
  const gateId = searchParams.get('gateId');
  const departmentId = searchParams.get('departmentId');
  const eventType = searchParams.get('eventType');

  if (
    !scanType ||
    !divisionId ||
    !eventType ||
    (scanType === 'gate' && !gateId) ||
    (scanType === 'department' && !departmentId)
  ) {
    return null;
  }

  return {
    scanType,
    divisionId,
    gateId: gateId || undefined,
    departmentId: departmentId || undefined,
    eventType,
  };
}
