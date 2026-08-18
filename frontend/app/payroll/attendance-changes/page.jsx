'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime, todayDateStringIst } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import SearchableSelect from '@/components/SearchableSelect';

function Avatar({ url, name, size = 42 }) {
  const src = resolvePhotoUrl(url);
  const initials = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Employee'}
        style={{ width: size, height: size, borderRadius: '999px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-secondary)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}

function statusLabel(value) {
  return value && value !== 'AUTO' ? value : 'Auto';
}

export default function AttendanceChangeHistoryPage() {
  const { can } = useAuth();
  const canRead = can('payroll_rate_master', 'read');
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState('');
  const [dateFrom, setDateFrom] = useState(todayDateStringIst());
  const [dateTo, setDateTo] = useState(todayDateStringIst());
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const loadRows = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.payroll.getAttendanceChangeHistory({
        search,
        batch,
        dateFrom,
        dateTo,
        limit: 300,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load attendance change history.');
    } finally {
      setLoading(false);
    }
  }, [canRead, search, batch, dateFrom, dateTo]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const employees = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = row.registrationId || `${row.registrationCode}::${row.employeeName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          registrationId: row.registrationId || null,
          employeeName: row.employeeName,
          registrationCode: row.registrationCode,
          photoPath: row.photoPath,
          edits: [],
          changedBySet: new Set(),
        });
      }
      const entry = map.get(key);
      entry.edits.push(row);
      if (row.changedByName) entry.changedBySet.add(row.changedByName);
    }
    return [...map.values()]
      .map((entry) => ({
        ...entry,
        totalEdits: entry.edits.length,
        changedByCount: entry.changedBySet.size,
        lastChangedAt: entry.edits.reduce((latest, edit) => {
          const at = new Date(edit.createdAt || 0).getTime();
          return at > latest ? at : latest;
        }, 0),
        edits: entry.edits.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
      }))
      .sort((a, b) => b.totalEdits - a.totalEdits || b.lastChangedAt - a.lastChangedAt);
  }, [rows]);
  const visibleEdits = useMemo(
    () => employees.reduce((sum, employee) => sum + (employee.totalEdits || 0), 0),
    [employees]
  );
  const activeFilterCount = [search, dateFrom, dateTo]
    .filter((value) => String(value || '').trim() !== '')
    .length;
  const uniqueBatches = useMemo(
    () => [...new Set(rows.map((row) => row.batchName || '-'))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const effectiveActiveFilterCount = activeFilterCount + (batch ? 1 : 0);

  if (!canRead) {
    return (
      <PageShell title="Attendance Change History" description="Track manual attendance overrides used in payroll calculation">
        <p className="read-only-banner">You do not have access to this page.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Attendance Change History"
      description="See who changed attendance, for which employee, and what payroll status was overridden."
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {error && <div className="error-msg" style={{ marginBottom: '0.5rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1 1 280px' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Search</label>
            <input
              type="search"
              className="form-input"
              placeholder="Employee name, code, date, changed by..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ minWidth: '170px' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Batch</label>
            <SearchableSelect
              options={uniqueBatches}
              value={batch || ''}
              onChange={(value) => setBatch(value || '')}
              placeholder="All Batches"
              emptyValue=""
              className="form-input"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>From</label>
            <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>To</label>
            <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button type="button" className="btn-secondary" onClick={loadRows} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div style={{ padding: '0.25rem 0.1rem 0.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>
            Showing {employees.length} people • {visibleEdits} edits
          </span>
          {effectiveActiveFilterCount > 0 && (
            <span className="badge badge-info">{effectiveActiveFilterCount} active filter{effectiveActiveFilterCount > 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
          <table className="rc-table" style={{ width: '100%', minWidth: '900px', margin: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--surface-base)' }}>
              <tr>
                <th>Employee</th>
                <th>Batch</th>
                <th>Total Edits</th>
                <th>Editors</th>
                <th>Last Changed</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {loading ? 'Loading attendance changes...' : 'No attendance change history found for the selected filters.'}
                  </td>
                </tr>
              ) : employees.map((employee) => (
                <tr key={employee.key}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: '240px' }}>
                      <Avatar url={employee.photoPath} name={employee.employeeName} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{employee.employeeName}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{employee.registrationCode}</div>
                      </div>
                    </div>
                  </td>
                  <td>{employee.edits[0]?.batchName || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{employee.totalEdits}</td>
                  <td>{employee.changedByCount}</td>
                  <td>{employee.lastChangedAt ? formatDateTime(employee.lastChangedAt) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedEmployee(employee)}>
                      View Edits
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {mounted && selectedEmployee && createPortal(
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="dialog-content card" style={{ width: '96vw', maxWidth: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
            <div className="dialog-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <Avatar url={selectedEmployee.photoPath} name={selectedEmployee.employeeName} size={48} />
                <div>
                  <h3 style={{ margin: 0 }}>{selectedEmployee.employeeName}</h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {selectedEmployee.registrationCode} • {selectedEmployee.totalEdits} edit(s) in selected range
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedEmployee(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem', overflowY: 'auto' }}>
              <table className="rc-table" style={{ width: '100%', minWidth: '920px', margin: 0 }}>
                <thead>
                  <tr>
                    <th>Work Date</th>
                    <th>Change</th>
                    <th>Notes</th>
                    <th>Changed By</th>
                    <th>Changed At</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEmployee.edits.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{formatDate(row.date)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span><strong>{statusLabel(row.previousStatus)}</strong> to <strong>{statusLabel(row.nextStatus)}</strong></span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {row.source === 'current'
                              ? 'Current override snapshot'
                              : row.action === 'clear'
                                ? 'Manual override cleared'
                                : 'Manual override saved'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {row.previousNote ? <span style={{ color: 'var(--text-muted)' }}>Before: {row.previousNote}</span> : <span style={{ color: 'var(--text-muted)' }}>Before: -</span>}
                          {row.nextNote ? <span>After: {row.nextNote}</span> : <span>After: -</span>}
                        </div>
                      </td>
                      <td>{row.changedByName}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageShell>
  );
}
