'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { saveGatePhotoForRegistration } from '@/lib/gateRegistration';
import CameraCapture from '@/components/CameraCapture';
import PassCard from '@/components/PassCard';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

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

function allowedEventTypes(gateType) {
  if (gateType === 'entry') return ['entry'];
  if (gateType === 'exit') return ['exit'];
  return ['entry', 'exit'];
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

export default function GatePage() {
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can('gate', 'write');

  const [activeTab, setActiveTab] = useState('gate');
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [gates, setGates] = useState([]);
  const [divisionId, setDivisionId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedGateId, setSelectedGateId] = useState('');
  const [gateEventType, setGateEventType] = useState('entry');
  const [deptEventType, setDeptEventType] = useState('entry');
  const [photoBlob, setPhotoBlob] = useState(null);
  const [result, setResult] = useState(null);
  const [dayPass, setDayPass] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [setupLoading, setSetupLoading] = useState(true);

  const selectedGate = useMemo(
    () => gates.find((g) => g._id === selectedGateId) || null,
    [gates, selectedGateId]
  );

  const gateEventOptions = useMemo(
    () => allowedEventTypes(selectedGate?.gateType),
    [selectedGate]
  );

  const canGateScan = canWrite && Boolean(divisionId && selectedGateId && selectedGate?.isActive);
  const canDeptScan = canWrite && Boolean(divisionId && selectedDepartmentId && departments.length > 0);

  const eventType = activeTab === 'gate' ? gateEventType : deptEventType;
  const canScan = activeTab === 'gate' ? canGateScan : canDeptScan;

  useEffect(() => {
    api.divisions
      .list({ isActive: 'true' })
      .then((items) => {
        setDivisions(items);
        if (items.length === 1) setDivisionId(items[0]._id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSetupLoading(false));
  }, []);

  useEffect(() => {
    if (!divisionId) {
      setDepartments([]);
      setSelectedDepartmentId('');
      setGates([]);
      setSelectedGateId('');
      return;
    }

    api.departments
      .list({ divisionId, isActive: 'true' })
      .then((items) => {
        setDepartments(items);
        setSelectedDepartmentId(items.length === 1 ? items[0]._id : '');
      })
      .catch((e) => setError(e.message));

    api.gates
      .list({ divisionId, isActive: 'true' })
      .then((items) => {
        setGates(items);
        setSelectedGateId(items.length === 1 ? items[0]._id : '');
      })
      .catch((e) => setError(e.message));
  }, [divisionId]);

  useEffect(() => {
    if (!selectedGate) return;
    const allowed = allowedEventTypes(selectedGate.gateType);
    if (!allowed.includes(gateEventType)) setGateEventType(allowed[0]);
  }, [selectedGate, gateEventType]);

  const resetScanState = useCallback(() => {
    setResult(null);
    setDayPass(null);
    setSessionState(null);
    setPhotoBlob(null);
    setError('');
  }, []);

  const processScan = useCallback(
    async (blob, type, scanType) => {
      if (!blob) return;
      setLoading(true);
      resetScanState();
      setPhotoBlob(blob);

      try {
        const options =
          scanType === 'gate'
            ? { gateId: selectedGateId, scanType: 'gate' }
            : {
                divisionId,
                departmentId: selectedDepartmentId,
                scanType: 'department',
              };

        const res = await api.gate.scan(blob, type, options);
        setResult(res);
        if (res.sessionState) setSessionState(res.sessionState);
        if (res.dayPass) setDayPass(res.dayPass);
        if (res.error) setError(res.error);
      } catch (e) {
        const data = e.data || {};
        if (data.matched || data.registration) setResult({ ...data, matched: data.matched ?? Boolean(data.registration) });
        if (data.sessionState) setSessionState(data.sessionState);
        if (data.dayPass) setDayPass(data.dayPass);
        setError(data.error || e.message);
      } finally {
        setLoading(false);
      }
    },
    [selectedGateId, divisionId, selectedDepartmentId, resetScanState]
  );

  async function handleCapture(blob) {
    if (!blob) {
      resetScanState();
      return;
    }
    if (!canScan) {
      setError(
        activeTab === 'gate'
          ? 'Select division and gate before scanning'
          : 'Select division and department before scanning'
      );
      return;
    }
    await processScan(blob, eventType, activeTab === 'gate' ? 'gate' : 'department');
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

  function handleDivisionChange(nextDivisionId) {
    setDivisionId(nextDivisionId);
    setSelectedDepartmentId('');
    setSelectedGateId('');
    resetScanState();
    setCameraKey((k) => k + 1);
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    resetScanState();
    setCameraKey((k) => k + 1);
  }

  const showNotFound = result && !result.matched;

  return (
    <PageShell
      title="Gate & Department Access"
      description="Division gate entry/exit first, then department check-in/check-out within the division"
    >
      <div className="sub-nav" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`sub-nav-item ${activeTab === 'gate' ? 'active' : ''}`}
          onClick={() => handleTabChange('gate')}
        >
          Division Gate
        </button>
        <button
          type="button"
          className={`sub-nav-item ${activeTab === 'department' ? 'active' : ''}`}
          onClick={() => handleTabChange('department')}
        >
          Department Check-in/out
        </button>
      </div>

      {setupLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading divisions...</p>
      ) : divisions.length === 0 ? (
        <div className="card gate-result gate-result--not-found">
          <p className="gate-not-found__title">No divisions configured</p>
          <Link href="/divisions/create">
            <WriteAccess module="divisions">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create Division
              </button>
            </WriteAccess>
          </Link>
        </div>
      ) : (
        <div className="gate-layout">
          <div className="card gate-layout__camera">
            {!canWrite && (
              <p className="read-only-banner">View only — scanning requires write access.</p>
            )}

            <div className="form-group">
              <label>Division</label>
              <select value={divisionId} onChange={(e) => handleDivisionChange(e.target.value)}>
                <option value="">Select division...</option>
                {divisions.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>

            {activeTab === 'gate' ? (
              <>
                <p className="field-hint" style={{ marginBottom: '1rem' }}>
                  Scan at the division gate to enter or leave the campus. A day pass is issued on gate entry.
                </p>
                <div className="gate-select-grid">
                  <div className="form-group">
                    <label>Gate</label>
                    <select
                      value={selectedGateId}
                      onChange={(e) => { setSelectedGateId(e.target.value); resetScanState(); setCameraKey((k) => k + 1); }}
                      disabled={!divisionId || gates.length === 0}
                    >
                      <option value="">Select gate...</option>
                      {gates.map((g) => (
                        <option key={g._id} value={g._id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  {gateEventOptions.length > 1 ? (
                    <div className="form-group">
                      <label>Gate Event</label>
                      <select value={gateEventType} onChange={(e) => setGateEventType(e.target.value)}>
                        <option value="entry">Gate Entry</option>
                        <option value="exit">Gate Exit</option>
                      </select>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>Gate Event</label>
                      <p className="gate-fixed-event">
                        {gateEventOptions[0] === 'entry' ? 'Entry only gate' : 'Exit only gate'}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="field-hint" style={{ marginBottom: '1rem' }}>
                  After gate entry, check in/out of departments within this division. You must check out of the
                  current department before entering another.
                </p>
                <div className="gate-select-grid">
                  <div className="form-group">
                    <label>Department</label>
                    <select
                      value={selectedDepartmentId}
                      onChange={(e) => { setSelectedDepartmentId(e.target.value); resetScanState(); setCameraKey((k) => k + 1); }}
                      disabled={!divisionId || departments.length === 0}
                    >
                      <option value="">
                        {departments.length === 0 ? 'No departments' : 'Select department...'}
                      </option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Department Event</label>
                    <select value={deptEventType} onChange={(e) => setDeptEventType(e.target.value)}>
                      <option value="entry">Department Check-in</option>
                      <option value="exit">Department Check-out</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <CameraCapture
              key={`${activeTab}-${divisionId}-${selectedGateId}-${selectedDepartmentId}-${eventType}-${cameraKey}`}
              autoStart={canScan}
              onCapture={handleCapture}
              label={captureLabel(eventType, activeTab === 'gate' ? 'gate' : 'department')}
              processing={loading}
              processingLabel={loading ? 'Processing...' : undefined}
              hideRetake={loading}
            />

            {canWrite && !canScan && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                {activeTab === 'gate'
                  ? 'Select division and gate to enable capture.'
                  : 'Select division and department to enable capture.'}
              </p>
            )}

            {error && <p className="error-msg">{error}</p>}

            {result?.matched && !error && (
              <div className="gate-result gate-result--success">
                <p style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {activeTab === 'gate' ? 'Gate' : 'Department'}{' '}
                  {eventType === 'entry' ? 'Entry' : 'Exit'} — Access Granted
                </p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Match score: {(result.matchScore * 100).toFixed(1)}%
                </p>
                <SessionStatus sessionState={sessionState || result.sessionState} />
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
