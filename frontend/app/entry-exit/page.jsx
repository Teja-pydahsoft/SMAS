'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { saveGatePhotoForRegistration } from '@/lib/gateRegistration';
import CameraCapture from '@/components/CameraCapture';
import GateScanDetailsPanel from '@/components/GateScanDetailsPanel';
import EntryExitSelector from '@/components/EntryExitSelector';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';
import { buildEntryExitUrl, isAutoGateEvent } from '@/lib/entryExit';
import { parseGateSessionFromSearchParams, setGateSession, getGateSession, clearGateSession } from '@/lib/gateSession';

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
  if (isAutoGateEvent(eventType) && scanType === 'gate') {
    return 'Capture photo — entry or exit is determined from person status';
  }
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Capture for department check-in' : 'Capture for department check-out';
  }
  return eventType === 'entry' ? 'Capture for gate entry' : 'Capture for gate exit';
}

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

  const isBothGate = scanType === 'gate' && selectedGate?.gateType === 'both';

  const eventType = useMemo(() => {
    if (scanType === 'department') {
      return urlEventType === 'exit' ? 'exit' : 'entry';
    }
    if (isBothGate || urlEventType === 'auto') {
      return 'auto';
    }
    return urlEventType === 'exit' ? 'exit' : 'entry';
  }, [scanType, urlEventType, isBothGate]);

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
  }, []);

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

    if (
      session.scanType === 'gate' &&
      session.gateId &&
      selectedGate?.gateType === 'both' &&
      session.eventType !== 'auto'
    ) {
      const autoSession = { ...session, eventType: 'auto' };
      setGateSession(autoSession);
      router.replace(buildEntryExitUrl(autoSession));
      return;
    }

    setGateSession(session);
  }, [isSuperAdmin, lockedMode, router, searchParams, selectedGate?.gateType]);

  const processScan = useCallback(
    async (blob, type, nextScanType) => {
      if (!blob) return;
      setLoading(true);
      resetScanState();
      setPhotoBlob(blob);

      try {
        const options =
          nextScanType === 'gate'
            ? { gateId: urlGateId, scanType: 'gate' }
            : {
                divisionId: urlDivisionId,
                departmentId: urlDepartmentId,
                scanType: 'department',
              };

        const res = await api.gate.scan(blob, type, options);
        setResult(res);
        if (res.sessionState) setSessionState(res.sessionState);
        if (res.dayPass) setDayPass(res.dayPass);
        if (res.error) setError(res.error);
        if (res.denied) setError(res.error || 'Access denied');
      } catch (e) {
        const data = e.data || {};
        if (data.matched || data.registration) {
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
      } finally {
        setLoading(false);
      }
    },
    [urlGateId, urlDivisionId, urlDepartmentId, resetScanState]
  );

  async function handleCapture(blob) {
    if (!blob) {
      resetScanState();
      return;
    }
    if (!canScan) {
      setError('This access point is not available. Return to Gate Access and select one.');
      return;
    }
    await processScan(blob, eventType, scanType);
  }

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

  const showNotFound = result && !result.matched;
  const showSecurityReview = result?.matched && result?.securityReview;
  const showDenied = result?.matched && (result.denied || error) && !showSecurityReview;
  const showSuccess = result?.matched && !showDenied && !showSecurityReview;

  const effectiveEventType = result?.resolvedEventType || (eventType === 'auto' ? 'entry' : eventType);

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
        {!canWrite && (
          <p className="read-only-banner">View only — scanning requires write access.</p>
        )}

        {setupLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading divisions and gates...</p>
        ) : (
          <>
            <EntryExitSelector
              divisions={divisions}
              value={null}
              onApply={applySelection}
              disabled={!canWrite}
            />
            {error && <p className="error-msg">{error}</p>}
            {divisions.length === 0 && !error && (
              <div className="card gate-landing__empty" style={{ marginTop: '1rem' }}>
                <p className="section-title">No gates or departments configured</p>
                <p className="section-desc">
                  Create divisions with gates or departments in System settings first.
                </p>
              </div>
            )}
          </>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Entry & Exit"
      description="Scan the registered person for the selected gate or department"
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
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Back to Gate Access
              </button>
            </Link>
          )}
        </div>
      ) : (
        <div className="gate-layout">
          <div className="card gate-layout__camera">
            {!canWrite && (
              <p className="read-only-banner">View only — scanning requires write access.</p>
            )}

            <CameraCapture
              key={`${scanType}-${urlDivisionId}-${urlGateId}-${urlDepartmentId}-${eventType}-${cameraKey}`}
              autoStart={canScan}
              onCapture={handleCapture}
              label={captureLabel(eventType, scanType)}
              processing={loading}
              processingLabel={loading ? 'Processing...' : undefined}
              hideRetake={loading}
            />

            {canWrite && !canScan && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                This access point is not available. Return to Gate Access and choose another.
              </p>
            )}

            {error && !showDenied && !showSecurityReview && <p className="error-msg">{error}</p>}

            {showNotFound && (
              <div className="gate-result gate-result--not-found">
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
            onDismissSecurityReview={resetScanState}
            showSuccess={showSuccess}
            showDenied={showDenied}
            showSecurityReview={showSecurityReview}
          />
        </div>
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
