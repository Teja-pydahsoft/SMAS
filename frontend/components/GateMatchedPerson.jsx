'use client';

import { resolvePhotoUrl } from '@/lib/photoUrl';

export function formatVisitTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function GateMatchedPerson({
  registration,
  matchScore,
  sessionState,
  activeDepartment,
  activeDivision,
  hasGateEntry,
}) {
  if (!registration) return null;

  const photoUrl = resolvePhotoUrl(registration.photoUrl || registration.photoPath);
  const departmentName =
    activeDepartment?.departmentName || sessionState?.currentDepartmentName || null;

  return (
    <div className="gate-matched-person">
      <div className="gate-matched-person__header">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="gate-matched-person__photo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.nextSibling) {
                e.currentTarget.nextSibling.style.display = 'flex';
              }
            }}
          />
        ) : null}
        <div
          className="gate-matched-person__photo gate-matched-person__photo--placeholder"
          style={{ display: photoUrl ? 'none' : 'flex' }}
        >
          No Photo
        </div>
        <div>
          <p className="gate-matched-person__name">{registration.displayName || 'Unnamed'}</p>
          <p className="gate-matched-person__role">{registration.roleId?.name || '—'}</p>
          {registration.registrationCode && (
            <p className="gate-matched-person__code">Code: {registration.registrationCode}</p>
          )}
          {typeof matchScore === 'number' && (
            <p className="gate-matched-person__score">Match: {(matchScore * 100).toFixed(1)}%</p>
          )}
        </div>
      </div>

      <div className="gate-matched-person__status">
        <p>
          Gate entry today:{' '}
          <strong className={hasGateEntry ? 'text-success' : 'text-danger'}>
            {hasGateEntry ? 'Yes' : 'No'}
          </strong>
        </p>
        {sessionState && (
          <p>
            Division status:{' '}
            <strong>{sessionState.divisionInside ? 'Inside' : 'Outside'}</strong>
          </p>
        )}
        {activeDivision?.divisionName && (
          <p className="gate-matched-person__active-dept">
            Active division: <strong>{activeDivision.divisionName}</strong>
          </p>
        )}
        {departmentName ? (
          <p className="gate-matched-person__active-dept">
            Department status: <strong>Checked in — {departmentName}</strong>
          </p>
        ) : (
          <p>
            Department status: <strong>Not checked in</strong>
          </p>
        )}
      </div>

      {(registration.formDetails || []).length > 0 && (
        <div className="gate-matched-person__details">
          {registration.formDetails.slice(0, 4).map((d) => (
            <div key={`${d.label}-${d.value}`} className="pass-meta-row">
              <span className="pass-meta-label">{d.label}</span>
              <span className="pass-meta-value">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
