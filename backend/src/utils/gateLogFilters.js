export function grantedGateLogFilter(extra = {}) {
  return {
    matched: true,
    ...extra,
    $or: [{ accessGranted: true }, { accessGranted: { $exists: false } }],
  };
}

export function filterGrantedLogs(dayLogs = []) {
  return dayLogs.filter((log) => log.accessGranted !== false);
}
