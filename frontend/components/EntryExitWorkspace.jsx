'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { saveGatePhotoForRegistration } from '@/lib/gateRegistration';
import GateCameraScanner from '@/components/GateCameraScanner';
import GateScanDetailsPanel from '@/components/GateScanDetailsPanel';
import RemarkEntryModal from '@/components/RemarkEntryModal';
import AutoGateEntryConfirmModal from '@/components/AutoGateEntryConfirmModal';
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

function applyResult(res, setResult, setSessionState, setDayPass, setError, setRecentLogs, localBlob = null) {
  let effectiveRes = res;
  if (!effectiveRes?.photoUrl && localBlob) {
    try {
      effectiveRes = { ...effectiveRes, photoUrl: URL.createObjectURL(localBlob) };
    } catch {
      // ignore
    }
  }
  setResult(effectiveRes);
  if (effectiveRes?.sessionState) setSessionState(effectiveRes.sessionState);
  if (effectiveRes?.dayPass) setDayPass(effectiveRes.dayPass);
  if (effectiveRes?.denied) setError(effectiveRes.error || 'Access denied');
  else if (effectiveRes?.error) setError(effectiveRes.error);
  if (effectiveRes?.log && typeof setRecentLogs === 'function') {
    setRecentLogs((prev) => [
      {
        ...effectiveRes.log,
        registration: effectiveRes.registration || prev[0]?.registration,
        photoUrl: effectiveRes.photoUrl || effectiveRes.log?.photoPath,
        createdAt: effectiveRes.log.createdAt || new Date().toISOString(),
      },
      ...prev.filter((l) => l._id !== effectiveRes.log._id).slice(0, 5),
    ]);
  }
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

function EntryExitContent({
  basePath = '/entry-exit',
  allowedScanTypes = ['gate', 'department'],
  pageTitle = 'Entry & Exit',
  pageDescription = 'Show a Registration Pass QR code, or press Capture for face recognition',
  unlockedDescription = 'Select a gate or department, then scan registered people',
  allowOpenSelector = false,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, can } = useAuth();
  const divisionOnly = allowedScanTypes.length === 1 && allowedScanTypes[0] === 'gate';
  const openSelector = allowOpenSelector || divisionOnly;
  const canWrite = can('gate', 'write') || (divisionOnly && can('jattu_entry_exit', 'write'));

  const urlScanType = searchParams.get('scanType');
  const urlDivisionId = searchParams.get('divisionId');
  const urlGateId = searchParams.get('gateId');
  const urlDepartmentId = searchParams.get('departmentId');
  const urlEventType = searchParams.get('eventType');

  // scanType = gate | department (the access-point type, not face/qr)
  // JATTU / division-only mode never uses department check-in.
  const scanType =
    divisionOnly || urlScanType !== 'department' ? 'gate' : 'department';

  const lockedMode = Boolean(
    urlScanType &&
      urlDivisionId &&
      urlEventType &&
      ((scanType === 'gate' && urlGateId) || (scanType === 'department' && urlDepartmentId)) &&
      (!divisionOnly || urlScanType === 'gate')
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
  const [lastQrPassCode, setLastQrPassCode] = useState('');
  const [forceCheckoutLoading, setForceCheckoutLoading] = useState(false);
  /**
   * autoGateEntryPending — set when the backend returns needsAutoGateEntry:true
   * (HTTP 202) for a dept scan on a division with gateEntryRequired=false.
   * Holds { type:'face'|'qr', blob?, passCode?, options, divisionName, borrowedGateEntry, registration }
   */
  const [autoGateEntryPending, setAutoGateEntryPending] = useState(null);
  const [autoGateEntryLoading, setAutoGateEntryLoading] = useState(false);
  const [eyeBlinkEnabled, setEyeBlinkEnabled] = useState(true);
  const [liveTime, setLiveTime] = useState('');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [recentLogs, setRecentLogs] = useState([]);

  // Live real-time clock matching mockup
  useEffect(() => {
    function tick() {
      const now = new Date();
      const datePart = now.toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timePart = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setLiveTime(`${datePart}, ${timePart}`);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Enumerate cameras
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devs) => {
        const videoInputs = devs.filter((d) => d.kind === 'videoinput');
        setCameraDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedCameraId) {
          setSelectedCameraId(videoInputs[0].deviceId);
        }
      })
      .catch(() => {});
  }, [selectedCameraId]);

  // Fetch initial recent logs for this gate
  useEffect(() => {
    if (!urlGateId && !urlDepartmentId) return;
    api.gate
      .logs({
        limit: 10,
        ...(urlGateId ? { gateId: urlGateId } : {}),
        ...(urlDepartmentId ? { departmentId: urlDepartmentId } : {}),
      })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.logs || [];
        setRecentLogs(list.slice(0, 6));
      })
      .catch(() => {});
  }, [urlGateId, urlDepartmentId]);

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

  // Auto-select single gate if division has only one gate and urlGateId is missing
  useEffect(() => {
    if (scanType === 'gate' && currentDivision && gates.length === 1 && !urlGateId) {
      const singleGate = gates[0];
      const allowed = singleGate.allowedEvents || [];
      let nextEvent = 'entry';
      if (allowed.includes('auto')) nextEvent = 'auto';
      else if (allowed.includes('entry')) nextEvent = 'entry';
      else if (allowed.includes('exit')) nextEvent = 'exit';
      else nextEvent = singleGate.gateType === 'both' ? 'auto' : 'entry';

      const nextSession = {
        scanType: 'gate',
        divisionId: currentDivision._id,
        gateId: singleGate._id,
        eventType: nextEvent,
      };
      setGateSession(nextSession);
      router.replace(buildEntryExitUrl({ ...nextSession, basePath }));
    }
  }, [scanType, currentDivision, gates, urlGateId, router, basePath]);

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
    Promise.all([
      api.auth.accessScope(),
      api.gate.publicSettings().catch(() => ({ eyeBlinkVerificationEnabled: true })),
    ])
      .then(([scope, gateSettings]) => {
        setAccessScope(scope);
        if (gateSettings && typeof gateSettings.eyeBlinkVerificationEnabled === 'boolean') {
          setEyeBlinkEnabled(gateSettings.eyeBlinkVerificationEnabled);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setSetupLoading(false));
  }, []);

  const resetScanState = useCallback(() => {
    setResult(null);
    setDayPass(null);
    setSessionState(null);
    setPhotoBlob(null);
    setLastQrPassCode('');
    setError('');
    setShowDayPass(false);
    setRemarkPicker(null);
    setForceCheckoutLoading(false);
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
      const nextSession = divisionOnly
        ? { ...session, scanType: 'gate', departmentId: undefined }
        : session;

      const sameAsCurrent =
        currentSession &&
        currentSession.scanType === nextSession.scanType &&
        currentSession.divisionId === nextSession.divisionId &&
        currentSession.eventType === nextSession.eventType &&
        (nextSession.scanType === 'gate'
          ? currentSession.gateId === nextSession.gateId
          : currentSession.departmentId === nextSession.departmentId);

      if (currentSession && !sameAsCurrent) resetScanState();
      setGateSession(nextSession);
      router.replace(buildEntryExitUrl({ ...nextSession, basePath }));
    },
    [currentSession, resetScanState, router, basePath, divisionOnly]
  );

  const clearSelection = useCallback(() => {
    clearGateSession();
    resetScanState();
    router.replace(basePath);
  }, [resetScanState, router, basePath]);

  useEffect(() => {
    // Reject department URLs on division-only (JATTU) pages.
    if (divisionOnly && urlScanType === 'department') {
      router.replace(basePath);
      return;
    }

    if (!lockedMode) {
      if (isSuperAdmin || openSelector) return;
      const storedSession = getGateSession();
      if (storedSession) {
        if (divisionOnly && storedSession.scanType === 'department') {
          router.replace(basePath);
          return;
        }
        router.replace(buildEntryExitUrl({ ...storedSession, basePath }));
      } else {
        router.replace('/access-scope');
      }
      return;
    }
    const session = parseGateSessionFromSearchParams(searchParams);
    if (!session) return;
    if (divisionOnly && session.scanType !== 'gate') {
      router.replace(basePath);
      return;
    }

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
        router.replace(buildEntryExitUrl({ ...adjustedSession, basePath }));
        return;
      }
    }

    // Force auto event type for department scans (always auto by default)
    if (
      !divisionOnly &&
      session.scanType === 'department' &&
      session.departmentId &&
      session.eventType !== 'auto' &&
      session.eventType !== 'entry' &&
      session.eventType !== 'exit'
    ) {
      const autoSession = { ...session, eventType: 'auto' };
      setGateSession(autoSession);
      router.replace(buildEntryExitUrl({ ...autoSession, basePath }));
      return;
    }

    setGateSession(session);
  }, [
    isSuperAdmin,
    lockedMode,
    router,
    searchParams,
    selectedGate?._id,
    (selectedGate?.allowedEvents || []).join(','),
    basePath,
    divisionOnly,
    openSelector,
    urlScanType,
  ]);

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

        // ── Optional gate entry: first pass ───────────────────────────────
        if (res.needsAutoGateEntry) {
          setAutoGateEntryPending({
            type: 'face',
            blob,
            options,
            divisionName: res.divisionName || '',
            borrowedGateEntry: res.borrowedGateEntry || null,
            registration: res.registration || null,
          });
          return; // hold loading=true until operator responds
        }

        applyResult(res, setResult, setSessionState, setDayPass, setError, setRecentLogs, blob);
        maybePromptRemark(res);
      } catch (e) {
        applyErrorData(e, setResult, setSessionState, setDayPass, setError);
      } finally {
        setLoading(false);
      }
    },
    [loading, canScan, scanType, urlGateId, urlDivisionId, urlDepartmentId, eventType, resetScanState, maybePromptRemark, setRecentLogs]
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
      setLastQrPassCode(passCode);

      try {
        const options =
          scanType === 'gate'
            ? { gateId: urlGateId }
            : { divisionId: urlDivisionId, departmentId: urlDepartmentId };

        const res = await api.gate.qrScan(passCode, eventType, options);

        // ── Optional gate entry: first pass ───────────────────────────────
        if (res.needsAutoGateEntry) {
          setAutoGateEntryPending({
            type: 'qr',
            passCode,
            options,
            divisionName: res.divisionName || '',
            borrowedGateEntry: res.borrowedGateEntry || null,
            registration: res.registration || null,
          });
          return; // hold loading=true until operator responds
        }

        applyResult(res, setResult, setSessionState, setDayPass, setError, setRecentLogs);
        maybePromptRemark(res);
      } catch (e) {
        applyErrorData(e, setResult, setSessionState, setDayPass, setError);
      } finally {
        setLoading(false);
      }
    },
    [loading, canScan, scanType, urlGateId, urlDivisionId, urlDepartmentId, eventType, resetScanState, maybePromptRemark, setRecentLogs]
  );

  const handleForceCheckout = useCallback(async () => {
    if (forceCheckoutLoading || loading) return;
    if (scanType !== 'gate') return;
    if (!result?.canForceCheckout && result?.reason !== 'department_still_active') return;

    const options =
      scanType === 'gate'
        ? { gateId: urlGateId, forceDepartmentCheckout: true }
        : { divisionId: urlDivisionId, departmentId: urlDepartmentId, forceDepartmentCheckout: true };

    // Prefer exit explicitly so force checkout always runs on gate exit.
    const forceEventType = eventType === 'auto' ? 'exit' : eventType;

    setForceCheckoutLoading(true);
    setError('');

    try {
      let res;
      if (photoBlob) {
        res = await api.gate.scan(photoBlob, forceEventType, {
          ...options,
          scanType: 'gate',
          registrationId: result?.registration?._id || null,
        });
      } else if (lastQrPassCode) {
        res = await api.gate.qrScan(lastQrPassCode, forceEventType, options);
      } else {
        setError('Scan again, then use Force department out & gate exit.');
        return;
      }
      applyResult(res, setResult, setSessionState, setDayPass, setError, setRecentLogs, photoBlob);
    } catch (e) {
      applyErrorData(e, setResult, setSessionState, setDayPass, setError);
    } finally {
      setForceCheckoutLoading(false);
    }
  }, [
    forceCheckoutLoading,
    loading,
    scanType,
    result?.canForceCheckout,
    result?.reason,
    result?.registration?._id,
    urlGateId,
    urlDivisionId,
    urlDepartmentId,
    eventType,
    photoBlob,
    lastQrPassCode,
  ]);

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

  if (!lockedMode && !isSuperAdmin && !openSelector) {
    return (
      <PageShell title={pageTitle} description="Redirecting to Gate Access...">
        <p style={{ color: 'var(--text-muted)' }}>Select a gate or department to continue.</p>
      </PageShell>
    );
  }

  if (!lockedMode && (isSuperAdmin || openSelector)) {
    return (
      <PageShell
        title={pageTitle}
        description={unlockedDescription}
      >
        {!canWrite && <p className="read-only-banner">View only — scanning requires write access.</p>}
        {setupLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading divisions and gates...</p>
        ) : (
          <>
            <EntryExitSelector
              divisions={divisions}
              value={null}
              onApply={applySelection}
              disabled={!canWrite}
              allowedScanTypes={allowedScanTypes}
              autoSelectSingleScope={!isSuperAdmin}
            />
            {error && <p className="error-msg">{error}</p>}
            {divisions.length === 0 && !error && (
              <div className="card gate-landing__empty" style={{ marginTop: '1rem' }}>
                <p className="section-title">
                  {divisionOnly ? 'No division gates configured' : 'No gates or departments configured'}
                </p>
                <p className="section-desc">
                  {divisionOnly
                    ? 'Create divisions with gates in System settings first.'
                    : 'Create divisions with gates or departments in System settings first.'}
                </p>
              </div>
            )}
          </>
        )}
      </PageShell>
    );
  }

  // ── active gate view ──────────────────────────────────────────────────────

  const cameraDeviceLabel =
    cameraDevices.find((d) => d.deviceId === selectedCameraId)?.label || 'Camera 1 - Entrance';

  return (
    <PageShell>
      {/* ── Top Page Header (Mockup Matched) ── */}
      <div className="ee-page-header">
        <div className="ee-page-header__left">
          <div className="ee-page-header__logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="ee-page-header__title">Entry & Exit Access Management</h1>
            <p className="ee-page-header__subtitle">Live camera feed and real-time access verification</p>
          </div>
        </div>
        <div className="ee-page-header__right">
          <div className="ee-system-status">
            <span className="ee-system-status__dot" />
            System Online
          </div>
          <div className="ee-clock-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{liveTime || 'Live'}</span>
          </div>
        </div>
      </div>

      {/* ── Division & Department Selector Tabs (Kept same as before) ── */}
      <EntryExitSelector
        divisions={divisions}
        value={currentSession}
        onApply={applySelection}
        disabled={!canWrite || setupLoading}
        allowedScanTypes={allowedScanTypes}
        autoSelectSingleScope={!isSuperAdmin}
      />

      {setupLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading access point...</p>
      ) : !accessPointValid ? (
        <div className="card gate-result gate-result--not-found">
          <p className="gate-not-found__title">Access point not available</p>
          <p className="gate-not-found__text">
            {isSuperAdmin || openSelector
              ? divisionOnly
                ? 'This division gate could not be found. It may be inactive or deleted.'
                : 'This gate or department could not be found. It may be inactive or deleted.'
              : 'You do not have access to this gate or department. Choose one from Gate Access.'}
          </p>
          {isSuperAdmin || openSelector ? (
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
          <div className="gate-layout__camera">
            {!canWrite && <p className="read-only-banner">View only — scanning requires write access.</p>}

            {/* Camera label bar */}
            <div className="ee-camera-label">
              <span className="ee-camera-label__left">
                <svg className="ee-camera-label__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
                Live Camera Feed
              </span>
              {canScan && (
                <span className="ee-camera-label__live">
                  <span className="ee-camera-label__live-dot" />
                  LIVE
                </span>
              )}
            </div>

            {/* Single unified scanner — auto-detects QR, button for face */}
            <GateCameraScanner
              key={`${scanType}-${urlDivisionId}-${urlGateId}-${urlDepartmentId}-${eventType}-${cameraKey}`}
              autoStart={canScan}
              onFaceCapture={handleFaceCapture}
              onQrDetect={handleQrDetect}
              captureLabel="Capture New Person"
              processing={loading}
              eyeBlinkEnabled={eyeBlinkEnabled}
              cameraDeviceLabel={cameraDeviceLabel}
              stationLabel={accessPointTitle}
              selectedDeviceId={selectedCameraId}
            />

            {canWrite && !canScan && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                This access point is not available. Return to Gate Access and choose another.
              </p>
            )}

            {error && !showDenied && !showSecurityReview && <p className="error-msg">{error}</p>}

            {showDenied && (
              <div className="gate-result gate-result--denied" style={{ marginTop: '0.5rem' }}>
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
                    <WriteAccess modules={divisionOnly ? ['registrations', 'jattu_registrations', 'jattu_entry_exit'] : ['registrations']}>
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
            onForceCheckout={
              scanType === 'gate' && (result?.canForceCheckout || result?.reason === 'department_still_active')
                ? handleForceCheckout
                : undefined
            }
            forceCheckoutLoading={forceCheckoutLoading}
          />
        </div>
      )}

      {/* Auto Gate Entry confirmation modal */}
      {autoGateEntryPending && (
        <AutoGateEntryConfirmModal
          registration={autoGateEntryPending.registration}
          divisionName={autoGateEntryPending.divisionName}
          borrowedGateEntry={autoGateEntryPending.borrowedGateEntry}
          loading={autoGateEntryLoading}
          onConfirm={async () => {
            setAutoGateEntryLoading(true);
            const pending = autoGateEntryPending;
            try {
              let res;
              if (pending.type === 'face') {
                res = await api.gate.scan(pending.blob, eventType, {
                  ...pending.options,
                  autoCreateGateEntry: true,
                });
              } else {
                res = await api.gate.qrScan(pending.passCode, eventType, {
                  ...pending.options,
                  autoCreateGateEntry: true,
                });
              }
              setAutoGateEntryPending(null);
              applyResult(res, setResult, setSessionState, setDayPass, setError);
              maybePromptRemark(res);
            } catch (e) {
              applyErrorData(e, setResult, setSessionState, setDayPass, setError);
              setAutoGateEntryPending(null);
            } finally {
              setAutoGateEntryLoading(false);
              setLoading(false);
            }
          }}
          onCancel={() => {
            setAutoGateEntryPending(null);
            setLoading(false);
            resetScanState();
          }}
        />
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

export default function EntryExitPageContent(props) {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading entry & exit...</p>}>
      <EntryExitContent {...props} />
    </Suspense>
  );
}
