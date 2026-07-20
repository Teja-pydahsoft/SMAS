'use client';

/**
 * Prominent active-activity callout for denied gate/department scans.
 * Makes "still checked into X" impossible to miss on the scan page.
 */
export default function ActiveActivityAlert({
  reason,
  error,
  activeDepartment,
  activeDivision,
  sessionState,
  scanType,
}) {
  const deptName =
    activeDepartment?.departmentName ||
    sessionState?.currentDepartmentName ||
    null;
  const divisionName =
    activeDivision?.divisionName ||
    null;
  const inside = Boolean(sessionState?.divisionInside);

  if (!reason && !error && !deptName && !divisionName) return null;

  let title = 'Access blocked by active activity';
  let detail = error || '';

  if (reason === 'active_in_other_department') {
    title = 'Active in another department';
    detail =
      error ||
      (deptName
        ? `Still checked into "${deptName}". Check out there before using this department.`
        : 'Still checked into another department. Check out there first.');
  } else if (reason === 'already_in_department') {
    title = 'Already checked into this department';
    detail = error || 'Check out first before another check-in.';
  } else if (reason === 'department_still_active') {
    title = 'Department still active';
    detail =
      error ||
      (deptName
        ? `Check out of "${deptName}" before leaving the division.`
        : 'Check out of the active department before gate exit.');
  } else if (reason === 'active_in_other_division') {
    title = 'Active in another division';
    detail = error || 'Finish the other division session before scanning here.';
  } else if (reason === 'no_gate_entry') {
    title = 'No gate entry today';
    detail = error || 'Complete division gate entry before department check-in or check-out.';
  } else if (reason === 'too_soon_after_entry') {
    title = 'Too soon to check out';
    detail = error || 'Wait a short time after check-in before checking out.';
  }

  return (
    <div className="active-activity-alert" role="status">
      <p className="active-activity-alert__title">{title}</p>
      {detail && <p className="active-activity-alert__detail">{detail}</p>}
      <ul className="active-activity-alert__status">
        <li>
          Division:{' '}
          <strong>{inside ? 'Inside' : 'Outside'}</strong>
          {divisionName ? ` (${divisionName})` : ''}
        </li>
        <li>
          Active department:{' '}
          <strong className={deptName ? 'text-danger' : undefined}>
            {deptName || 'None'}
          </strong>
        </li>
        {scanType === 'department' && deptName && reason === 'active_in_other_department' && (
          <li className="active-activity-alert__hint">
            Go to <strong>{deptName}</strong> and scan check-out, then return here.
          </li>
        )}
      </ul>
    </div>
  );
}
