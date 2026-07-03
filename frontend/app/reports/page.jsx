'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import { formatDateTime } from '@/lib/formatDate';

export default function ReportsPage() {
  const [logs, setLogs] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [scanTypeFilter, setScanTypeFilter] = useState('');

  async function loadLogs() {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (eventFilter) params.eventType = eventFilter;
      if (divisionFilter) params.divisionId = divisionFilter;
      if (scanTypeFilter) params.scanType = scanTypeFilter;
      setLogs(await api.gate.logs(params));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.divisions.list().then(setDivisions).catch(() => {});
  }, []);

  useEffect(() => {
    loadLogs();
  }, [eventFilter, divisionFilter, scanTypeFilter]);

  return (
    <PageShell
      title="Reports"
      description="Gate and department access activity logs"
    >
      <div className="card">
        <div className="reports-section-header">
          <div>
            <h3 className="section-title">Access Activity Logs</h3>
            <p className="section-desc">Division gate and department check-in/out scans</p>
          </div>
          <div className="reports-section-actions">
            <select
              value={scanTypeFilter}
              onChange={(e) => setScanTypeFilter(e.target.value)}
              aria-label="Filter by scan type"
            >
              <option value="">All scan types</option>
              <option value="gate">Division gate</option>
              <option value="department">Department</option>
            </select>
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              aria-label="Filter by division"
            >
              <option value="">All divisions</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="Filter by event type"
            >
              <option value="">All events</option>
              <option value="entry">Entry only</option>
              <option value="exit">Exit only</option>
            </select>
            <button type="button" className="btn-secondary" onClick={loadLogs} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        {loading && logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading gate logs...</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No gate activity yet.</p>
        ) : (
          <div className="reports-log-list">
            {logs.map((log) => (
              <div key={log._id} className="log-item">
                <div className="reports-log-item__header">
                  <span className={`badge ${log.matched ? 'badge-success' : 'badge-danger'}`}>
                    {log.scanType === 'department' ? 'dept' : 'gate'} · {log.eventType}
                  </span>
                  <span className="reports-log-item__time">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="reports-log-item__status">
                  {log.matched
                    ? `Matched (${(log.matchScore * 100).toFixed(1)}%)`
                    : 'Person not found'}
                </p>
                {log.divisionId?.name && (
                  <p className="reports-log-item__meta">Division: {log.divisionId.name}</p>
                )}
                {log.gateRefId?.name && (
                  <p className="reports-log-item__meta">Gate: {log.gateRefId.name}</p>
                )}
                {log.departmentId?.name && (
                  <p className="reports-log-item__meta">Department: {log.departmentId.name}</p>
                )}
                {log.registrationId?.registrationCode && (
                  <p className="reports-log-item__meta">
                    Code: {log.registrationId.registrationCode}
                  </p>
                )}
                {log.roleId?.name && (
                  <p className="reports-log-item__meta">Role: {log.roleId.name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
