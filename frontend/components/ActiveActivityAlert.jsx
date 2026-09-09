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
  canForceCheckout = false,
  onForceCheckout,
  forceCheckoutLoading = false,
  hideDepartmentActivity = false,
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

  const showForce =
    canForceCheckout &&
    !hideDepartmentActivity &&
    reason === 'department_still_active' &&
    typeof onForceCheckout === 'function';

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
        {!hideDepartmentActivity && (
          <li>
            Active department:{' '}
            <strong className={deptName ? 'text-danger' : undefined}>
              {deptName || 'None'}
            </strong>
          </li>
        )}
        {!hideDepartmentActivity &&
          scanType === 'department' &&
          deptName &&
          reason === 'active_in_other_department' && (
          <li className="active-activity-alert__hint">
            Go to <strong>{deptName}</strong> and scan check-out, then return here.
          </li>
        )}
      </ul>
      {showForce && (
        <div className="active-activity-alert__force">
          <p className="active-activity-alert__hint">
            Or force check-out of{deptName ? ` "${deptName}"` : ' the department'} and complete gate exit now.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={forceCheckoutLoading}
            onClick={onForceCheckout}
          >
            {forceCheckoutLoading
              ? 'Force checking out...'
              : 'Force department out & gate exit'}
          </button>
        </div>
      )}
    </div>
  );
}
