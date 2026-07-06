'use client';

import PassCard from '@/components/PassCard';
import GateMatchedPerson from '@/components/GateMatchedPerson';
import GateSecurityReview from '@/components/GateSecurityReview';
import { RequiredStepsList } from '@/components/AccessRulesPanel';

function SessionStatus({ sessionState }) {
  if (!sessionState) return null;
  return (
    <div className="gate-session-status">
      <p>
        Division:{' '}
        <strong>{sessionState.divisionInside ? 'Inside' : 'Outside'}</strong>
      </p>
      {sessionState.currentDepartmentName && (
        <p>
          Current department: <strong>{sessionState.currentDepartmentName}</strong>
        </p>
      )}
      {(sessionState.departmentVisits || []).length > 0 && (
        <div className="gate-visit-list">
          <p className="field-hint">Today&apos;s department visits</p>
          <ul>
            {sessionState.departmentVisits.map((visit, idx) => (
              <li key={`${visit.departmentId}-${idx}`}>
                {visit.departmentName} — in{' '}
                {visit.entryAt ? new Date(visit.entryAt).toLocaleTimeString() : '—'}
                {visit.exitAt
                  ? ` → out ${new Date(visit.exitAt).toLocaleTimeString()}`
                  : ' (active)'}
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
              {scanType === 'gate' ? 'Gate' : 'Department'}{' '}
              {(result.resolvedEventType || effectiveEventType) === 'entry' ? 'Entry' : 'Exit'} — Access
              Granted
            </p>
            {result.autoResolved && (
              <p className="field-hint">Applied automatically from person status</p>
            )}
            <p className="gate-details-panel__match-score">
              {result.qrScan
                ? 'QR Code Verified'
                : `Match score: ${(result.matchScore * 100).toFixed(1)}%`}
            </p>
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
              {scanType === 'gate' ? 'Gate' : 'Department'}{' '}
              {(result.resolvedEventType || effectiveEventType) === 'entry' ? 'Check-in' : 'Check-out'} —
              Access Denied
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
          className="btn-secondary gate-day-pass-section__toggle"
          onClick={onToggleDayPass}
          disabled={!dayPass}
        >
          {showDayPass ? 'Hide daily pass' : 'Show daily pass'}
        </button>
        {!dayPass && (
          <p className="field-hint gate-day-pass-section__hint">
            Daily pass appears after a successful division gate entry scan.
          </p>
        )}
        {showDayPass && dayPass && (
          <div className="gate-day-pass-section__card">
            <p className="gate-pass-panel__desc">
              Scan the QR to open pass details, today&apos;s active entries, and date-wise history.
            </p>
            <PassCard pass={dayPass} />
          </div>
        )}
      </div>
    </div>
  );
}
