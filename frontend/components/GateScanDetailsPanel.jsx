'use client';

import { useState, useEffect } from 'react';
import PassCard from '@/components/PassCard';
import GateMatchedPerson from '@/components/GateMatchedPerson';
import GateSecurityReview from '@/components/GateSecurityReview';
import ActiveActivityAlert from '@/components/ActiveActivityAlert';
import CheckoutWaitingModal from '@/components/CheckoutWaitingModal';
import { RequiredStepsList } from '@/components/AccessRulesPanel';

function isJattuRegistration(registration) {
  const slug = String(registration?.roleId?.slug || '').toLowerCase();
  const name = String(registration?.roleId?.name || '').toLowerCase();
  return slug === 'jattu' || name === 'jattu' || name.includes('jattu');
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
  departmentName,
  divisionName,
  onDismissSecurityReview,
  showSuccess,
  showDenied,
  showSecurityReview,
  onForceCheckout,
  forceCheckoutLoading = false,
}) {
  const hasScanResult = showSuccess || showDenied || showSecurityReview;
  const activeSession = sessionState || result?.sessionState;
  const hideDepartmentActivity = isJattuRegistration(result?.registration);
  const activeDepartment =
    result?.activeDepartment ||
    (activeSession?.currentDepartmentId
      ? {
          departmentId: activeSession.currentDepartmentId,
          departmentName: activeSession.currentDepartmentName,
        }
      : null);

  const [showWaitModal, setShowWaitModal] = useState(false);

  useEffect(() => {
    const isTooSoon =
      result?.reason === 'too_soon_after_entry' ||
      (typeof result?.error === 'string' && result.error.toLowerCase().includes('wait at least'));
    if (showDenied && isTooSoon) {
      setShowWaitModal(true);
    } else {
      setShowWaitModal(false);
    }
  }, [result, showDenied]);

  const resolvedEventType = result?.resolvedEventType || effectiveEventType || 'entry';
  const isEntry = resolvedEventType === 'entry';
  const actionLabel =
    scanType === 'department'
      ? isEntry
        ? 'DEPT CHECK-IN'
        : 'DEPT CHECK-OUT'
      : isEntry
      ? 'GATE ENTRY'
      : 'GATE EXIT';

  return (
    <div className="gate-layout__details">
      <div className="gate-details-panel">
        <h3 className="gate-details-panel__title">
          <svg
            className="gate-details-panel__title-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          Access / Scan Details
        </h3>

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
            <div className="scan-event-header scan-event-header--success">
              <div className="scan-event-badge-group">
                <span className={`scan-action-tag ${isEntry ? 'action-tag--entry' : 'action-tag--exit'}`}>
                  {actionLabel}
                </span>
              </div>
              <span className="scan-event-status scan-event-status--granted">
                ACCESS GRANTED
              </span>
            </div>

            {result.autoResolved && (
              <p className="field-hint" style={{ marginTop: '4px', marginBottom: '8px' }}>
                {scanType === 'department'
                  ? 'Applied automatically from department status'
                  : 'Applied automatically from person status'}
              </p>
            )}

            {result.forcedDepartmentCheckout && !hideDepartmentActivity && (
              <p className="field-hint" style={{ marginTop: '4px', marginBottom: '8px' }}>
                Forced check-out of{' '}
                <strong>
                  {result.forcedDepartmentCheckout.departmentName || 'active department'}
                </strong>{' '}
                before gate exit
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
                hideDepartmentActivity={hideDepartmentActivity}
                result={result}
              />
            )}
          </div>
        )}

        {showDenied && (
          <div className="gate-result gate-result--denied">
            <div className="scan-event-header scan-event-header--denied">
              <div className="scan-event-badge-group">
                <span className="scan-action-tag action-tag--exit">
                  {actionLabel}
                </span>
              </div>
              <span className="scan-event-status scan-event-status--denied">
                ACCESS DENIED
              </span>
            </div>

            <ActiveActivityAlert
              reason={result?.reason}
              error={error || result?.error}
              activeDepartment={activeDepartment}
              activeDivision={result?.activeDivision}
              sessionState={activeSession}
              scanType={scanType}
              canForceCheckout={Boolean(result?.canForceCheckout) && !hideDepartmentActivity}
              onForceCheckout={onForceCheckout}
              forceCheckoutLoading={forceCheckoutLoading}
              hideDepartmentActivity={hideDepartmentActivity}
              onOpenWaitModal={() => setShowWaitModal(true)}
            />

            {result.registration && (
              <GateMatchedPerson
                registration={result.registration}
                matchScore={result.matchScore}
                sessionState={activeSession}
                activeDepartment={activeDepartment}
                activeDivision={result.activeDivision}
                hasGateEntry={result.hasGateEntry ?? activeSession?.divisionInside}
                hideDepartmentActivity={hideDepartmentActivity}
                result={result}
              />
            )}
            <RequiredStepsList steps={result.requiredSteps} />
          </div>
        )}

        {/* Daily pass section */}
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
            <div className="gate-day-pass-section__card" style={{ marginTop: '8px' }}>
              <p className="gate-pass-panel__desc no-print">
                Scan the QR to open pass details, today&apos;s active entries, and date-wise history.
              </p>
              <PassCard pass={dayPass} />
            </div>
          )}
        </div>
      </div>

      {/* Live Countdown Cooldown Waiting Popup */}
      <CheckoutWaitingModal
        isOpen={showWaitModal}
        onClose={() => setShowWaitModal(false)}
        result={result}
        sessionState={activeSession}
        registration={result?.registration}
        scanType={scanType}
        stationName={scanType === 'department' ? (departmentName || activeDepartment?.departmentName) : (gateName || divisionName)}
      />
    </div>
  );
}
