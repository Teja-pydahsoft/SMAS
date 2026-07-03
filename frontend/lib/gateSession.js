import { buildEntryExitUrl } from '@/lib/entryExit';

const STORAGE_KEY = 'smas_gate_session';

function notifySessionChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('smas-gate-session'));
}

export function clearGateFlowState() {
  clearGateSession();
}

export function setGateSession(session) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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
