'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import RegistrationReportModal from '@/components/RegistrationReportModal';
import { formatDateTime } from '@/lib/formatDate';

// ── Daily Pass by Role ────────────────────────────────────────────────────────

function StatusDot({ inside }) {
  return (
    <span
      className={`daily-pass-dot ${inside ? 'daily-pass-dot--inside' : 'daily-pass-dot--outside'}`}
      aria-hidden="true"
    />
  );
}

function DailyPassRow({ person, onViewReport }) {
  return (
    <tr
      className={`reports-table__row ${person.divisionInside ? 'daily-pass-row--inside' : ''}`}
      onClick={() => onViewReport(person.registrationId)}
      tabIndex={0}
      role="button"
      aria-label={`View report for ${person.displayName || 'Unnamed'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewReport(person.registrationId);
        }
      }}
    >
      <td className="reports-table__person-cell">
        <div className="reports-table__person">
          <StatusDot inside={person.divisionInside} />
          {person.photoUrl ? (
            <img src={person.photoUrl} alt="" className="reports-table__avatar" />
          ) : (
            <div className="reports-table__avatar reports-table__avatar--placeholder">
              {(person.displayName || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="reports-table__name">{person.displayName || 'Unnamed'}</span>
        </div>
      </td>
      <td className="reports-table__meta-cell">
        <span className="reports-table__code">{person.registrationCode}</span>
      </td>
      <td>
        {person.divisionInside ? (
          <span className="badge badge-success">
            Inside {person.divisionName || 'division'}
          </span>
        ) : person.hadActivityToday ? (
          <span className="badge badge-info">Checked out</span>
        ) : (
          <span className="badge" style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}>
            Not in
          </span>
        )}
        {person.currentDepartmentName && (
          <span className="badge badge-warning" style={{ marginLeft: '0.35rem' }}>
            {person.currentDepartmentName}
          </span>
        )}
      </td>
      <td className="reports-table__time">
        {person.gateEntryAt ? formatDateTime(person.gateEntryAt) : '—'}
      </td>
      <td className="reports-table__time">
        {person.gateExitAt ? (
          formatDateTime(person.gateExitAt)
        ) : person.divisionInside ? (
          <span style={{ color: 'var(--warning)', fontSize: '0.8rem' }}>Active</span>
        ) : (
          '—'
        )}
      </td>
      <td>
        {person.shiftName ? (
          <span className="badge badge-info">{person.shiftName}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
        )}
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
  );
}

function DailyPassRoleCard({ roleGroup, onViewReport, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="daily-pass-role-card card">
      {/* Role header — click to expand/collapse */}
      <button
        type="button"
        className="daily-pass-role-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="daily-pass-role-header__left">
          <span className="daily-pass-role-header__name">{roleGroup.roleName}</span>
          {roleGroup.isShiftBased && (
            <span className="badge badge-info daily-pass-role-header__shift-badge">Shift Based</span>
          )}
        </div>
        <div className="daily-pass-role-header__stats">
          <span className="daily-pass-stat daily-pass-stat--inside">
            <StatusDot inside={true} />
            {roleGroup.insideCount} inside
          </span>
          <span className="daily-pass-stat daily-pass-stat--active">
            {roleGroup.activeCount} active today
          </span>
          <span className="daily-pass-stat">
            {roleGroup.totalPeople} total
          </span>
          <svg
            className={`daily-pass-role-header__chevron ${open ? 'daily-pass-role-header__chevron--open' : ''}`}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="daily-pass-role-body">
          {roleGroup.people.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '0.75rem 0', fontSize: '0.875rem' }}>
              No verified people in this role.
            </p>
          ) : (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>In Time</th>
                    <th>Out Time</th>
                    <th>Shift</th>
                    <th aria-label="View"></th>
                  </tr>
                </thead>
                <tbody>
                  {roleGroup.people.map((person) => (
                    <DailyPassRow
                      key={person.registrationId}
                      person={person}
                      onViewReport={onViewReport}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DailyPassTab({ onViewReport }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

  async function load() {
    try {
      const result = await api.reports.dailyPasses();
      setData(result);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 30 s so inside/outside status stays current
    intervalRef.current = setInterval(load, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading daily pass report...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">Daily Pass — by Role</h3>
          <p className="section-desc">
            Today&apos;s gate activity for every role — {data?.date || ''}. Refreshes every 30 s.
          </p>
        </div>
        <div className="reports-section-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setLoading(true); load(); }}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!error && (!data?.roles || data.roles.length === 0) && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No verified roles with registered people found.
        </div>
      )}

      {(data?.roles || []).map((roleGroup, idx) => (
        <DailyPassRoleCard
          key={roleGroup.roleId}
          roleGroup={roleGroup}
          onViewReport={onViewReport}
          defaultOpen={idx === 0}
        />
      ))}
    </div>
  );
}

// ── Registered People tab (existing) ─────────────────────────────────────────

function PeopleTab({ onViewReport }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function loadPeople(q = search) {
    setLoading(true);
    setError('');
    try {
      setPeople(await api.reports.listRegistrations({ search: q, limit: 200 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadPeople(search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  return (
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadPeople()}
            disabled={loading}
          >
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
                  onClick={() => onViewReport(person.registrationId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`View report for ${person.displayName || 'Unnamed'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onViewReport(person.registrationId);
                    }
                  }}
                >
                  <td className="reports-table__person-cell">
                    <div className="reports-table__person">
                      {person.photoUrl ? (
                        <img src={person.photoUrl} alt="" className="reports-table__avatar" />
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'daily', label: 'Daily Pass by Role' },
  { id: 'people', label: 'Registered People' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState('daily');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState(null);

  return (
    <PageShell
      title="Reports"
      description="Daily pass status by role and registered people access history"
    >
      {/* Tab nav */}
      <div className="sub-nav" style={{ marginBottom: '1.25rem' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sub-nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <DailyPassTab onViewReport={setSelectedRegistrationId} />
      )}
      {tab === 'people' && (
        <PeopleTab onViewReport={setSelectedRegistrationId} />
      )}

      <RegistrationReportModal
        registrationId={selectedRegistrationId}
        onClose={() => setSelectedRegistrationId(null)}
      />
    </PageShell>
  );
}
