export function buildEntryExitUrl({ scanType, divisionId, gateId, departmentId, eventType }) {
  const params = new URLSearchParams({
    scanType,
    divisionId: String(divisionId),
    eventType,
  });
  if (gateId) params.set('gateId', String(gateId));
  if (departmentId) params.set('departmentId', String(departmentId));
  return `/entry-exit?${params.toString()}`;
}

export function eventActionLabel(scanType, eventType) {
  if (eventType === 'auto') {
    return scanType === 'department' ? 'Auto check-in / check-out' : 'Auto entry / exit';
  }
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Check-in' : 'Check-out';
  }
  return eventType === 'entry' ? 'Entry' : 'Exit';
}

export function makeEntryButtonLabel(scanType, eventType) {
  if (eventType === 'auto') {
    return scanType === 'department' ? 'Open for check-in / check-out' : 'Open gate';
  }
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Make Check-in' : 'Make Check-out';
  }
  return eventType === 'entry' ? 'Make Entry' : 'Make Exit';
}

export function isAutoGateEvent(eventType) {
  return eventType === 'auto';
}
