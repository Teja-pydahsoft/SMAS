'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { saveGatePhotoForRegistration } from '@/lib/gateRegistration';
import GateCameraScanner from '@/components/GateCameraScanner';
import GateScanDetailsPanel from '@/components/GateScanDetailsPanel';
import RemarkEntryModal from '@/components/RemarkEntryModal';
import EntryExitSelector from '@/components/EntryExitSelector';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';
import { buildEntryExitUrl, isAutoGateEvent, eventActionLabel } from '@/lib/entryExit';
import {
  parseGateSessionFromSearchParams,
  setGateSession,
  getGateSession,
  clearGateSession,
} from '@/lib/gateSession';

// ── helpers ───────────────────────────────────────────────────────────────────

function notFoundMessage(result) {
  if (result?.reason === 'ambiguous') {
    return 'We could not identify this person uniquely. They may need to register or scan again.';
  }
  if (result?.reason === 'face_mismatch') {
    return 'This face does not match the selected registration.';
  }
  return 'This person is not registered in the system yet.';
}

function captureLabel(eventType, scanType) {
  if (isAutoGateEvent(eventType)) {
    return 'Capture Face';
  }
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Capture for Check-in' : 'Capture for Check-out';
  }
  return eventType === 'entry' ? 'Capture for Entry' : 'Capture for Exit';
}

function applyResult(res, setResult, setSessionState, setDayPass, setError) {
  setResult(res);
  if (res.sessionState) setSessionState(res.sessionState);
  if (res.dayPass) setDayPass(res.dayPass);
  if (res.denied) setError(res.error || 'Access denied');
  else if (res.error) setError(res.error);
}

function applyErrorData(e, setResult, setSessionState, setDayPass, setError) {
  const data = e.data || {};
  if (data.matched || data.registration || data.denied) {
    setResult({
      ...data,
      matched: data.matched ?? Boolean(data.registration),
      denied: data.denied ?? Boolean(data.error),
      securityReview: data.securityReview ?? false,
    });
  }
  if (data.sessionState) setSessionState(data.sessionState);
  if (data.dayPass) setDayPass(data.dayPass);
  setError(data.error || e.message);
}

// ── main content ──────────────────────────────────────────────────────────────

function EntryExitContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, can } = useAuth();
  const canWrite = can('gate', 'write');

  const urlScanType = searchParams.get('scanType');
  const urlDivisionId = searchParams.get('divisionId');
  const urlGateId = searchParams.get('gateId');
  const urlDepartmentId = searchParams.get('departmentId');
  const urlEventType = searchParams.get('eventType');

  // scanType = gate | department (the access-point type, not face/qr)
  const scanType = urlScanType === 'department' ? 'department' : 'gate';

  const lockedMode = Boolean(
    urlScanType &&
      urlDivisionId &&
      urlEventType &&
      ((urlScanType === 'gate' && urlGateId) || (urlScanType === 'department' && urlDepartmentId))
  );

  const [accessScope, setAccessScope] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [result, setResult] = useState(null);
  const [dayPass, setDayPass] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showDayPass, setShowDayPass] = useState(false);
  const [cameraKey] = useState(0);
  const [setupLoading, setSetupLoading] = useState(true);
  // Remark picker — shown after a successful department check-in
  const [remarkPicker, setRemarkPicker] = useState(null); // { logId, personName, departmentName } | null

  const divisions = useMemo(() => accessScope?.divisions || [], [accessScope]);

  const currentDivision = useMemo(
    () => divisions.find((d) => String(d._id) === String(urlDivisionId)) || null,
    [divisions, urlDivisionId]
  );

  const gates = useMemo(() => currentDivision?.gates || [], [currentDivision]);
  const departments = useMemo(() => currentDivision?.departments || [], [currentDivision]);

  const selectedGate = useMemo(
    () => gates.find((g) => String(g._id) === String(urlGateId)) || null,
    [gates, urlGateId]
  );

  const selectedDepartment = useMemo(
    () => departments.find((d) => String(d._id) === String(urlDepartmentId)) || null,
    [departments, urlDepartmentId]
  );

  const eventType = useMemo(() => {
    if (scanType === 'department') {
      // departments support auto just like "both" gates
      if (urlEventType === 'auto') return 'auto';
      return urlEventType === 'exit' ? 'exit' : 'entry';
    }

    // gate scan
    // IMPORTANT: do NOT force "auto" just because the gate is combined (gateType === "both").
    // The user’s Gate Access mode (entry-only / exit-only / both) is carried via urlEventType.
    if (urlEventType === 'auto') return 'auto';
    if (urlEventType === 'exit') return 'exit';
    if (urlEventType === 'entry') return 'entry';

    // Fallback (should be rare): pick from allowedEvents if urlEventType is missing/invalid.
    const allowed = selectedGate?.allowedEvents || [];
    if (allowed.includes('auto')) return 'auto';
    if (allowed.includes('exit')) return 'exit';
    return 'entry';
  }, [scanType, urlEventType, selectedGate]);

  const accessPointValid =
    scanType === 'gate' ? Boolean(selectedGate) : Boolean(selectedDepartment);

  const canScan = canWrite && lockedMode && accessPointValid;
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const currentSession = useMemo(() => {
    if (!lockedMode) return null;
    return {
      scanType,
      divisionId: urlDivisionId,
      gateId: urlGateId || undefined,
      departmentId: urlDepartmentId || undefined,
      eventType,
    };
  }, [lockedMode, scanType, urlDivisionId, urlGateId, urlDepartmentId, eventType]);

  useEffect(() => {
    api.auth
      .accessScope()
      .then((scope) => setAccessScope(scope))
      .catch((e) => setError(e.message))
      .finally(() => setSetupLoading(false));
  }, []);

  const resetScanState = useCallback(() => {
    setResult(null);
    setDayPass(null);
    setSessionState(null);
    setPhotoBlob(null);
    setError('');
    setShowDayPass(false);
    setRemarkPicker(null);
  }, []);

  // After a successful department CHECK-IN, prompt for an optional remark
  const maybePromptRemark = useCallback((res) => {
    const isDeptCheckIn =
      res.scanType === 'department' &&
      !res.denied &&
      res.matched &&
      (res.resolvedEventType === 'entry' || (!res.resolvedEventType && res.log?.eventType === 'entry'));
    if (isDeptCheckIn && res.log?._id) {
      setRemarkPicker({
        logId: res.log._id,
        personName: res.registration?.displayName || res.registration?.holderName || '',
        departmentName: res.log?.departmentName || selectedDepartment?.name || '',
      });
    }
  }, [selectedDepartment?.name]);

  const applySelection = useCallback(
    (session) => {
      const sameAsCurrent =
        currentSession &&
        currentSession.scanType === session.scanType &&
        currentSession.divisionId === session.divisionId &&
        currentSession.eventType === session.eventType &&
        (session.scanType === 'gate'
          ? currentSession.gateId === session.gateId
          : currentSession.departmentId === session.departmentId);

      if (currentSession && !sameAsCurrent) resetScanState();
      setGateSession(session);
      router.replace(buildEntryExitUrl(session));
    },
    [currentSession, resetScanState, router]
  );

  const clearSelection = useCallback(() => {
    clearGateSession();
    resetScanState();
    router.replace('/entry-exit');
  }, [resetScanState, router]);

  useEffect(() => {
    if (!lockedMode) {
      if (isSuperAdmin) return;
      const storedSession = getGateSession();
      if (storedSession) {
        router.replace(buildEntryExitUrl(storedSession));
      } else {
        router.replace('/access-scope');
      }
      return;
    }
    const session = parseGateSessionFromSearchParams(searchParams);
    if (!session) return;

    // Reconcile stored eventType (gate session) with the user's allowed events.
    // For combined gates (gateType === "both") we only allow:
    // - 'auto' when the user has full access (entry & exit)
    // - otherwise 'entry' or 'exit' depending on user mode.
    if (session.scanType === 'gate' && session.gateId && selectedGate) {
      const allowed = selectedGate.allowedEvents || [];
      const isAllowed = allowed.includes(session.eventType);

      if (!isAllowed) {
        const nextEventType = allowed.includes('auto')
          ? 'auto'
          : allowed.includes('exit')
            ? 'exit'
            : allowed.includes('entry')
              ? 'entry'
              : 'entry';

        const adjustedSession = { ...session, eventType: nextEventType };
        setGateSession(adjustedSession);
        router.replace(buildEntryExitUrl(adjustedSession));
        return;
      }
    }

    // Force auto event type for department scans (always auto by default)
    if (
      session.scanType === 'department' &&
      session.departmentId &&
      session.eventType !== 'auto' &&
      session.eventType !== 'entry' &&
      session.eventType !== 'exit'
    ) {
      const autoSession = { ...session, eventType: 'auto' };
      setGateSession(autoSession);
      router.replace(buildEntryExitUrl(autoSession));
      return;
    }

    setGateSession(session);
  }, [isSuperAdmin, lockedMode, router, searchParams, selectedGate?._id, (selectedGate?.allowedEvents || []).join(',')]);

  // ── face scan ─────────────────────────────────────────────────────────────

  const handleFaceCapture = useCallback(
    async (blob) => {
      if (!blob) { resetScanState(); return; }
      if (loading) return; // already processing — blocks double Capture races
      if (!canScan) {
        setError('This access point is not available. Return to Gate Access and select one.');
        return;
      }

      setLoading(true);
      resetScanState();
      setPhotoBlob(blob);

      try {
        const options =
          scanType === 'gate'
            ? { gateId: urlGateId, scanType: 'gate' }
            : { divisionId: urlDivisionId, departmentId: urlDepartmentId, scanType: 'department' };

        const res = await api.gate.scan(blob, eventType, options);
        applyResult(res, setResult, setSessionState, setDayPass, setError);
        maybePromptRemark(res);
      } catch (e) {
        applyErrorData(e, setResult, setSessionState, setDayPass, setError);
      } finally {
        setLoading(false);
      }
    },
    [loading, canScan, scanType, urlGateId, urlDivisionId, urlDepartmentId, eventType, resetScanState, maybePromptRemark]
  );

  // ── QR scan ───────────────────────────────────────────────────────────────

  const handleQrDetect = useCallback(
    async (passCode) => {
      if (loading) return; // already processing
      if (!canScan) {
        setError('This access point is not available. Return to Gate Access and select one.');
        return;
      }

      setLoading(true);
      resetScanState();

      try {
        const options =
          scanType === 'gate'
            ? { gateId: urlGateId }
            : { divisionId: urlDivisionId, departmentId: urlDepartmentId };

        const res = await api.gate.qrScan(passCode, eventType, options);
        applyResult(res, setResult, setSessionState, setDayPass, setError);
        maybePromptRemark(res);
      } catch (e) {
        applyErrorData(e, setResult, setSessionState, setDayPass, setError);
      } finally {
        setLoading(false);
      }
    },
    [loading, canScan, scanType, urlGateId, urlDivisionId, urlDepartmentId, eventType, resetScanState, maybePromptRemark]
  );

  // ── registration redirect ─────────────────────────────────────────────────

  async function handleRegisterPerson() {
    setRegistering(true);
    setError('');
    try {
      if (photoBlob) await saveGatePhotoForRegistration(photoBlob);
      router.push('/registrations/register?from=gate');
    } catch (e) {
      setError(e.message || 'Could not start registration');
      setRegistering(false);
    }
  }

  // ── derived state ─────────────────────────────────────────────────────────

  const showNotFound = result && !result.matched;
  const showSecurityReview = result?.matched && result?.securityReview;
  const showDenied = result?.matched && (result.denied || error) && !showSecurityReview;
  const showSuccess = result?.matched && !showDenied && !showSecurityReview;
  const effectiveEventType = result?.resolvedEventType || (eventType === 'auto' ? 'entry' : eventType);

  const accessPointTitle =
    scanType === 'department'
      ? selectedDepartment?.name || 'Department'
      : selectedGate?.name || 'Gate';
  const accessPointKind = scanType === 'department' ? 'Department' : 'Division gate';
  const accessPointAction = eventActionLabel(scanType, eventType);
  const operatorLabel = user?.displayName || user?.username || 'Operator';
  const operatorUsername = user?.username ? `@${user.username}` : '';

  // ── unlocked states ───────────────────────────────────────────────────────

  if (!lockedMode && !isSuperAdmin) {
    return (
      <PageShell title="Entry & Exit" description="Redirecting to Gate Access...">
        <p style={{ color: 'var(--text-muted)' }}>Select a gate or department to continue.</p>
      </PageShell>
    );
  }

  if (!lockedMode && isSuperAdmin) {
    return (
      <PageShell
        title="Entry & Exit"
        description="Select a gate or department, then scan registered people"
      >
        {!canWrite && <p className="read-only-banner">View only — scanning requires write access.</p>}
        {setupLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading divisions and gates...</p>
        ) : (
          <>
            <EntryExitSelector divisions={divisions} value={null} onApply={applySelection} disabled={!canWrite} />
            {error && <p className="error-msg">{error}</p>}
            {divisions.length === 0 && !error && (
              <div className="card gate-landing__empty" style={{ marginTop: '1rem' }}>
                <p className="section-title">No gates or departments configured</p>
                <p className="section-desc">Create divisions with gates or departments in System settings first.</p>
              </div>
            )}
          </>
        )}
      </PageShell>
    );
  }

  // ── active gate view ──────────────────────────────────────────────────────

  return (
    <PageShell
      title="Entry & Exit"
      description="Show a Registration Pass QR code, or press Capture for face recognition"
    >
      <div className="entry-exit-toolbar">
        {isSuperAdmin ? (
          <button type="button" className="btn-secondary" onClick={clearSelection}>
            Change access point
          </button>
        ) : (
          <Link href="/access-scope">
            <button type="button" className="btn-secondary">← Gate Access</button>
          </Link>
        )}
      </div>

      {accessPointValid && (
        <div className="entry-exit-context" aria-live="polite">
          <div className="entry-exit-context__item">
            <div className="entry-exit-context__label">Logged in as</div>
            <div className="entry-exit-context__title">{operatorLabel}</div>
            {operatorUsername && (
              <div className="entry-exit-context__meta">{operatorUsername}</div>
            )}
          </div>
          <div className="entry-exit-context__item">
            <div className="entry-exit-context__label">Division</div>
            <div className="entry-exit-context__title">
              {currentDivision?.name || '—'}
            </div>
          </div>
          <div className="entry-exit-context__item">
            <div className="entry-exit-context__label">Access point</div>
            <div className="entry-exit-context__title">{accessPointTitle}</div>
            <span
              className={`entry-exit-context__badge entry-exit-context__badge--${
                scanType === 'department' ? 'department' : 'gate'
              }`}
            >
              {accessPointKind}
            </span>
          </div>
          <div className="entry-exit-context__item">
            <div className="entry-exit-context__label">Mode</div>
            <div className="entry-exit-context__title">{accessPointAction}</div>
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <EntryExitSelector
          divisions={divisions}
          value={currentSession}
          onApply={applySelection}
          disabled={!canWrite || setupLoading}
        />
      )}

      {setupLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading access point...</p>
      ) : !accessPointValid ? (
        <div className="card gate-result gate-result--not-found">
          <p className="gate-not-found__title">Access point not available</p>
          <p className="gate-not-found__text">
            {isSuperAdmin
              ? 'This gate or department could not be found. It may be inactive or deleted.'
              : 'You do not have access to this gate or department. Choose one from Gate Access.'}
          </p>
          {isSuperAdmin ? (
            <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={clearSelection}>
              Choose another access point
            </button>
          ) : (
            <Link href="/access-scope">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>Back to Gate Access</button>
            </Link>
          )}
        </div>
      ) : (
        <div className="gate-layout">
          <div className="card gate-layout__camera">
            {!canWrite && <p className="read-only-banner">View only — scanning requires write access.</p>}

            {/* Single unified scanner — auto-detects QR, button for face */}
            <GateCameraScanner
              key={`${scanType}-${urlDivisionId}-${urlGateId}-${urlDepartmentId}-${eventType}-${cameraKey}`}
              autoStart={canScan}
              onFaceCapture={handleFaceCapture}
              onQrDetect={handleQrDetect}
              captureLabel={captureLabel(eventType, scanType)}
              processing={loading}
            />

            {canWrite && !canScan && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                This access point is not available. Return to Gate Access and choose another.
              </p>
            )}

            {error && !showDenied && !showSecurityReview && <p className="error-msg">{error}</p>}

            {showDenied && (
              <div className="gate-result gate-result--denied" style={{ marginTop: '0.75rem' }}>
                <p className="gate-not-found__title">Person Identified — Access Denied</p>
                <p className="gate-not-found__text">
                  {error ||
                    'Face matched, but this scan was blocked by active activity rules. See Scan details.'}
                </p>
              </div>
            )}

            {/* Not-found result */}
            {showNotFound && !showDenied && (
              <div className="gate-result gate-result--not-found">
                {result.qrScan ? (
                  <>
                    <p className="gate-not-found__title">Pass Not Found</p>
                    <p className="gate-not-found__text">
                      {result.message || 'This QR code does not match a valid active pass.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="gate-not-found__title">Person Not Found</p>
                    <p className="gate-not-found__text">{result.message || notFoundMessage(result)}</p>
                    <WriteAccess module="registrations">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleRegisterPerson}
                        disabled={registering}
                        style={{ marginTop: '0.75rem' }}
                      >
                        {registering ? 'Opening registration...' : 'Register this person'}
                      </button>
                    </WriteAccess>
                  </>
                )}
              </div>
            )}
          </div>

          <GateScanDetailsPanel
            scanType={scanType}
            effectiveEventType={effectiveEventType}
            result={result}
            sessionState={sessionState}
            error={error}
            dayPass={dayPass}
            showDayPass={showDayPass}
            onToggleDayPass={() => setShowDayPass((open) => !open)}
            gateName={selectedGate?.name}
            departmentName={selectedDepartment?.name}
            divisionName={currentDivision?.name}
            onDismissSecurityReview={resetScanState}
            showSuccess={showSuccess}
            showDenied={showDenied}
            showSecurityReview={showSecurityReview}
          />
        </div>
      )}

      {/* Remark modal — shown after department check-in */}
      {remarkPicker && (
        <RemarkEntryModal
          logId={remarkPicker.logId}
          personName={remarkPicker.personName}
          departmentName={remarkPicker.departmentName}
          onConfirm={(remark) => {
            setRemarkPicker(null);
            setResult((prev) => (prev ? { ...prev, remark } : prev));
          }}
          onSkip={() => setRemarkPicker(null)}
        />
      )}
    </PageShell>
  );
}

export default function EntryExitPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading entry & exit...</p>}>
      <EntryExitContent />
    </Suspense>
  );
}
