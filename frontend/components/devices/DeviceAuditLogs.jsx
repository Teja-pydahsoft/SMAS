'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/formatDate';

const ACTION_OPTIONS = [
  { value: '',                  label: 'All Actions' },
  { value: 'registered',        label: 'Registered' },
  { value: 'approved',          label: 'Approved' },
  { value: 'rejected',          label: 'Rejected' },
  { value: 'blocked',           label: 'Blocked' },
  { value: 'unblocked',         label: 'Unblocked' },
  { value: 'deleted',           label: 'Deleted' },
  { value: 'login_attempt',     label: 'Login Attempt' },
  { value: 'validation_failed', label: 'Validation Failed' },
  { value: 'settings_updated',  label: 'Settings Updated' },
];

const ACTION_LABELS = Object.fromEntries(
  ACTION_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

const DOT_VARIANT = {
  approved:         'success',
  unblocked:        'success',
  login_attempt:    'success',
  registered:       'info',
  settings_updated: 'info',
  rejected:         'danger',
  blocked:          'danger',
  deleted:          'danger',
  validation_failed:'warning',
};

function exportCsv(logs) {
  const header = ['Time', 'Device', 'Computer', 'Action', 'Performed By', 'IP', 'Note'];
  const rows = logs.map((l) => [
    formatDateTime(l.createdAt),
    l.deviceName,
    l.computerName,
    ACTION_LABELS[l.action] ?? l.action,
    l.performedByName || '',
    l.ipAddress || '',
    (l.note || '').replace(/,/g, ' '),
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'device-audit-logs.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function DeviceAuditLogs() {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [action,  setAction]  = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const debounceRef = useRef(null);

  const load = useCallback(async (params = {}) => {
    setLoading(true); setError('');
    try {
      const res = await api.devices.auditLogs({ page, limit: 50, action, ...params });
      setLogs(res.logs ?? []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="dm-audit">
      {/* Toolbar */}
      <div className="dm-toolbar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="dm-audit__total">{total} event{total !== 1 ? 's' : ''}</span>
          <select
            className="dm-toolbar__select"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            aria-label="Filter by action"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          className="btn-secondary btn-sm"
          onClick={() => exportCsv(logs)}
          disabled={logs.length === 0}
        >
          ↓ Export CSV
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading && logs.length === 0 ? (
        <div className="card" style={{ padding: '1.25rem' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="admin-skeleton__line" style={{ height: 18, marginBottom: 12 }} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state card"><p>No audit events found.</p></div>
      ) : (
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <ol className="dm-timeline dm-timeline--full">
            {logs.map((log, i) => (
              <li
                key={log.id}
                className={`dm-timeline__item${i === logs.length - 1 ? ' dm-timeline__item--last' : ''}`}
              >
                <span
                  className={`dm-timeline__dot dm-timeline__dot--${DOT_VARIANT[log.action] ?? 'info'}`}
                  aria-hidden
                />
                <div className="dm-timeline__content">
                  <div className="dm-timeline__event">
                    <strong>{ACTION_LABELS[log.action] ?? log.action}</strong>
                    {log.deviceName && (
                      <span className="dm-timeline__device"> — {log.deviceName}</span>
                    )}
                    {log.computerName && log.computerName !== log.deviceName && (
                      <span className="dm-timeline__device"> ({log.computerName})</span>
                    )}
                    {log.performedByName && (
                      <span className="dm-timeline__actor"> by {log.performedByName}</span>
                    )}
                  </div>
                  {log.note && <p className="dm-timeline__note">{log.note}</p>}
                  <div className="dm-timeline__meta-row">
                    <time className="dm-timeline__time">{formatDateTime(log.createdAt)}</time>
                    {log.ipAddress && (
                      <span className="dm-timeline__ip">IP: {log.ipAddress}</span>
                    )}
                    {log.fingerprint && log.fingerprint !== '0'.repeat(64) && (
                      <code className="dm-fingerprint" title={log.fingerprint}>
                        {log.fingerprint.slice(0, 12)}…
                      </code>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* Pagination */}
          {pages > 1 && (
            <div className="dm-pagination" style={{ marginTop: '1rem' }}>
              <span className="dm-pagination__info">Page {page} of {pages}</span>
              <div className="dm-pagination__btns">
                <button className="btn-secondary btn-sm" disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
                <button className="btn-secondary btn-sm" disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}>Next ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
