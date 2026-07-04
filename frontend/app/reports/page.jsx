'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import RegistrationReportModal from '@/components/RegistrationReportModal';
import { formatDateTime } from '@/lib/formatDate';

export default function ReportsPage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState(null);

  async function loadPeople() {
    setLoading(true);
    setError('');
    try {
      setPeople(await api.reports.listRegistrations({ search, limit: 200 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPeople();
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <PageShell
      title="Reports"
      description="Registered people with gate and department access history"
    >
      <div className="card">
        <div className="reports-section-header">
          <div>
            <h3 className="section-title">Registered People</h3>
            <p className="section-desc">
              Select a person to view details, today&apos;s active entries, and date-wise history
            </p>
          </div>
          <div className="reports-section-actions">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, role..."
              aria-label="Search registered people"
              className="reports-search-input"
            />
            <button type="button" className="btn-secondary" onClick={loadPeople} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        {loading && people.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading registered people...</p>
        ) : people.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No registered people with access activity yet.</p>
        ) : (
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role / Code</th>
                  <th>Status</th>
                  <th>Scans</th>
                  <th>Last Activity</th>
                  <th aria-label="View"></th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr
                    key={person.registrationId}
                    className="reports-table__row"
                    onClick={() => setSelectedRegistrationId(person.registrationId)}
                    tabIndex={0}
                    role="button"
                    aria-label={`View report for ${person.displayName || 'Unnamed'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedRegistrationId(person.registrationId);
                      }
                    }}
                  >
                    <td className="reports-table__person-cell">
                      <div className="reports-table__person">
                        {person.photoUrl ? (
                          <img
                            src={person.photoUrl}
                            alt=""
                            className="reports-table__avatar"
                          />
                        ) : (
                          <div className="reports-table__avatar reports-table__avatar--placeholder">
                            {(person.displayName || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="reports-table__name">{person.displayName || 'Unnamed'}</span>
                      </div>
                    </td>
                    <td className="reports-table__meta-cell">
                      <span className="reports-table__role">{person.roleName || '—'}</span>
                      <span className="reports-table__code">{person.registrationCode}</span>
                    </td>
                    <td>
                      <div className="reports-table__badges">
                        {person.divisionInside ? (
                          <span className="badge badge-success">
                            Inside {person.activeDivisionName || 'division'}
                          </span>
                        ) : (
                          <span className="badge badge-info">Outside</span>
                        )}
                        {person.currentDepartmentName && (
                          <span className="badge badge-warning">{person.currentDepartmentName}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">{person.totalScans} scans</span>
                    </td>
                    <td className="reports-table__time">
                      {person.lastScanAt ? formatDateTime(person.lastScanAt) : '—'}
                    </td>
                    <td className="reports-table__action-cell">
                      <span className="reports-table__view-btn" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RegistrationReportModal
        registrationId={selectedRegistrationId}
        onClose={() => setSelectedRegistrationId(null)}
      />
    </PageShell>
  );
}
