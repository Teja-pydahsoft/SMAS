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
          <div className="reports-people-list">
            {people.map((person) => (
              <button
                key={person.registrationId}
                type="button"
                className="reports-person-card"
                onClick={() => setSelectedRegistrationId(person.registrationId)}
              >
                <div className="reports-person-card__photo-wrap">
                  {person.photoUrl ? (
                    <img src={person.photoUrl} alt="" className="reports-person-card__photo" />
                  ) : (
                    <div className="reports-person-card__photo reports-person-card__photo--placeholder">
                      No Photo
                    </div>
                  )}
                </div>
                <div className="reports-person-card__body">
                  <p className="reports-person-card__name">{person.displayName || 'Unnamed'}</p>
                  <p className="reports-person-card__meta">{person.roleName}</p>
                  <p className="reports-person-card__code">{person.registrationCode}</p>
                  <div className="reports-person-card__stats">
                    <span className="badge badge-info">{person.totalScans} scans</span>
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
                  {person.lastScanAt && (
                    <p className="reports-person-card__time">
                      Last activity: {formatDateTime(person.lastScanAt)}
                    </p>
                  )}
                </div>
              </button>
            ))}
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
