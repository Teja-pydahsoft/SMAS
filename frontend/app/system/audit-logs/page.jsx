'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import { formatDateTime } from '@/lib/formatDate';

const DENIAL_REASON_LABELS = {
  not_found: 'Face not recognised',
  face_mismatch: 'Face mismatch',
  already_in_division: 'Already inside division',
  active_in_other_division: 'Active in another division',
  department_still_active: 'Department not checked out',
  not_checked_in: 'No gate entry',
  no_gate_entry: 'No gate entry today',
  active_in_other_department: 'Active in another department',
  already_in_department: 'Already in department',
  not_in_department: 'Not in this department',
  too_soon_after_entry: 'Too soon after check-in',
  invalid_gate_config: 'Gate misconfiguration',
};

function reasonLabel(log) {
  if (log.accessGranted !== false) return null;
  return DENIAL_REASON_LABELS[log.denialReason] || log.denialReason || 'Denied';
}

function eventLabel(log) {
  if (log.eventType === 'entry') return log.scanType === 'department' ? 'Check-in' : 'Entry';
  if (log.eventType === 'exit') return log.scanType === 'department' ? 'Check-out' : 'Exit';
  return log.eventType || '—';
}

function accessPointLabel(log) {
  if (log.scanType === 'department') {
    return log.departmentId?.name ? `Dept · ${log.departmentId.name}` : 'Department';
  }
  return log.gateRefId?.name ? `Gate · ${log.gateRefId.name}` : 'Gate';
}

export default function AuditLogsPage() {
  const { can } = useAuth();
  const canView = can('system_users', 'read') || can('gate', 'read');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('all'); // all | granted | denied
  const [eventType, setEventType] = useState('');
  const [scanType, setScanType] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { successOnly: 'false', limit: 300 };
      if (status !== 'all') params.status = status;
      if (eventType) params.eventType = eventType;
      if (scanType) params.scanType = scanType;
      const data = await api.gate.logs(params);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [status, eventType, scanType]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const name = (log.holderName || '').toLowerCase();
      const code = (log.registrationId?.registrationCode || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [logs, search]);

  const deniedCount = useMemo(
    () => filteredLogs.filter((log) => log.accessGranted === false).length,
    [filteredLogs]
  );

  if (!canView) {
    return (
      <PageShell title="Audit Logs" description="Gate and department scan attempts">
        <p className="read-only-banner">You do not have access to audit logs.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Audit Logs"
      description="Every gate and department scan attempt — successful and rejected — per person"
    >
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: '180px', flex: '1 1 200px' }}>
            <label htmlFor="audit-search">Search person</label>
            <input
              id="audit-search"
              type="text"
              placeholder="Name or code (e.g. WF0089)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="audit-status">Result</label>
            <select id="audit-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All attempts</option>
              <option value="granted">Granted only</option>
              <option value="denied">Rejected only</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="audit-scan-type">Scan point</label>
            <select id="audit-scan-type" value={scanType} onChange={(e) => setScanType(e.target.value)}>
              <option value="">All</option>
              <option value="gate">Gate</option>
              <option value="department">Department</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="audit-event">Event</label>
            <select id="audit-event" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All</option>
              <option value="entry">Entry</option>
              <option value="exit">Exit</option>
            </select>
          </div>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="reports-section-header" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h3 className="section-title">
            Scan Attempts ({filteredLogs.length})
          </h3>
          <p className="section-desc">
            {deniedCount} rejected in this view. Rejected scans are kept so you can verify whether entries were really attempted.
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading audit logs…</p>
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state card">
          <p>No scan attempts match the current filters.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Person</th>
                  <th>Access Point</th>
                  <th>Division</th>
                  <th>Event</th>
                  <th>Result</th>
                  <th>Reason / Details</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const denied = log.accessGranted === false;
                  return (
                    <tr key={log._id} className={denied ? 'row-inactive' : undefined}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.createdAt)}</td>
                      <td className="name-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {log.holderPhotoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={log.holderPhotoUrl}
                              alt=""
                              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                            />
                          )}
                          <div>
                            <div>{log.holderName || 'Unknown person'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {log.registrationId?.registrationCode || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{accessPointLabel(log)}</td>
                      <td>{log.divisionId?.name || '—'}</td>
                      <td>{eventLabel(log)}</td>
                      <td>
                        <span className={`badge ${denied ? 'badge-danger' : 'badge-success'}`}>
                          {denied ? 'Rejected' : 'Granted'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>
                        {denied ? (
                          <>
                            <div>{reasonLabel(log)}</div>
                            {log.denialError && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {log.denialError}
                              </div>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{typeof log.matchScore === 'number' ? `${Math.round(log.matchScore * 100)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
