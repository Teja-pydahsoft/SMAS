'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import {
  downloadLabourAssignmentExcel,
  downloadLabourAssignmentPdf,
} from '@/lib/projectLabourExport';

const TABS = [
  { id: 'overview', label: 'Overview', section: 'overview' },
  { id: 'attendance', label: 'Attendance History', section: 'attendance' },
  { id: 'gate', label: 'Gate Activity', section: 'gate' },
  { id: 'faces', label: 'Face Capture Records', section: 'faces' },
  { id: 'assignment', label: 'Project Assignment', section: 'assignment' },
];

function Avatar({ url, name, size = 52 }) {
  const [err, setErr] = useState(false);
  const initial = (name || 'U').charAt(0).toUpperCase();
  if (url && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvePhotoUrl(url)}
        alt=""
        className="pr-avatar"
        style={{ width: size, height: size }}
        loading="lazy"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="pr-avatar pr-avatar--initials" style={{ width: size, height: size }}>
      {initial}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="pr-labour-modal__skeletons">
      <div className="pr-skeleton" />
      <div className="pr-skeleton" />
      <div className="pr-skeleton" />
    </div>
  );
}

export default function LabourReportModal({
  assignmentId,
  onClose,
  generatedBy,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [header, setHeader] = useState(null);
  const [cache, setCache] = useState({});
  const cacheRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);

  const loadSection = useCallback(async (tabId, { force = false } = {}) => {
    if (!assignmentId) return;
    const tab = TABS.find((t) => t.id === tabId) || TABS[0];
    if (!force && cacheRef.current[tabId]) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.projectReports.labourByAssignment(assignmentId, {
        section: tab.section,
      });
      if (data.header) setHeader(data.header);
      cacheRef.current = { ...cacheRef.current, [tabId]: data };
      setCache(cacheRef.current);
    } catch (e) {
      setError(e.message || 'Failed to load labour report');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    cacheRef.current = {};
    setCache({});
    setHeader(null);
    setActiveTab('overview');
    if (assignmentId) loadSection('overview', { force: true });
  }, [assignmentId, loadSection]);

  useEffect(() => {
    if (!assignmentId) return;
    loadSection(activeTab);
  }, [activeTab, assignmentId, loadSection]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleExport(format) {
    if (!assignmentId) return;
    setExporting(true);
    setError('');
    try {
      const payload =
        format === 'excel'
          ? await api.projectReports.labourExcel(assignmentId)
          : await api.projectReports.labourPdf(assignmentId);
      if (format === 'excel') {
        await downloadLabourAssignmentExcel(payload, { generatedBy });
      } else {
        await downloadLabourAssignmentPdf(payload, { generatedBy });
      }
    } catch (e) {
      setError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (!assignmentId) return null;

  const labour = header?.labour;
  const project = header?.project;
  const tabData = cache[activeTab] || {};

  return (
    <div className="pr-labour-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="pr-labour-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Labour project report"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pr-labour-modal__header">
          <div className="pr-labour-modal__identity">
            <Avatar url={labour?.photoUrl} name={labour?.labourName} size={56} />
            <div className="pr-labour-modal__identity-text">
              <h2>{labour?.labourName || 'Labour Report'}</h2>
              <div className="pr-labour-modal__meta">
                <span>{labour?.registrationCode || '—'}</span>
                <span>{project?.projectName || '—'}</span>
                <span>{header?.departmentName || project?.department?.name || '—'}</span>
                <span>{header?.divisionName || project?.division?.name || '—'}</span>
                <span className="pr-labour-modal__status">{header?.currentStatus || '—'}</span>
              </div>
            </div>
          </div>
          <div className="pr-labour-modal__actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={exporting}
              onClick={() => handleExport('excel')}
            >
              {exporting ? 'Preparing…' : 'Download Excel'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={exporting}
              onClick={() => handleExport('pdf')}
            >
              Download PDF
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <nav className="pr-labour-modal__tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`pr-labour-modal__tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pr-labour-modal__body">
          {error && <div className="pr-error">{error}</div>}
          {loading && !tabData.header && !tabData.overview && !tabData.attendanceHistory ? (
            <Skeleton />
          ) : null}

          {activeTab === 'overview' && tabData.overview && (
            <div className="pr-labour-modal__section">
              <div className="pr-kpi-grid">
                <div className="pr-kpi">
                  <div className="pr-kpi__label">Days Worked</div>
                  <div className="pr-kpi__value">{tabData.summary?.daysWorked ?? '—'}</div>
                </div>
                <div className="pr-kpi">
                  <div className="pr-kpi__label">Attendance %</div>
                  <div className="pr-kpi__value">
                    {tabData.summary?.attendancePercentage != null
                      ? `${tabData.summary.attendancePercentage}%`
                      : '—'}
                  </div>
                </div>
                <div className="pr-kpi">
                  <div className="pr-kpi__label">Total Hours</div>
                  <div className="pr-kpi__value">{tabData.summary?.totalWorkedHours ?? '—'}</div>
                </div>
                <div className="pr-kpi">
                  <div className="pr-kpi__label">Assignment Period</div>
                  <div className="pr-kpi__value" style={{ fontSize: '0.95rem' }}>
                    {tabData.summary?.periodFrom || '—'} →{' '}
                    {tabData.overview.assignment?.removedAt
                      ? tabData.summary?.periodTo
                      : 'Present'}
                  </div>
                </div>
              </div>
              <p className="pr-section-desc">
                All records below are limited to this labourer's assignment on{' '}
                <strong>{project?.projectName}</strong> only.
              </p>
              <h4 className="pr-section-title">Recent Attendance</h4>
              {(tabData.overview.recentAttendance || []).length === 0 ? (
                <div className="pr-empty">No attendance during assignment period.</div>
              ) : (
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.overview.recentAttendance.map((r) => (
                        <tr key={r.date}>
                          <td>{formatDate(r.date)}</td>
                          <td>{r.entryTime ? formatDateTime(r.entryTime) : '—'}</td>
                          <td>{r.exitTime ? formatDateTime(r.exitTime) : '—'}</td>
                          <td>{r.workedHours ?? '—'}</td>
                          <td>{r.attendanceStatus || r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="pr-labour-modal__section">
              {loading && !tabData.attendanceHistory ? (
                <Skeleton />
              ) : !(tabData.attendanceHistory || []).length ? (
                <div className="pr-empty">No attendance during the assignment period.</div>
              ) : (
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry Time</th>
                        <th>Exit Time</th>
                        <th>Worked Hours</th>
                        <th>Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.attendanceHistory.map((r) => (
                        <tr key={r.date}>
                          <td>{formatDate(r.date)}</td>
                          <td>{r.entryTime ? formatDateTime(r.entryTime) : '—'}</td>
                          <td>{r.exitTime ? formatDateTime(r.exitTime) : '—'}</td>
                          <td>{r.workedHours ?? '—'}</td>
                          <td>{r.attendanceStatus || r.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gate' && (
            <div className="pr-labour-modal__section">
              {loading && !tabData.gateActivity ? (
                <Skeleton />
              ) : !(tabData.gateActivity || []).length ? (
                <div className="pr-empty">No gate activity during the assignment period.</div>
              ) : (
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Gate</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>Operator</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.gateActivity.map((r) => (
                        <tr key={r.date}>
                          <td>{formatDate(r.date)}</td>
                          <td>{r.gate || '—'}</td>
                          <td>{r.entry ? formatDateTime(r.entry) : '—'}</td>
                          <td>{r.exit ? formatDateTime(r.exit) : '—'}</td>
                          <td>{r.operator || '—'}</td>
                          <td>{r.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'faces' && (
            <div className="pr-labour-modal__section">
              {loading && !tabData.faceCaptureRecords ? (
                <Skeleton />
              ) : !(tabData.faceCaptureRecords || []).length ? (
                <div className="pr-empty">No face captures during the assignment period.</div>
              ) : (
                <div className="pr-face-grid">
                  {tabData.faceCaptureRecords.map((r) => (
                    <article key={r.id} className="pr-face-card">
                      <div className="pr-face-card__shots">
                        {[
                          { label: 'Registered', url: r.registeredPhotoUrl },
                          { label: 'Entry', url: r.entryCapture?.photoUrl },
                          { label: 'Exit', url: r.exitCapture?.photoUrl },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            className="pr-face-thumb"
                            onClick={() =>
                              p.url &&
                              setLightbox({
                                url: p.url,
                                title: `${labour?.labourName || 'Labour'} · ${p.label}`,
                                sub: r.date,
                              })
                            }
                          >
                            {p.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolvePhotoUrl(p.url)} alt="" loading="lazy" />
                            ) : (
                              <div className="pr-face-placeholder">No photo</div>
                            )}
                            <span>{p.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="pr-face-card__body">
                        <div>
                          <strong>{formatDate(r.date)}</strong>
                        </div>
                        <div>Capture: {r.captureTime ? formatDateTime(r.captureTime) : '—'}</div>
                        <div>Status: {r.verificationStatus || '—'}</div>
                        <div>Camera: {r.camera || '—'}</div>
                        <div>
                          Score:{' '}
                          {r.similarityScore != null ? Number(r.similarityScore).toFixed(2) : '—'}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'assignment' && (
            <div className="pr-labour-modal__section">
              {loading && !tabData.projectAssignment ? (
                <Skeleton />
              ) : !tabData.projectAssignment ? (
                <div className="pr-empty">No assignment details.</div>
              ) : (
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <tbody>
                      <tr>
                        <th>Assigned Date</th>
                        <td>{formatDate(tabData.projectAssignment.assignedAt)}</td>
                      </tr>
                      <tr>
                        <th>Assigned By</th>
                        <td>{tabData.projectAssignment.assignedBy || '—'}</td>
                      </tr>
                      <tr>
                        <th>Project Name</th>
                        <td>{tabData.projectAssignment.projectName || '—'}</td>
                      </tr>
                      <tr>
                        <th>Department</th>
                        <td>{tabData.projectAssignment.departmentName || '—'}</td>
                      </tr>
                      <tr>
                        <th>Division</th>
                        <td>{tabData.projectAssignment.divisionName || '—'}</td>
                      </tr>
                      <tr>
                        <th>Period</th>
                        <td>
                          {tabData.projectAssignment.periodFrom} →{' '}
                          {tabData.projectAssignment.removedAt
                            ? tabData.projectAssignment.periodTo
                            : 'Present'}
                        </td>
                      </tr>
                      <tr>
                        <th>Current Assignment Status</th>
                        <td>{tabData.projectAssignment.status}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="pr-lightbox" onClick={() => setLightbox(null)}>
          <div className="pr-lightbox__inner" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <strong>{lightbox.title}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {lightbox.sub ? formatDate(lightbox.sub) : ''}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setLightbox(null)}>
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvePhotoUrl(lightbox.url)} alt="" className="pr-lightbox__img" />
          </div>
        </div>
      )}
    </div>
  );
}
