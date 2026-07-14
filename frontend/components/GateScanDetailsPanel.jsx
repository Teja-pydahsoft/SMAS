'use client';

import PassCard from '@/components/PassCard';
import GateMatchedPerson, { formatVisitTime } from '@/components/GateMatchedPerson';
import GateSecurityReview from '@/components/GateSecurityReview';
import { RequiredStepsList } from '@/components/AccessRulesPanel';

function SessionStatus({ sessionState }) {
  if (!sessionState) return null;

  const visits = [...(sessionState.departmentVisits || [])].sort((a, b) => {
    const aTime = new Date(a.exitAt || a.entryAt || 0).getTime();
    const bTime = new Date(b.exitAt || b.entryAt || 0).getTime();
    return bTime - aTime;
  });

  return (
    <div className="gate-session-status">
      {(sessionState.currentDepartmentName || visits.length > 0) && (
        <p>
          Current department:{' '}
          <strong>{sessionState.currentDepartmentName || 'None'}</strong>
        </p>
      )}
      {visits.length > 0 && (
        <div className="gate-visit-list">
          <p className="field-hint">Today&apos;s department visits</p>
          <ul>
            {visits.map((visit, idx) => (
              <li key={`${visit.departmentId}-${visit.entryAt || visit.exitAt}-${idx}`}>
                {visit.departmentName} — in {formatVisitTime(visit.entryAt)}
                {visit.exitAt
                  ? ` → out ${formatVisitTime(visit.exitAt)}`
                  : ' (active)'}
                {visit.remark ? ` · ${visit.remark}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function GateScanDetailsPanel({
  scanType,
  effectiveEventType,
  result,
  sessionState,
  error,
  dayPass,
  showDayPass,
  onToggleDayPass,
  gateName,
  onDismissSecurityReview,
  showSuccess,
  showDenied,
  showSecurityReview,
}) {
  const hasScanResult = showSuccess || showDenied || showSecurityReview;
  const activeSession = sessionState || result?.sessionState;

  return (
    <div className="gate-layout__details">
      <div className="gate-details-panel">
        <h3 className="gate-details-panel__title">Scan details</h3>

        {!hasScanResult && (
          <div className="gate-details-panel__empty">
            <p>Scan a registered person to view match details and access status here.</p>
          </div>
        )}

        {showSecurityReview && (
          <GateSecurityReview
            result={result}
            error={error}
            sessionState={activeSession}
            gateName={gateName}
            onDismiss={onDismissSecurityReview}
          />
        )}

        {showSuccess && (
          <div className="gate-result gate-result--success">
            <p className="gate-details-panel__status-title gate-details-panel__status-title--success">
              {scanType === 'department'
                ? (result.resolvedEventType || effectiveEventType) === 'entry'
                  ? 'Department Check-in — Access Granted'
                  : 'Department Check-out — Access Granted'
                : (result.resolvedEventType || effectiveEventType) === 'entry'
                  ? 'Gate Entry — Access Granted'
                  : 'Gate Exit — Access Granted'}
            </p>
            {result.autoResolved && (
              <p className="field-hint">
                {scanType === 'department'
                  ? 'Applied automatically from department status'
                  : 'Applied automatically from person status'}
              </p>
            )}
            <p className="gate-details-panel__match-score">
              {result.qrScan
                ? 'QR Code Verified'
                : `Match score: ${(result.matchScore * 100).toFixed(1)}%`}
            </p>
            {result.shiftName && (
              <p className="gate-details-panel__shift">
                Shift: <strong>{result.shiftName}</strong>
              </p>
            )}
            {result.registration && (
              <GateMatchedPerson
                registration={result.registration}
                matchScore={result.matchScore}
                sessionState={activeSession}
                activeDepartment={result.activeDepartment}
                activeDivision={result.activeDivision}
                hasGateEntry={result.hasGateEntry ?? activeSession?.divisionInside}
              />
            )}
            <SessionStatus sessionState={activeSession} />
          </div>
        )}

        {showDenied && (
          <div className="gate-result gate-result--denied">
            <p className="gate-details-panel__status-title gate-details-panel__status-title--denied">
              {scanType === 'department'
                ? (result.resolvedEventType || effectiveEventType) === 'entry'
                  ? 'Department Check-in — Access Denied'
                  : 'Department Check-out — Access Denied'
                : (result.resolvedEventType || effectiveEventType) === 'entry'
                  ? 'Gate Entry — Access Denied'
                  : 'Gate Exit — Access Denied'}
            </p>
            {error && <p className="gate-details-panel__error">{error}</p>}
            <GateMatchedPerson
              registration={result.registration}
              matchScore={result.matchScore}
              sessionState={activeSession}
              activeDepartment={
                result.activeDepartment ||
                (activeSession?.currentDepartmentId
                  ? {
                      departmentId: activeSession.currentDepartmentId,
                      departmentName: activeSession.currentDepartmentName,
                    }
                  : null)
              }
              activeDivision={result.activeDivision}
              hasGateEntry={result.hasGateEntry ?? activeSession?.divisionInside}
            />
            <SessionStatus sessionState={activeSession} />
            <RequiredStepsList steps={result.requiredSteps} />
          </div>
        )}
      </div>

      <div className="gate-day-pass-section">
        <button
          type="button"
          className="btn-secondary gate-day-pass-section__toggle no-print"
          onClick={onToggleDayPass}
          disabled={!dayPass}
        >
          {showDayPass ? 'Hide daily pass' : 'Show daily pass'}
        </button>
        {!dayPass && (
          <p className="field-hint gate-day-pass-section__hint no-print">
            Daily pass appears after a successful division gate entry scan.
          </p>
        )}
        {showDayPass && dayPass && (
          <div className="gate-day-pass-section__card">
            <p className="gate-pass-panel__desc no-print">
              Scan the QR to open pass details, today&apos;s active entries, and date-wise history.
            </p>
            <PassCard pass={dayPass} />
          </div>
        )}
      </div>
    </div>
  );
}
