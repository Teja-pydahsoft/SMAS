'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { saveGatePhotoForRegistration } from '@/lib/gateRegistration';
import CameraCapture from '@/components/CameraCapture';
import PassCard from '@/components/PassCard';
import GateMatchedPerson from '@/components/GateMatchedPerson';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';
import { eventActionLabel, buildEntryExitUrl } from '@/lib/entryExit';
import { parseGateSessionFromSearchParams, setGateSession, getGateSession } from '@/lib/gateSession';

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
  if (scanType === 'department') {
    return eventType === 'entry' ? 'Capture for department check-in' : 'Capture for department check-out';
  }
  return eventType === 'entry' ? 'Capture for gate entry' : 'Capture for gate exit';
}

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
                {visit.departmentName} — in {visit.entryAt ? new Date(visit.entryAt).toLocaleTimeString() : '—'}
                {visit.exitAt ? ` → out ${new Date(visit.exitAt).toLocaleTimeString()}` : ' (active)'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
  const eventType = urlEventType === 'exit' ? 'exit' : 'entry';

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
  const [cameraKey] = useState(0);
  const [setupLoading, setSetupLoading] = useState(true);

  const divisions = useMemo(() => accessScope?.divisions || [], [accessScope]);

  const currentDivision = useMemo(
    () => divisions.find((d) => d._id === urlDivisionId) || null,
    [divisions, urlDivisionId]
  );

  const gates = useMemo(() => currentDivision?.gates || [], [currentDivision]);
  const departments = useMemo(() => currentDivision?.departments || [], [currentDivision]);

  const selectedGate = useMemo(
    () => gates.find((g) => g._id === urlGateId) || null,
    [gates, urlGateId]
  );

  const selectedDepartment = useMemo(
    () => departments.find((d) => d._id === urlDepartmentId) || null,
    [departments, urlDepartmentId]
  );

  const accessPointValid =
    scanType === 'gate' ? Boolean(selectedGate) : Boolean(selectedDepartment);

  const canScan = canWrite && lockedMode && accessPointValid;

  useEffect(() => {
    if (!lockedMode) {
      const storedSession = getGateSession();
      if (storedSession) {
        router.replace(buildEntryExitUrl(storedSession));
      } else {
        router.replace('/access-scope');
      }
      return;
    }
    const session = parseGateSessionFromSearchParams(searchParams);
    if (session) setGateSession(session);
  }, [lockedMode, router, searchParams]);

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
  }, []);

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
  const showDenied = result?.matched && (result.denied || error);
  const showSuccess = result?.matched && !showDenied;

  const contextTitle =
    scanType === 'gate'
      ? `${currentDivision?.name || 'Division'} — ${selectedGate?.name || 'Gate'} — ${eventActionLabel('gate', eventType)}`
      : `${currentDivision?.name || 'Division'} — ${selectedDepartment?.name || 'Department'} — ${eventActionLabel('department', eventType)}`;

  if (!lockedMode) {
    return (
      <PageShell title="Entry & Exit" description="Redirecting to Gate Access...">
        <p style={{ color: 'var(--text-muted)' }}>Select a gate or department to continue.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Entry & Exit"
      description="Scan the registered person for the selected gate or department"
    >
      <div className="entry-exit-toolbar">
        <Link href="/access-scope">
          <button type="button" className="btn-secondary">← Gate Access</button>
        </Link>
      </div>

      <div className="card entry-exit-context" style={{ marginBottom: '1rem' }}>
        <p className="entry-exit-context__label">Active access point</p>
        <p className="entry-exit-context__title">{contextTitle}</p>
        <p className="field-hint">
          Capture the registered person&apos;s photo — they will be processed for this{' '}
          {scanType === 'gate' ? 'gate' : 'department'} automatically.
        </p>
      </div>

      {setupLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading access point...</p>
      ) : !accessPointValid ? (
        <div className="card gate-result gate-result--not-found">
          <p className="gate-not-found__title">Access point not available</p>
          <p className="gate-not-found__text">
            {user?.isSuperAdmin
              ? 'This gate or department could not be found. It may be inactive or deleted.'
              : 'You do not have access to this gate or department. Choose one from Gate Access.'}
          </p>
          <Link href="/access-scope">
            <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
              Back to Gate Access
            </button>
          </Link>
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

            {error && !showDenied && <p className="error-msg">{error}</p>}

            {showSuccess && (
              <div className="gate-result gate-result--success">
                <p style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {scanType === 'gate' ? 'Gate' : 'Department'}{' '}
                  {eventType === 'entry' ? 'Entry' : 'Exit'} — Access Granted
                </p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Match score: {(result.matchScore * 100).toFixed(1)}%
                </p>
                {result.registration && (
                  <GateMatchedPerson
                    registration={result.registration}
                    matchScore={result.matchScore}
                    sessionState={sessionState || result.sessionState}
                    activeDepartment={result.activeDepartment}
                    hasGateEntry={result.hasGateEntry ?? sessionState?.divisionInside}
                  />
                )}
                <SessionStatus sessionState={sessionState || result.sessionState} />
              </div>
            )}

            {showDenied && (
              <div className="gate-result gate-result--denied">
                <p style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {scanType === 'gate' ? 'Gate' : 'Department'}{' '}
                  {eventType === 'entry' ? 'Check-in' : 'Check-out'} — Access Denied
                </p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
                <GateMatchedPerson
                  registration={result.registration}
                  matchScore={result.matchScore}
                  sessionState={sessionState || result.sessionState}
                  activeDepartment={
                    result.activeDepartment ||
                    (sessionState?.currentDepartmentId
                      ? {
                          departmentId: sessionState.currentDepartmentId,
                          departmentName: sessionState.currentDepartmentName,
                        }
                      : null)
                  }
                  hasGateEntry={result.hasGateEntry ?? sessionState?.divisionInside}
                />
                <SessionStatus sessionState={sessionState || result.sessionState} />
                {result.reason === 'no_gate_entry' && scanType === 'department' && (
                  <p className="field-hint" style={{ marginTop: '0.75rem' }}>
                    Complete division gate entry first from Access Scope.
                  </p>
                )}
              </div>
            )}

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

          <div className="card gate-layout__pass">
            <h3 className="gate-pass-panel__title">Day Pass</h3>
            {dayPass ? (
              <>
                <p className="gate-pass-panel__desc">
                  QR includes division gate status and all department visits for today.
                </p>
                <PassCard pass={dayPass} />
              </>
            ) : (
              <div className="gate-pass-panel__empty">
                <p>Complete a division gate entry scan to issue the day pass.</p>
              </div>
            )}
          </div>
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
