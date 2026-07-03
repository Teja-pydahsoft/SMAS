export function buildEntryExitUrl({ scanType, divisionId, gateId, departmentId, eventType }) {
  const params = new URLSearchParams({
    scanType,
    divisionId,
    eventType,
  });
  if (gateId) params.set('gateId', gateId);
  if (departmentId) params.set('departmentId', departmentId);
  return `/entry-exit?${params.toString()}`;
}

export function eventActionLabel(scanType, eventType) {
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Check-in' : 'Check-out';
  }
  return eventType === 'entry' ? 'Entry' : 'Exit';
}

export function makeEntryButtonLabel(scanType, eventType) {
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Make Check-in' : 'Make Check-out';
  }
  return eventType === 'entry' ? 'Make Entry' : 'Make Exit';
}
