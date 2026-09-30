'use client';

import { useState, useEffect } from 'react';
import PassCard from '@/components/PassCard';
import GateMatchedPerson, { formatVisitTime } from '@/components/GateMatchedPerson';
import GateSecurityReview from '@/components/GateSecurityReview';
import ActiveActivityAlert from '@/components/ActiveActivityAlert';
import CheckoutWaitingModal from '@/components/CheckoutWaitingModal';
import { RequiredStepsList } from '@/components/AccessRulesPanel';

function isJattuRegistration(registration) {
  const slug = String(registration?.roleId?.slug || '').toLowerCase();
  const name = String(registration?.roleId?.name || '').toLowerCase();
  return slug === 'jattu' || name === 'jattu' || name.includes('jattu');
}

function SessionStatus({ sessionState, hideDepartmentActivity = false }) {
  // Deprecated: Session status and department activity are now fully rendered inside GateMatchedPerson
  return null;
}

function getScanHighlightInfo(scanType, eventType, divisionName, departmentName, gateName) {
  const isEntry = eventType === 'entry';
  if (scanType === 'department') {
    const targetName = departmentName || 'Department';
    return {
      name: targetName,
      action: isEntry ? 'Dept Check-in' : 'Dept Check-out',
      icon: '🏬',
      colorClass: isEntry ? 'event-highlight--dept-in' : 'event-highlight--dept-out',
    };
  }
  const targetName = divisionName || gateName || 'Division Gate';
  return {
    name: targetName,
    action: isEntry ? 'Gate Entry' : 'Gate Exit',
    icon: '🏢',
    colorClass: isEntry ? 'event-highlight--div-in' : 'event-highlight--div-out',
  };
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
  const stationLabel =
    scanType === 'department'
      ? departmentName || 'Department'
      : gateName || 'Gate';
  const stationKind = scanType === 'department' ? 'Department' : 'Division gate';

  const [showWaitModal, setShowWaitModal] = useState(false);

  useEffect(() => {
    const isTooSoon = result?.reason === 'too_soon_after_entry' ||
      (typeof result?.error === 'string' && result.error.toLowerCase().includes('wait at least'));
    if (showDenied && isTooSoon) {
      setShowWaitModal(true);
    } else {
      setShowWaitModal(false);
    }
  }, [result, showDenied]);

  const eventInfo = getScanHighlightInfo(
    scanType,
    result?.resolvedEventType || effectiveEventType,
    divisionName,
    departmentName,
    gateName
  );

  return (
    <div className="gate-layout__details">
      <div className="gate-details-panel">
        <h3 className="gate-details-panel__title">Scan details</h3>

        {(divisionName || stationLabel) && (
          <div className="gate-details-panel__station">
            <span className="gate-details-panel__station-kind">{stationKind}</span>
            <strong>
              {divisionName ? `${divisionName} · ${stationLabel}` : stationLabel}
            </strong>
          </div>
        )}

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
                <span className={`scan-name-highlight ${eventInfo.colorClass}`}>
                  <span className="scan-name-icon">{eventInfo.icon}</span>
                  <strong>{eventInfo.name}</strong>
                </span>
                <span className={`scan-action-tag ${eventInfo.colorClass}`}>
                  {eventInfo.action}
                </span>
              </div>
              <span className="scan-event-status scan-event-status--granted">
                ACCESS GRANTED
              </span>
            </div>
            {result.autoResolved && (
              <p className="field-hint">
                {scanType === 'department'
                  ? 'Applied automatically from department status'
                  : 'Applied automatically from person status'}
              </p>
            )}
            {result.forcedDepartmentCheckout && !hideDepartmentActivity && (
              <p className="field-hint">
                Forced check-out of{' '}
                <strong>
                  {result.forcedDepartmentCheckout.departmentName || 'active department'}
                </strong>{' '}
                before gate exit
              </p>
            )}
            <p className="gate-details-panel__match-score">
              {result.qrScan
                ? 'QR Code Verified'
                : `Match score: ${(result.matchScore * 100).toFixed(1)}%`}
            </p>
            {(result.shiftName || dayPass?.qrPayload?.shiftName) && (
              <p className="gate-details-panel__shift">
                Shift:{' '}
                <strong>
                  {result.shiftName || dayPass.qrPayload.shiftName}
                  {(result.totalHours ?? dayPass?.qrPayload?.totalHours) != null
                    ? ` · ${result.totalHours ?? dayPass.qrPayload.totalHours}h`
                    : ''}
                </strong>
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
            <SessionStatus sessionState={activeSession} hideDepartmentActivity={hideDepartmentActivity} />
          </div>
        )}

        {showDenied && (
          <div className="gate-result gate-result--denied">
            <div className="scan-event-header scan-event-header--denied">
              <div className="scan-event-badge-group">
                <span className={`scan-name-highlight ${eventInfo.colorClass}`}>
                  <span className="scan-name-icon">{eventInfo.icon}</span>
                  <strong>{eventInfo.name}</strong>
                </span>
                <span className={`scan-action-tag ${eventInfo.colorClass}`}>
                  {eventInfo.action}
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
            <SessionStatus sessionState={activeSession} hideDepartmentActivity={hideDepartmentActivity} />
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
