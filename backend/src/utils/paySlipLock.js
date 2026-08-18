/**
 * Pay-slip lock helpers. A locked slip covers every calendar day from
 * fromDate through toDate (inclusive, YYYY-MM-DD). Overlap is used instead
 * of exact period match so a locked week still protects those days inside
 * a later month generate.
 */

export function eachDateInRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
  const dates = [];
  const cur = new Date(`${dateFrom}T12:00:00.000Z`);
  const end = new Date(`${dateTo}T12:00:00.000Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return Boolean(aFrom && aTo && bFrom && bTo && aFrom <= bTo && aTo >= bFrom);
}

export function dateCoveredByRange(date, fromDate, toDate) {
  return Boolean(date && fromDate && toDate && date >= fromDate && date <= toDate);
}

export function overlappingLockedSlipFilter(registrationIds, fromDate, toDate) {
  const query = {
    status: 'Locked',
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
  };
  if (Array.isArray(registrationIds)) {
    query.registrationId = { $in: registrationIds };
  } else if (registrationIds) {
    query.registrationId = registrationIds;
  }
  return query;
}

export function buildLockedDateSet(slips, rangeFrom, rangeTo) {
  const set = new Set();
  for (const slip of slips || []) {
    if (!slip?.fromDate || !slip?.toDate) continue;
    const from = rangeFrom && slip.fromDate > rangeFrom ? slip.fromDate : (slip.fromDate || rangeFrom);
    const to = rangeTo && slip.toDate < rangeTo ? slip.toDate : (slip.toDate || rangeTo);
    for (const date of eachDateInRange(from, to)) set.add(date);
  }
  return set;
}

export function isRangeFullyLocked(lockedDates, rangeFrom, rangeTo) {
  const dates = eachDateInRange(rangeFrom, rangeTo);
  if (!dates.length || !lockedDates || lockedDates.size === 0) return false;
  return dates.every((date) => lockedDates.has(date));
}
