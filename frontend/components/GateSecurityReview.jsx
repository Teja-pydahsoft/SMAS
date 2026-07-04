'use client';

import GateMatchedPerson from '@/components/GateMatchedPerson';
import AccessRulesPanel, { RequiredStepsList } from '@/components/AccessRulesPanel';
import { eventActionLabel } from '@/lib/entryExit';

export default function GateSecurityReview({
  result,
  error,
  sessionState,
  gateName,
  onDismiss,
}) {
  if (!result?.securityReview) return null;

  const personInside = result.personInside;
  const suggested = result.suggestedEventType;
  const requested = result.requestedEventType;

  return (
    <div className="gate-security-review card">
      <div className="gate-security-review__banner">
        <span className="gate-security-review__icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div>
          <p className="gate-security-review__title">Security review — Entry &amp; Exit gate</p>
          <p className="gate-security-review__subtitle">
            {gateName ? `${gateName}: ` : ''}
            This person&apos;s current status does not match the scan direction for a combined entry &amp; exit gate.
          </p>
        </div>
      </div>

      <div className="gate-security-review__facts">
        <p>
          Person status:{' '}
          <strong>{personInside ? 'Inside division' : 'Outside division'}</strong>
        </p>
        {requested && (
          <p>
            Attempted action: <strong>{eventActionLabel('gate', requested)}</strong>
          </p>
        )}
        {suggested && (
          <p>
            Expected at this gate: <strong>{eventActionLabel('gate', suggested)}</strong>
          </p>
        )}
      </div>

      {error && <p className="gate-security-review__message">{error}</p>}

      <GateMatchedPerson
        registration={result.registration}
        matchScore={result.matchScore}
        sessionState={sessionState || result.sessionState}
        activeDepartment={result.activeDepartment}
        activeDivision={result.activeDivision}
        hasGateEntry={result.hasGateEntry ?? sessionState?.divisionInside}
      />

      <RequiredStepsList steps={result.requiredSteps} />

      <AccessRulesPanel compact />

      <button type="button" className="btn-secondary" onClick={onDismiss} style={{ marginTop: '1rem' }}>
        Dismiss and scan next person
      </button>
    </div>
  );
}
