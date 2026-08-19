'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import CameraCapture from '@/components/CameraCapture';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import { formatDate, formatDateTime, todayDateStringIst } from '@/lib/formatDate';
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

export default function ProjectPhotoCapturePage() {
  const { can } = useAuth();
  const canWrite = can('project_photo_capture', 'write');
  const canRead = can('project_photo_capture', 'read');

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [photoDays, setPhotoDays] = useState([]);
  const [photoDate, setPhotoDate] = useState(todayDateStringIst());
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [recentPhotos, setRecentPhotos] = useState([]);

  // Active assigned labourers for the selected project
  const [assignedLabourers, setAssignedLabourers] = useState([]);

  const selectedProject = useMemo(
    () => projects.find((p) => (p.id || p._id) === projectId) || null,
    [projects, projectId]
  );

  const selectableDays = useMemo(
    () => (photoDays || []).filter((d) => !d.isFuture && d.inWindow !== false),
    [photoDays]
  );

  // Assigned labourers not detected in the last capture
  const missingLabourers = useMemo(() => {
    if (!lastResult || !assignedLabourers.length) return [];
    const seenIds = new Set(
      (lastResult.people || [])
        .filter((p) => p.registered && p.assignedToProject)
        .map((p) => p.registrationId)
        .filter(Boolean)
    );
    return assignedLabourers.filter(
      (a) => a.assignmentStatus === 'active' && !seenIds.has(a.labourId)
    );
  }, [lastResult, assignedLabourers]);

  // Load projects list
  useEffect(() => {
    if (!canRead) return;
    setLoadingProjects(true);
    api.projects
      .list({ status: 'active' })
      .then((list) => {
        const rows = Array.isArray(list) ? list : list?.projects || [];
        setProjects(rows);
        if (!projectId && rows[0]) {
          setProjectId(rows[0].id || rows[0]._id);
        }
      })
      .catch((e) => setError(e.message || 'Failed to load projects'))
      .finally(() => setLoadingProjects(false));
  }, [canRead]);

  // Load photo days + active assignments whenever project changes
  useEffect(() => {
    if (!projectId || !canRead) {
      setPhotoDays([]);
      setAssignedLabourers([]);
      return;
    }
    let cancelled = false;

    Promise.all([
      api.projects.photoDays(projectId),
      api.projects.assignments(projectId),
    ])
      .then(([daysRes, assignRes]) => {
        if (cancelled) return;

        const days = daysRes.days || [];
        setPhotoDays(days);
        const today =
          days.find((d) => d.isToday)?.photoDate ||
          days.find((d) => !d.isFuture)?.photoDate ||
          todayDateStringIst();
        setPhotoDate((prev) => {
          if (days.some((d) => d.photoDate === prev && !d.isFuture)) return prev;
          return today;
        });

        setAssignedLabourers(
          (assignRes.assignments || []).filter((a) => a.assignmentStatus === 'active')
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load project data');
      });

    return () => { cancelled = true; };
  }, [projectId, canRead]);

  const refreshRecent = useCallback(async () => {
    if (!projectId || !photoDate) {
      setRecentPhotos([]);
      return;
    }
    try {
      const res = await api.projects.photos(projectId, { date: photoDate });
      setRecentPhotos((res.photos || []).slice(0, 8));
    } catch {
      setRecentPhotos([]);
    }
  }, [projectId, photoDate]);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const handleCapture = useCallback(
    async (blob) => {
      if (!blob || !projectId || !photoDate) return;
      if (!canWrite) {
        setError('You do not have permission to capture project photos');
        return;
      }
      setCapturing(true);
      setError('');
      setSuccess('');
      try {
        const file = new File([blob], `project-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        const result = await api.projects.uploadPhotos(projectId, [file], photoDate);
        const uploaded = result.uploaded?.[0] || null;
        const people = uploaded?.people || [];
        const facesDetected = uploaded?.facesDetected ?? people.length;
        const matched = uploaded?.matchedAssignedCount ?? 0;
        const storedWithoutFaces = Boolean(uploaded?.storedWithoutFaces) || facesDetected === 0;

        setLastResult({
          photo: uploaded,
          people,
          facesDetected,
          matchedAssignedCount: matched,
          matchedCount: uploaded?.matchedCount ?? people.filter((p) => p.registered).length,
          unmatchedCount: uploaded?.unmatchedCount ?? people.filter((p) => !p.registered).length,
          inActivityCount:
            uploaded?.inActivityCount ??
            people.filter((p) => p.registered && p.inActivity).length,
          storedWithoutFaces,
          analysisWarning: uploaded?.analysisWarning || null,
          at: new Date(),
        });

        if (storedWithoutFaces) {
          setSuccess(
            `Photo saved to ${selectedProject?.projectName || 'project'} for ${photoDate}` +
              ` — no persons detected, frame stored against the selected project.`
          );
        } else {
          setSuccess(
            `Photo saved for ${photoDate}` +
              ` · ${facesDetected} person(s)` +
              (matched ? ` · ${matched} assigned` : '')
          );
        }
        await refreshRecent();
      } catch (e) {
        setError(e.message || 'Failed to store project photo');
        setLastResult(null);
      } finally {
        setCapturing(false);
      }
    },
    [projectId, photoDate, canWrite, selectedProject, refreshRecent]
  );

  if (!canRead) {
    return (
      <PageShell title="Project Photo Capture" description="Capture site photos for projects">
        <p className="read-only-banner">You do not have access to project photo capture.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Project Photo Capture"
      description="Capture site photos for the selected project — frames are stored even when no persons are detected"
    >
      <div className="ppc-page">
        {/* ── Toolbar ── */}
        <div className="ppc-toolbar card">
          <div className="form-group">
            <label htmlFor="ppc-project">Project</label>
            <select
              id="ppc-project"
              value={projectId}
              disabled={loadingProjects || capturing}
              onChange={(e) => {
                setProjectId(e.target.value);
                setLastResult(null);
                setSuccess('');
                setError('');
              }}
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id || p._id} value={p.id || p._id}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ppc-date">Photo day</label>
            <select
              id="ppc-date"
              value={photoDate}
              disabled={!projectId || capturing || selectableDays.length === 0}
              onChange={(e) => {
                setPhotoDate(e.target.value);
                setLastResult(null);
                setSuccess('');
              }}
            >
              {selectableDays.length === 0 && <option value={photoDate}>{photoDate}</option>}
              {selectableDays.map((d) => (
                <option key={d.photoDate} value={d.photoDate}>
                  Day {d.dayIndex} · {formatDate(d.photoDate)}
                  {d.isToday ? ' (Today)' : ''}
                  {d.photoCount ? ` · ${d.photoCount} photo(s)` : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedProject && (
            <div className="ppc-toolbar__meta">
              <div>
                <strong>{selectedProject.projectName}</strong>
              </div>
              <div>
                {selectedProject.statusLabel || selectedProject.status || 'active'}
                {selectedProject.requiredDays
                  ? ` · ${selectedProject.requiredDays} required day(s)`
                  : ''}
                {assignedLabourers.length > 0
                  ? ` · ${assignedLabourers.length} assigned`
                  : ''}
              </div>
            </div>
          )}
        </div>

        {!canWrite && (
          <p className="read-only-banner">
            You can view projects but need write access to capture photos.
          </p>
        )}

        <div className="gate-layout">
          {/* ── Camera column ── */}
          <div className="card gate-layout__camera">
            <CameraCapture
              autoStart={Boolean(projectId && photoDate && canWrite)}
              onCapture={handleCapture}
              label="Capture project photo"
              processing={capturing}
              processingLabel="Saving project photo…"
              defaultMirrored={false}
              defaultFacingMode="environment"
            />
            {error && (
              <p className="error-msg" style={{ marginTop: '0.75rem' }}>
                {error}
              </p>
            )}
            {success && (
              <p className="success-msg" style={{ marginTop: '0.75rem' }}>
                {success}
              </p>
            )}

            {/* Non-registered faces detected */}
            {(lastResult?.people || []).filter((p) => !p.registered).length > 0 && (
              <div className="activity-unregistered-panel">
                <div className="activity-unregistered-panel__header">
                  <h4 className="activity-unregistered-panel__title">Non registered faces</h4>
                  <span className="activity-unregistered-panel__count">
                    {lastResult.people.filter((p) => !p.registered).length}
                  </span>
                </div>
                <div className="activity-unregistered-grid">
                  {lastResult.people
                    .filter((p) => !p.registered)
                    .map((face, index) => (
                      <div key={face.unmatchedKey || `u-${index}`} className="activity-unregistered-card">
                        <div className="activity-unregistered-card__photo">
                          {face.faceCropDataUrl || resolvePhotoUrl(face.facePhotoUrl || face.photoUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={face.faceCropDataUrl || resolvePhotoUrl(face.facePhotoUrl || face.photoUrl)}
                              alt="Non registered person"
                            />
                          ) : (
                            <span>?</span>
                          )}
                        </div>
                        <span className="activity-unregistered-card__label">Not registered</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Results column ── */}
          <div className="card activity-panel gate-layout__details">
            <div className="activity-panel__header">
              <h3 className="section-title">People in frame</h3>
              {lastResult && (
                <span className="activity-panel__summary">
                  {lastResult.inActivityCount || 0} gate in
                  {lastResult.matchedCount > 0 && ` · ${lastResult.matchedCount} registered`}
                  {lastResult.unmatchedCount > 0 && ` · ${lastResult.unmatchedCount} non registered`}
                  {` · ${lastResult.facesDetected} person(s)`}
                </span>
              )}
            </div>

            {!projectId && (
              <p className="activity-panel__hint">
                Select a project first. Captured frames are saved to that project&apos;s daily photo
                folder.
              </p>
            )}

            {projectId && !lastResult && !capturing && (
              <p className="activity-panel__hint">
                Point the camera at the work site and press{' '}
                <strong>Capture project photo</strong>. Results show whether each person is
                registered, assigned to this project, and currently gate-in. Empty frames are still
                stored for the selected project.
              </p>
            )}

            {capturing && (
              <p className="activity-panel__hint">Uploading and analysing the frame…</p>
            )}

            {lastResult && (
              <div className="ppc-result">
                {/* Stats row */}
                <div className="ppc-result__stats">
                  <div>
                    <span className="ppc-result__label">Stored</span>
                    <strong>Yes · {formatDate(photoDate)}</strong>
                  </div>
                  <div>
                    <span className="ppc-result__label">Persons</span>
                    <strong>{lastResult.facesDetected}</strong>
                  </div>
                  <div>
                    <span className="ppc-result__label">Assigned</span>
                    <strong>{lastResult.matchedAssignedCount}</strong>
                  </div>
                </div>

                {/* Legend */}
                <div className="activity-legend" aria-hidden="true">
                  <span className="activity-badge activity-badge--in">Gate in</span>
                  <span className="activity-badge activity-badge--no-activity">Not in gate</span>
                  <span className="activity-badge activity-badge--unknown">Not on project</span>
                  <span className="activity-badge activity-badge--unregistered">Not registered</span>
                </div>

                {lastResult.storedWithoutFaces && (
                  <p className="ppc-result__note">
                    No persons detected — photo kept on the selected project for site record.
                  </p>
                )}
                {lastResult.analysisWarning && (
                  <p className="ppc-result__note ppc-result__note--warn">
                    Face analysis warning: {lastResult.analysisWarning}. Photo was still saved.
                  </p>
                )}

                {!capturing && lastResult.people?.length === 0 && !lastResult.storedWithoutFaces && (
                  <p className="activity-panel__hint">No persons were confirmed in this frame.</p>
                )}

                {/* Detected people list */}
                {(lastResult.people || []).length > 0 && (
                  <ul className="activity-people">
                    {lastResult.people.map((person, index) => {
                      const thumb =
                        person.faceCropDataUrl ||
                        resolvePhotoUrl(person.facePhotoUrl) ||
                        resolvePhotoUrl(person.photoUrl);
                      const key = person.registrationId || person.unmatchedKey || `p-${index}`;
                      let badgeClass = 'activity-badge--unregistered';
                      let badgeText = 'Not registered';
                      let rowClass = 'activity-person--unregistered';
                      if (person.registered) {
                        if (!person.assignedToProject) {
                          badgeClass = 'activity-badge--unknown';
                          badgeText = 'Not on project';
                          rowClass = '';
                        } else if (person.inActivity) {
                          badgeClass = 'activity-badge--in';
                          badgeText = 'Gate in';
                          rowClass = '';
                        } else {
                          badgeClass = 'activity-badge--no-activity';
                          badgeText = 'Not in gate';
                          rowClass = 'activity-person--no-activity';
                        }
                      }
                      return (
                        <li key={key} className={`activity-person ${rowClass}`.trim()}>
                          <div className="activity-person__avatar">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt={person.displayName || 'Person'} />
                            ) : (
                              <span>{person.registered ? initials(person.displayName) : '?'}</span>
                            )}
                          </div>
                          <div className="activity-person__info">
                            <div className="activity-person__top">
                              <strong className="activity-person__name">
                                {person.registered
                                  ? person.displayName || 'Unknown person'
                                  : 'Non registered person'}
                              </strong>
                              <span className={`activity-badge ${badgeClass}`}>{badgeText}</span>
                            </div>
                            {person.registered && (
                              <div className="activity-person__meta">
                                {person.roleName && (
                                  <span className="activity-person__role">{person.roleName}</span>
                                )}
                                {person.registrationCode && (
                                  <span className="activity-person__code">
                                    {person.registrationCode}
                                  </span>
                                )}
                                {person.divisionName && (
                                  <span className="activity-person__division">
                                    {person.divisionName}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="activity-person__shift">
                              <span className="activity-person__shift-none">
                                {person.statusLabel || badgeText}
                              </span>
                            </div>
                          </div>
                          {person.registered && typeof person.matchScore === 'number' && (
                            <div
                              className="activity-person__score"
                              title="Face match confidence"
                            >
                              {Math.round(person.matchScore * 100)}%
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* ── Missing assigned labourers ── */}
                {missingLabourers.length > 0 && (
                  <div className="ppc-missing-panel">
                    <div className="ppc-missing-panel__header">
                      <div className="ppc-missing-panel__title-row">
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <h4 className="ppc-missing-panel__title">Not seen in this frame</h4>
                        <span className="ppc-missing-panel__count">{missingLabourers.length}</span>
                      </div>
                      <p className="ppc-missing-panel__sub">
                        Assigned labourers not detected in this capture
                      </p>
                    </div>
                    <ul className="ppc-missing-list">
                      {missingLabourers.map((labour) => {
                        const thumb = resolvePhotoUrl(labour.photoUrl);
                        return (
                          <li key={labour.labourId} className="ppc-missing-item">
                            <div className="ppc-missing-item__avatar">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt={labour.labourName} />
                              ) : (
                                <span>{initials(labour.labourName)}</span>
                              )}
                            </div>
                            <div className="ppc-missing-item__info">
                              <span className="ppc-missing-item__name">
                                {labour.labourName}
                              </span>
                              <div className="ppc-missing-item__meta">
                                {labour.registrationCode && (
                                  <span>{labour.registrationCode}</span>
                                )}
                                {labour.divisionName && <span>{labour.divisionName}</span>}
                                {labour.departmentName && (
                                  <span>{labour.departmentName}</span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`activity-badge ${
                                labour.gateStatus === 'Inside'
                                  ? 'activity-badge--in'
                                  : 'activity-badge--no-activity'
                              }`}
                            >
                              {labour.gateStatus === 'Inside' ? 'Gate in' : 'Not in gate'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {lastResult.at && (
                  <p className="activity-panel__timestamp">
                    Last capture: {lastResult.at.toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}

            {/* ── Recent photos for this day ── */}
            <h4 className="pr-section-title" style={{ marginTop: '1.25rem' }}>
              Today&apos;s folder · {formatDate(photoDate)}
            </h4>
            {recentPhotos.length === 0 ? (
              <p className="activity-panel__hint">No photos stored for this day yet.</p>
            ) : (
              <div className="ppc-recent-grid">
                {recentPhotos.map((photo) => (
                  <article key={photo.id || photo._id} className="ppc-recent-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvePhotoUrl(photo.photoUrl || photo.photoPath)}
                      alt=""
                      loading="lazy"
                    />
                    <div>
                      <div>{formatDateTime(photo.createdAt)}</div>
                      <div>
                        {photo.facesDetected || 0} person(s)
                        {(photo.facesDetected || 0) === 0 ? ' · stored empty frame' : ''}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
