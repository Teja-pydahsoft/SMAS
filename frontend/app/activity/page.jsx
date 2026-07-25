'use client';

import { useCallback, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import CameraCapture from '@/components/CameraCapture';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import { getShiftStatus, formatShiftWindow } from '@/lib/shiftTiming';
import { enrichPeopleWithFaceCrops, enrichUnmatchedWithFaceCrops } from '@/lib/activityFaceCrop';
import { resolvePhotoUrl } from '@/lib/photoUrl';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function personKey(person, index) {
  if (person.registrationId) return person.registrationId;
  return person.unmatchedKey || `face-${index}`;
}

function faceThumb(person) {
  return person.faceCropDataUrl || resolvePhotoUrl(person.photoUrl) || null;
}

function ActivityPerson({ person }) {
  const registered = person.registered !== false;
  const inActivity = Boolean(registered && person.inActivity);
  const shiftStatus = useMemo(
    () => (inActivity ? getShiftStatus(person.shift) : { status: 'none', label: '' }),
    [inActivity, person.shift]
  );
  const window = inActivity && person.shift
    ? formatShiftWindow(person.shift.shiftStartTime, person.shift.shiftEndTime)
    : null;
  const thumb = faceThumb(person);

  return (
    <li className={`activity-person ${!registered ? 'activity-person--unregistered' : ''} ${registered && !inActivity ? 'activity-person--no-activity' : ''}`}>
      <div className="activity-person__avatar">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={person.displayName || 'Person'} />
        ) : (
          <span>{registered ? initials(person.displayName) : '?'}</span>
        )}
      </div>

      <div className="activity-person__info">
        <div className="activity-person__top">
          <strong className="activity-person__name">
            {registered ? (person.displayName || 'Unknown person') : 'Non registered person'}
          </strong>
          {!registered ? (
            <span className="activity-badge activity-badge--unregistered">Non registered</span>
          ) : inActivity ? (
            <span className="activity-badge activity-badge--in">Gate in</span>
          ) : (
            <span className="activity-badge activity-badge--no-activity">No in activity</span>
          )}
          {inActivity && shiftStatus.label && (
            <span className={`activity-badge activity-badge--${shiftStatus.status}`}>{shiftStatus.label}</span>
          )}
        </div>

        {registered && (
          <div className="activity-person__meta">
            {person.roleName && <span className="activity-person__role">{person.roleName}</span>}
            {person.registrationCode && <span className="activity-person__code">{person.registrationCode}</span>}
            {inActivity && person.divisionName && (
              <span className="activity-person__division">{person.divisionName}</span>
            )}
          </div>
        )}

        {registered && (
          <div className="activity-person__shift">
            {inActivity ? (
              person.shift?.shiftId ? (
                <>
                  <span className="activity-person__shift-name">{person.shift.shiftName || 'Assigned shift'}</span>
                  {window && <span className="activity-person__shift-window">{window}</span>}
                </>
              ) : (
                <span className="activity-person__shift-none">Gate in · no shift assigned</span>
              )
            ) : (
              <span className="activity-person__shift-none">No gate entry — recorded as activity sighting</span>
            )}
          </div>
        )}

        {!registered && (
          <div className="activity-person__shift">
            <span className="activity-person__shift-none">Face detected but not found in registrations</span>
          </div>
        )}
      </div>

      {registered && typeof person.matchScore === 'number' && (
        <div className="activity-person__score" title="Face match confidence">
          {Math.round(person.matchScore * 100)}%
        </div>
      )}
    </li>
  );
}

export default function ActivityPage() {
  const { can } = useAuth();
  const canView = can('gate', 'read');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastScanAt, setLastScanAt] = useState(null);

  const handleCapture = useCallback(async (blob) => {
    if (!blob) {
      setResult(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.gate.activityScan(blob);
      const people = await enrichPeopleWithFaceCrops(blob, res.people || []);
      const unmatchedFaces = await enrichUnmatchedWithFaceCrops(
        blob,
        res.unmatchedFaces?.length
          ? res.unmatchedFaces
          : people
              .filter((p) => p.registered === false)
              .map((p, index) => ({
                key: p.unmatchedKey || `unmatched-${index}`,
                faceBox: p.faceBox || null,
                faceCropDataUrl: p.faceCropDataUrl || null,
                photoUrl: p.photoUrl || null,
              }))
      );
      setResult({ ...res, people, unmatchedFaces });
      setLastScanAt(new Date());
    } catch (e) {
      setError(e.message || 'Could not analyse the frame');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const people = useMemo(() => (result?.people ? [...result.people] : []), [result]);
  const unmatchedFaces = useMemo(() => result?.unmatchedFaces || [], [result]);

  if (!canView) {
    return (
      <PageShell title="Activity" description="Live face-recognition monitor">
        <p className="read-only-banner">You do not have access to the activity monitor.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Activity"
      description="Capture a frame to see everyone in it — gate-in status, shift, and non-registered faces"
    >
      <div className="gate-layout">
        <div className="card gate-layout__camera">
          <CameraCapture
            autoStart
            onCapture={handleCapture}
            label="Capture frame"
            processing={loading}
            processingLabel="Recognising faces..."
            defaultMirrored={false}
          />
          {error && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</p>}

          {unmatchedFaces.length > 0 && (
            <div className="activity-unregistered-panel">
              <div className="activity-unregistered-panel__header">
                <h4 className="activity-unregistered-panel__title">Non registered faces</h4>
                <span className="activity-unregistered-panel__count">{unmatchedFaces.length}</span>
              </div>
              <div className="activity-unregistered-grid">
                {unmatchedFaces.map((face) => (
                  <div key={face.key} className="activity-unregistered-card">
                    <div className="activity-unregistered-card__photo">
                      {face.faceCropDataUrl || resolvePhotoUrl(face.photoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={face.faceCropDataUrl || resolvePhotoUrl(face.photoUrl)} alt="Non registered person" />
                      ) : (
                        <span>?</span>
                      )}
                    </div>
                    <span className="activity-unregistered-card__label">Non registered</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card activity-panel gate-layout__details">
          <div className="activity-panel__header">
            <h3 className="section-title">People in frame</h3>
            {result && (
              <span className="activity-panel__summary">
                {result.inActivityCount ?? 0} gate in
                {result.matchedCount > 0 && ` · ${result.matchedCount} registered`}
                {result.unmatchedCount > 0 && ` · ${result.unmatchedCount} non registered`}
                {typeof result.facesDetected === 'number' && ` · ${result.facesDetected} face(s)`}
              </span>
            )}
          </div>

          {result && (
            <div className="activity-legend" aria-hidden="true">
              <span className="activity-badge activity-badge--in">Gate in</span>
              <span className="activity-badge activity-badge--no-activity">No in activity</span>
              <span className="activity-badge activity-badge--unregistered">Non registered</span>
            </div>
          )}

          {loading && <p className="activity-panel__hint">Analysing the captured frame…</p>}

          {!loading && !result && (
            <p className="activity-panel__hint">
              Point the camera at the area you want to monitor, then press <strong>Capture frame</strong>.
              Registered people are saved to today&apos;s activity even without a gate entry.
              Unmatched faces appear under the camera on the left.
            </p>
          )}

          {!loading && result && people.length === 0 && (
            <p className="activity-panel__hint">No faces were detected in this frame.</p>
          )}

          {people.length > 0 && (
            <ul className="activity-people">
              {people.map((person, index) => (
                <ActivityPerson key={personKey(person, index)} person={person} />
              ))}
            </ul>
          )}

          {lastScanAt && !loading && (
            <p className="activity-panel__timestamp">
              Last capture: {lastScanAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
