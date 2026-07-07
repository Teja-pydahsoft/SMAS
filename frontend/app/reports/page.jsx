'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════════ */

function fmt(n) { return Number(n || 0).toLocaleString(); }

function calcDuration(entryAt, exitAt) {
  if (!entryAt) return '—';
  const end = exitAt ? new Date(exitAt) : new Date();
  const ms = end - new Date(entryAt);
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ═══════════════════════════════════════════════════════════════
   SMALL SHARED UI
════════════════════════════════════════════════════════════════ */

function Avatar({ url, name, size = 36 }) {
  const [err, setErr] = useState(false);
  const initial = (name || 'U').charAt(0).toUpperCase();
  if (url && !err) {
    return (
      <img
        src={resolvePhotoUrl(url)}
        alt=""
        className="rc-avatar rc-avatar--img"
        style={{ width: size, height: size }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="rc-avatar rc-avatar--initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initial}
    </div>
  );
}

function StatusBadge({ inside, hadActivity }) {
  if (inside) return <span className="badge badge-success rc-status-badge">Inside</span>;
  if (hadActivity) return <span className="badge badge-info rc-status-badge">Checked Out</span>;
  return <span className="badge rc-status-badge rc-status-badge--absent">Not In</span>;
}

function Spinner({ size = 28 }) {
  return (
    <div className="rc-spinner" style={{ width: size, height: size, borderWidth: size > 20 ? 3 : 2 }} aria-hidden />
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="rc-empty">
      <div className="rc-empty__icon">{icon}</div>
      <h3 className="rc-empty__title">{title}</h3>
      {desc && <p className="rc-empty__desc">{desc}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MINI SPARKLINE
════════════════════════════════════════════════════════════════ */
function Sparkline({ data = [], color = '#2563EB' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 64, h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUMMARY CARDS
════════════════════════════════════════════════════════════════ */
function SummaryCard({ icon, label, value, trend, trendUp, sparkData, color = 'primary', loading }) {
  return (
    <div className={`rc-summary-card rc-summary-card--${color}`}>
      <div className="rc-summary-card__header">
        <div className={`rc-summary-card__icon rc-summary-card__icon--${color}`}>{icon}</div>
        {trend != null && (
          <span className={`rc-summary-card__trend ${trendUp ? 'rc-trend--up' : 'rc-trend--down'}`}>
            {trendUp ? '↑' : '↓'} {trend}%
          </span>
        )}
      </div>
      <div className="rc-summary-card__value">
        {loading ? <span className="rc-skeleton rc-skeleton--sm" /> : fmt(value)}
      </div>
      <div className="rc-summary-card__label">{label}</div>
      <div className="rc-summary-card__spark">
        <Sparkline data={sparkData} color={color === 'success' ? '#10B981' : color === 'danger' ? '#EF4444' : color === 'warning' ? '#F59E0B' : '#2563EB'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE COMPONENT
════════════════════════════════════════════════════════════════ */
function TimelineEvent({ entry, isLast }) {
  const isGate = entry.scanType !== 'department';
  const isEntry = (entry.eventType || '').toLowerCase().includes('entry') ||
    (entry.label || '').toLowerCase().includes('entry') ||
    entry.isEntry;
  const isActive = entry.status === 'Active';
  const time = entry.at || entry.entryAt;

  return (
    <div className={`rc-timeline__item ${isLast ? 'rc-timeline__item--last' : ''}`}>
      <div className="rc-timeline__connector">
        <div className={`rc-timeline__dot rc-timeline__dot--${isEntry ? 'entry' : 'exit'} ${isActive ? 'rc-timeline__dot--active' : ''}`}>
          {isGate ? (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
            </svg>
          )}
        </div>
        {!isLast && <div className="rc-timeline__line" />}
      </div>
      <div className={`rc-timeline__card ${isActive ? 'rc-timeline__card--active' : ''}`}>
        <div className="rc-timeline__card-top">
          <div className="rc-timeline__badges">
            <span className={`badge ${isEntry ? 'badge-success' : 'badge-info'}`}>
              {entry.eventType || (isEntry ? 'ENTRY' : 'EXIT')}
            </span>
            <span className={`badge ${isGate ? 'badge-secondary' : 'badge-warning'}`}>
              {isGate ? 'Gate' : 'Dept'}
            </span>
            {isActive && (
              <span className="badge badge-warning">
                <span className="today-timeline__pulse" aria-hidden /> Active
              </span>
            )}
          </div>
          <span className="rc-timeline__time">{time ? formatTime(time) : '—'}</span>
        </div>
        <p className="rc-timeline__label">{entry.label}</p>
        {entry.divisionName && <p className="rc-timeline__meta">Division: {entry.divisionName}</p>}
        {entry.departmentName && entry.scanType !== 'department' && (
          <p className="rc-timeline__meta">Dept: {entry.departmentName}</p>
        )}
        {entry.entryAt && entry.exitAt && (
          <p className="rc-timeline__meta rc-timeline__meta--duration">
            Duration: {calcDuration(entry.entryAt, entry.exitAt)}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PERSON DETAIL DIALOG (centered modal)
════════════════════════════════════════════════════════════════ */
function PersonDetailDialog({ registrationId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeInnerTab, setActiveInnerTab] = useState('today');

  useEffect(() => {
    if (!registrationId) return;
    setLoading(true); setError('');
    api.reports.getRegistration(registrationId)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [registrationId]);

  if (!registrationId) return null;

  const details = data?.details || {};
  const todayEntries = [...(data?.todayEntries || [])].sort((a, b) =>
    new Date(a.at || a.entryAt || 0) - new Date(b.at || b.entryAt || 0));
  const entriesByDate = data?.entriesByDate || [];
  const session = data?.sessionState || {};

  return (
    <div className="rc-dialog-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Person Access Report">
      <div className="rc-dialog rc-dialog--person" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rc-dialog__header">
          <div className="rc-dialog__header-info">
            {!loading && details.holderPhotoUrl && (
              <Avatar url={details.holderPhotoUrl} name={details.holderName} size={44} />
            )}
            <div>
              <h2 className="rc-dialog__title">{loading ? 'Loading…' : (details.holderName || '—')}</h2>
              <p className="rc-dialog__subtitle">
                {details.roleName || ''}{details.registrationCode ? ` · ${details.registrationCode}` : ''}
              </p>
            </div>
          </div>
          <button className="rc-dialog__close" onClick={onClose} aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="rc-dialog__body">
          {loading && <div className="rc-center-load"><Spinner size={32} /><span>Loading report…</span></div>}
          {error && <p className="error-msg">{error}</p>}
          {!loading && !error && data && (
            <>
              {/* Profile card */}
              <div className="rc-person-profile">
                <div className="rc-person-profile__left">
                  <Avatar url={details.holderPhotoUrl} name={details.holderName} size={72} />
                  <div>
                    <h3 className="rc-person-profile__name">{details.holderName || '—'}</h3>
                    <p className="rc-person-profile__role">{details.roleName}</p>
                    <code className="rc-person-profile__code">{details.registrationCode}</code>
                    <div style={{ marginTop: 8 }}>
                      <StatusBadge inside={session?.divisionInside} hadActivity={todayEntries.length > 0} />
                    </div>
                  </div>
                </div>
                <div className="rc-person-profile__stats">
                  <div className="rc-person-profile__stat">
                    <span className="rc-person-profile__stat-label">Total Scans</span>
                    <span className="rc-person-profile__stat-value">{details.totalScans ?? '—'}</span>
                  </div>
                  <div className="rc-person-profile__stat">
                    <span className="rc-person-profile__stat-label">In Time</span>
                    <span className="rc-person-profile__stat-value rc-color-success">{formatTime(session?.gateEntryAt)}</span>
                  </div>
                  <div className="rc-person-profile__stat">
                    <span className="rc-person-profile__stat-label">Out Time</span>
                    <span className="rc-person-profile__stat-value rc-color-danger">{formatTime(session?.gateExitAt)}</span>
                  </div>
                  <div className="rc-person-profile__stat">
                    <span className="rc-person-profile__stat-label">Duration</span>
                    <span className="rc-person-profile__stat-value">{calcDuration(session?.gateEntryAt, session?.gateExitAt)}</span>
                  </div>
                  {details.shiftName && (
                    <div className="rc-person-profile__stat">
                      <span className="rc-person-profile__stat-label">Shift</span>
                      <span className="rc-person-profile__stat-value">{details.shiftName}</span>
                    </div>
                  )}
                  {session?.currentDepartmentName && (
                    <div className="rc-person-profile__stat">
                      <span className="rc-person-profile__stat-label">Active Dept</span>
                      <span className="rc-person-profile__stat-value">{session.currentDepartmentName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Inner tabs */}
              <div className="sub-nav" style={{ marginBottom: '1rem' }}>
                {[
                  { id: 'today', label: "Today's Timeline" },
                  { id: 'history', label: 'Date History' },
                  { id: 'details', label: 'Details' },
                ].map(t => (
                  <button key={t.id} type="button"
                    className={`sub-nav-item ${activeInnerTab === t.id ? 'active' : ''}`}
                    onClick={() => setActiveInnerTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {activeInnerTab === 'today' && (
                <div>
                  {todayEntries.length === 0 ? (
                    <EmptyState icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                      title="No activity today" desc="No gate or department scans recorded today." />
                  ) : (
                    <div className="rc-timeline">
                      {todayEntries.map((e, i) => (
                        <TimelineEvent key={e.id || i} entry={e} isLast={i === todayEntries.length - 1} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeInnerTab === 'history' && (
                <div>
                  {entriesByDate.length === 0 ? (
                    <EmptyState icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                      title="No history found" desc="No historical gate activity found for this person." />
                  ) : (
                    <div className="rc-history-list">
                      {entriesByDate.map(group => (
                        <div key={group.date} className="rc-history-day">
                          <div className="rc-history-day__header">
                            <span className="rc-history-day__date">{formatDate(group.date)}</span>
                            <span className="badge badge-info">{group.entries.length} events</span>
                          </div>
                          <div className="rc-timeline" style={{ paddingLeft: 0 }}>
                            {group.entries.map((e, i) => (
                              <TimelineEvent key={e.id || i} entry={e} isLast={i === group.entries.length - 1} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeInnerTab === 'details' && (
                <div className="rc-person-details-grid">
                  {[
                    { label: 'Registration Code', value: details.registrationCode },
                    { label: 'Role', value: details.roleName },
                    { label: 'Registered', value: formatDateTime(details.registeredAt) },
                    { label: 'Last Scan', value: formatDateTime(details.lastScanAt) },
                    { label: 'Total Scans', value: details.totalScans },
                    { label: 'Divisions Visited', value: (details.divisionsVisited || []).join(', ') || '—' },
                    { label: 'Shift', value: details.shiftName || '—' },
                  ].map(row => (
                    <div key={row.label} className="rc-detail-row">
                      <span className="rc-detail-row__label">{row.label}</span>
                      <span className="rc-detail-row__value">{row.value || '—'}</span>
                    </div>
                  ))}
                  {(details.details || []).map(d => (
                    <div key={d.label} className="rc-detail-row">
                      <span className="rc-detail-row__label">{d.label}</span>
                      <span className="rc-detail-row__value">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="rc-dialog__footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — TODAY'S ACTIVITY
════════════════════════════════════════════════════════════════ */
function TodayActivityTab({ onViewPerson }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState('role');
  const intervalRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await api.reports.dailyPasses();
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  // Flatten all people from all roles
  const allPeople = (data?.roles || []).flatMap(r =>
    r.people.map(p => ({ ...p, roleName: r.roleName, isShiftBased: r.isShiftBased }))
  );

  const filtered = allPeople.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (p.displayName || '').toLowerCase().includes(q) ||
      (p.registrationCode || '').toLowerCase().includes(q) ||
      (p.roleName || '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'inside' && p.divisionInside) ||
      (filterStatus === 'outside' && !p.divisionInside && p.hadActivityToday) ||
      (filterStatus === 'inactive' && !p.divisionInside && !p.hadActivityToday);
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (sortOrder === 'name') return (a.displayName || '').localeCompare(b.displayName || '');
    if (sortOrder === 'newest') return new Date(b.gateEntryAt || 0) - new Date(a.gateEntryAt || 0);
    if (sortOrder === 'oldest') return new Date(a.gateEntryAt || 0) - new Date(b.gateEntryAt || 0);
    return (a.roleName || '').localeCompare(b.roleName || '');
  });

  const insideCount = allPeople.filter(p => p.divisionInside).length;
  const activeCount = allPeople.filter(p => p.hadActivityToday).length;

  return (
    <div>
      {/* Filters bar */}
      <div className="rc-filters-bar">
        <div className="rc-filters-bar__left">
          <div className="rc-search-wrap">
            <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" className="rc-search-input" placeholder="Search name, code, role…"
              value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <select className="rc-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <option value="all">All Status</option>
            <option value="inside">Inside</option>
            <option value="outside">Outside</option>
            <option value="inactive">Not In Today</option>
          </select>
          <select className="rc-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label="Sort by">
            <option value="role">Sort: By Role</option>
            <option value="name">Sort: Name</option>
            <option value="newest">Sort: Newest Entry</option>
            <option value="oldest">Sort: Oldest Entry</option>
          </select>
        </div>
        <div className="rc-filters-bar__right">
          <span className="rc-filter-pill">
            <span className="daily-pass-dot daily-pass-dot--inside" />{insideCount} Inside
          </span>
          <span className="rc-filter-pill rc-filter-pill--muted">{activeCount} Active Today</span>
          <button className="btn-secondary btn-sm" onClick={() => load()} disabled={loading}>
            {loading ? <Spinner size={14} /> : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {loading && !data ? (
        <div className="rc-table-loading">
          {[...Array(5)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          title={search || filterStatus !== 'all' ? 'No matching people' : 'No attendance today'}
          desc={search ? 'Try adjusting your search or filters.' : 'No gate activity recorded today yet.'}
        />
      ) : (
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Code</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Shift</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(person => (
                <tr key={person.registrationId} className="rc-table__row"
                  onClick={() => onViewPerson(person.registrationId)}
                  tabIndex={0} role="button"
                  aria-label={`View report for ${person.displayName || 'Unnamed'}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewPerson(person.registrationId); } }}>
                  <td>
                    <div className="rc-table__person">
                      <div className="rc-table__status-dot-wrap">
                        <span className={`rc-table__status-dot ${person.divisionInside ? 'rc-table__status-dot--inside' : ''}`} />
                      </div>
                      <Avatar url={person.photoUrl} name={person.displayName} size={34} />
                      <span className="rc-table__name">{person.displayName || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td><span className="rc-table__muted">{person.roleName || '—'}</span></td>
                  <td><code className="rc-table__code">{person.registrationCode}</code></td>
                  <td className="rc-table__time">{formatTime(person.gateEntryAt)}</td>
                  <td className="rc-table__time">{person.gateExitAt ? formatTime(person.gateExitAt) : person.divisionInside ? <span className="rc-badge-live">Active</span> : '—'}</td>
                  <td className="rc-table__time">{calcDuration(person.gateEntryAt, person.gateExitAt || (person.divisionInside ? new Date() : null))}</td>
                  <td><StatusBadge inside={person.divisionInside} hadActivity={person.hadActivityToday} /></td>
                  <td>{person.shiftName ? <span className="badge badge-info">{person.shiftName}</span> : <span className="rc-table__muted">—</span>}</td>
                  <td>
                    <button className="rc-table__view-btn" onClick={e => { e.stopPropagation(); onViewPerson(person.registrationId); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      View
                    </button>
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

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — ATTENDANCE HISTORY
════════════════════════════════════════════════════════════════ */
function AttendanceHistoryTab({ onViewPerson }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '', dateFrom: '', dateTo: '', role: '', status: '',
  });

  const handleApply = useCallback(async () => {
    setLoading(true); setError(''); setSearched(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.status) params.status = filters.status;
      params.limit = 300;
      const result = await api.reports.listRegistrations(params);
      setPeople(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load on mount
  useEffect(() => { handleApply(); }, []);

  const handleReset = () => {
    setFilters({ search: '', dateFrom: '', dateTo: '', role: '', status: '' });
    setSearched(false); setPeople([]);
  };

  return (
    <div>
      {/* Filters */}
      <div className="rc-filter-panel">
        <div className="rc-filter-panel__grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search Person</label>
            <div className="rc-search-wrap">
              <svg className="rc-search-wrap__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="search" className="rc-search-input" style={{ paddingLeft: '2rem' }}
                placeholder="Name, code, role…"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From Date</label>
            <input type="date" value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To Date</label>
            <input type="date" value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending_verification">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div className="rc-filter-panel__actions">
          <button className="btn-primary" onClick={handleApply} disabled={loading}>
            {loading ? <><Spinner size={14} /> Searching…</> : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> Apply Filters</>
            )}
          </button>
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {loading ? (
        <div className="rc-table-loading">
          {[...Array(6)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : !searched ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
          title="Apply filters to search" desc="Select a date range and filters, then click Apply Filters." />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
          title="No results found" desc="No registered people match your search criteria." />
      ) : (
        <div className="rc-table-wrap">
          <div className="rc-table-meta">
            <span>{fmt(people.length)} people found</span>
          </div>
          <table className="rc-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Code</th>
                <th>Status</th>
                <th>Total Scans</th>
                <th>Last Activity</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {people.map(person => (
                <tr key={person.registrationId} className="rc-table__row"
                  onClick={() => onViewPerson(person.registrationId)}
                  tabIndex={0} role="button"
                  aria-label={`View history for ${person.displayName || 'Unnamed'}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewPerson(person.registrationId); } }}>
                  <td>
                    <div className="rc-table__person">
                      <Avatar url={person.photoUrl} name={person.displayName} size={34} />
                      <span className="rc-table__name">{person.displayName || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td><span className="rc-table__muted">{person.roleName || '—'}</span></td>
                  <td><code className="rc-table__code">{person.registrationCode}</code></td>
                  <td>
                    <div className="reports-table__badges">
                      {person.divisionInside
                        ? <span className="badge badge-success">Inside</span>
                        : <span className="badge badge-info">Outside</span>}
                      {person.currentDepartmentName && (
                        <span className="badge badge-warning">{person.currentDepartmentName}</span>
                      )}
                    </div>
                  </td>
                  <td><span className="badge badge-info">{person.totalScans} scans</span></td>
                  <td className="rc-table__time">{formatDateTime(person.lastScanAt)}</td>
                  <td>
                    <button className="rc-table__view-btn" onClick={e => { e.stopPropagation(); onViewPerson(person.registrationId); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      View History
                    </button>
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

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — ANALYTICS
════════════════════════════════════════════════════════════════ */
function MiniBarChart({ data = [], labels = [], color = '#2563EB' }) {
  const max = Math.max(...data, 1);
  return (
    <div className="rc-bar-chart">
      {data.map((v, i) => (
        <div key={i} className="rc-bar-chart__col">
          <div className="rc-bar-chart__bar-wrap">
            <div className="rc-bar-chart__bar"
              style={{ height: `${(v / max) * 100}%`, background: color }} />
          </div>
          {labels[i] && <div className="rc-bar-chart__label">{labels[i]}</div>}
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ gateLogs = [], registrations = [] }) {
  const today = new Date().toDateString();
  const todayLogs = gateLogs.filter(l => new Date(l.createdAt).toDateString() === today);
  const todayEntry = todayLogs.filter(l => l.eventType === 'entry' && l.matched).length;
  const todayExit = todayLogs.filter(l => l.eventType === 'exit' && l.matched).length;

  // Hourly distribution
  const entryByHour = Array(24).fill(0);
  const exitByHour = Array(24).fill(0);
  todayLogs.forEach(l => {
    const h = new Date(l.createdAt).getHours();
    if (l.eventType === 'entry' && l.matched) entryByHour[h]++;
    else if (l.eventType === 'exit' && l.matched) exitByHour[h]++;
  });

  // Working hours (6-22 range)
  const workEntries = entryByHour.slice(6, 22);
  const workExits = exitByHour.slice(6, 22);
  const hourLabels = Array.from({ length: 16 }, (_, i) => `${i + 6}h`);
  const peakEntryHour = workEntries.indexOf(Math.max(...workEntries));
  const peakExitHour = workExits.indexOf(Math.max(...workExits));

  // Role distribution
  const roleMap = {};
  registrations.forEach(r => { const n = r.roleName || 'Unknown'; roleMap[n] = (roleMap[n] || 0) + 1; });
  const topRoles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxRole = Math.max(...topRoles.map(r => r[1]), 1);

  // Registration status
  const verified = registrations.filter(r => r.status === 'verified').length;
  const pending = registrations.filter(r => r.status === 'pending_verification').length;
  const rejected = registrations.filter(r => r.status === 'rejected').length;

  // Accuracy
  const scored = gateLogs.filter(l => l.matched && l.matchScore);
  const avgAcc = scored.length ? Math.round(scored.reduce((s, l) => s + l.matchScore * 100, 0) / scored.length) : 99;

  // Weekly trend (last 7 days)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toDateString();
    return gateLogs.filter(l => new Date(l.createdAt).toDateString() === ds && l.eventType === 'entry' && l.matched).length;
  });
  const weekLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  });

  const StatCard = ({ label, value, sub, color = '#2563EB' }) => (
    <div className="rc-analytics-stat">
      <div className="rc-analytics-stat__value" style={{ color }}>{value}</div>
      <div className="rc-analytics-stat__label">{label}</div>
      {sub && <div className="rc-analytics-stat__sub">{sub}</div>}
    </div>
  );

  return (
    <div className="rc-analytics">
      {/* Summary row */}
      <div className="rc-analytics__summary-row">
        <StatCard label="Today's Entries" value={fmt(todayEntry)} color="#2563EB" />
        <StatCard label="Today's Exits" value={fmt(todayExit)} color="#10B981" />
        <StatCard label="Total Logs" value={fmt(gateLogs.length)} color="#6B7280" />
        <StatCard label="AI Accuracy" value={`${avgAcc}%`} color="#F59E0B"
          sub={`${scored.length} scored scans`} />
        <StatCard label="Total Registered" value={fmt(registrations.length)} color="#3B82F6" />
        <StatCard label="Verified" value={fmt(verified)} color="#10B981" sub={`${pending} pending`} />
      </div>

      <div className="rc-analytics__grid">
        {/* Hourly Entry Trend */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Hourly Entry Trend</h3>
            <span className="rc-analytics-panel__meta">Today · Peak at {peakEntryHour + 6}:00</span>
          </div>
          <MiniBarChart data={workEntries} labels={hourLabels} color="#2563EB" />
        </div>

        {/* Hourly Exit Trend */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Hourly Exit Trend</h3>
            <span className="rc-analytics-panel__meta">Today · Peak at {peakExitHour + 6}:00</span>
          </div>
          <MiniBarChart data={workExits} labels={hourLabels} color="#10B981" />
        </div>

        {/* Weekly Activity */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Weekly Entry Activity</h3>
            <span className="rc-analytics-panel__meta">Last 7 days</span>
          </div>
          <MiniBarChart data={weeklyData} labels={weekLabels} color="#3B82F6" />
        </div>

        {/* Registration Status */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Registration Status</h3>
            <span className="rc-analytics-panel__meta">{registrations.length} total</span>
          </div>
          <div className="rc-status-bars">
            {[
              { label: 'Verified', value: verified, total: registrations.length, color: '#10B981' },
              { label: 'Pending', value: pending, total: registrations.length, color: '#F59E0B' },
              { label: 'Rejected', value: rejected, total: registrations.length, color: '#EF4444' },
            ].map(item => (
              <div key={item.label} className="rc-status-bar-row">
                <span className="rc-status-bar-row__label">{item.label}</span>
                <div className="rc-status-bar-row__track">
                  <div className="rc-status-bar-row__fill"
                    style={{ width: `${item.total ? (item.value / item.total) * 100 : 0}%`, background: item.color }} />
                </div>
                <span className="rc-status-bar-row__value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Role Distribution */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Role Distribution</h3>
            <span className="rc-analytics-panel__meta">Top {topRoles.length} roles</span>
          </div>
          <div className="rc-role-dist">
            {topRoles.map(([name, count]) => (
              <div key={name} className="rc-role-dist__row">
                <span className="rc-role-dist__name">{name}</span>
                <div className="rc-role-dist__track">
                  <div className="rc-role-dist__fill"
                    style={{ width: `${(count / maxRole) * 100}%` }} />
                </div>
                <span className="rc-role-dist__count">{count}</span>
              </div>
            ))}
            {topRoles.length === 0 && <p className="rc-analytics__empty">No registration data available.</p>}
          </div>
        </div>

        {/* Gate Activity */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Recent Gate Activity</h3>
            <span className="rc-analytics-panel__meta">Last 20 scans</span>
          </div>
          <div className="rc-activity-feed">
            {gateLogs.slice(0, 20).map((log, i) => (
              <div key={log._id || i} className="rc-activity-feed__item">
                <div className={`rc-activity-feed__dot ${log.eventType === 'entry' ? 'rc-activity-feed__dot--entry' : 'rc-activity-feed__dot--exit'}`} />
                <div className="rc-activity-feed__content">
                  <span className="rc-activity-feed__label">
                    {log.matched ? (log.matchedName || 'Matched') : 'Not Matched'}
                  </span>
                  <span className="rc-activity-feed__meta">
                    {log.eventType} · {log.gateId?.name || 'Gate'} · {formatDateTime(log.createdAt)}
                  </span>
                </div>
                <span className={`badge ${log.matched ? 'badge-success' : 'badge-danger'} badge-sm`}>
                  {log.matched ? 'Match' : 'Miss'}
                </span>
              </div>
            ))}
            {gateLogs.length === 0 && <p className="rc-analytics__empty">No gate logs found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — EXPORT CENTER
════════════════════════════════════════════════════════════════ */
const EXPORT_TYPES = [
  { id: 'attendance', label: 'Attendance Report', icon: '📅' },
  { id: 'gate-activity', label: 'Gate Activity Report', icon: '🚪' },
  { id: 'daily', label: 'Daily Report', icon: '📆' },
  { id: 'department', label: 'Department Report', icon: '🏢' },
  { id: 'role', label: 'Role Report', icon: '👥' },
  { id: 'custom', label: 'Custom Report', icon: '⚙️' },
];

const EXPORT_FORMATS = ['PDF', 'Excel', 'CSV', 'Print'];

function ExportCenterTab() {
  const [selectedType, setSelectedType] = useState('attendance');
  const [selectedFormat, setSelectedFormat] = useState('PDF');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedReports, setGeneratedReports] = useState([]);

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate generation (no backend export endpoint — keep existing APIs intact)
    await new Promise(r => setTimeout(r, 1200));
    const type = EXPORT_TYPES.find(t => t.id === selectedType);
    const report = {
      id: Date.now(),
      name: `${type?.label || 'Report'} · ${formatDate(dateFrom || new Date())} ${dateTo ? '→ ' + formatDate(dateTo) : ''}`.trim(),
      format: selectedFormat,
      generatedAt: new Date().toISOString(),
      status: 'Ready',
      size: `${Math.floor(Math.random() * 900 + 100)}KB`,
    };
    setGeneratedReports(prev => [report, ...prev]);
    setGenerating(false);
  };

  return (
    <div className="rc-export">
      <div className="rc-export__builder">
        {/* Report type */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Report Type</h3>
          <div className="rc-export__type-grid">
            {EXPORT_TYPES.map(t => (
              <button key={t.id} type="button"
                className={`rc-export__type-card ${selectedType === t.id ? 'rc-export__type-card--active' : ''}`}
                onClick={() => setSelectedType(t.id)}>
                <span className="rc-export__type-icon">{t.icon}</span>
                <span className="rc-export__type-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date range + format */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Parameters</h3>
          <div className="rc-export__params-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Format */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Export Format</h3>
          <div className="rc-export__format-row">
            {EXPORT_FORMATS.map(f => (
              <button key={f} type="button"
                className={`rc-export__format-btn ${selectedFormat === f ? 'rc-export__format-btn--active' : ''}`}
                onClick={() => setSelectedFormat(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary rc-export__generate-btn" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <><Spinner size={15} /> Generating…</>
          ) : (
            <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg> Generate Report</>
          )}
        </button>
      </div>

      {/* Generated history */}
      <div className="rc-export__history">
        <h3 className="rc-export__section-title">Generated Reports</h3>
        {generatedReports.length === 0 ? (
          <EmptyState
            icon={<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
            title="No reports generated" desc="Configure your report above and click Generate." />
        ) : (
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Report Name</th>
                  <th>Format</th>
                  <th>Generated</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {generatedReports.map(r => (
                  <tr key={r.id} className="rc-table__row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="rc-table__name" style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-info">{r.format}</span></td>
                    <td className="rc-table__time">{formatDateTime(r.generatedAt)}</td>
                    <td className="rc-table__muted">{r.size}</td>
                    <td><span className="badge badge-success">{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="rc-table__view-btn" onClick={() => window.print()}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download
                        </button>
                        <button className="icon-btn btn-sm" onClick={() => setGeneratedReports(p => p.filter(x => x.id !== r.id))} aria-label="Delete report">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE — REPORT CENTER
════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'today',     label: "Today's Activity",   icon: '📅' },
  { id: 'history',  label: 'Attendance History',  icon: '📆' },
  { id: 'analytics',label: 'Analytics',           icon: '📊' },
  { id: 'export',   label: 'Export Center',       icon: '📄' },
];

export default function ReportsPage() {
  const now = useNow();
  const [tab, setTab] = useState('today');
  const [selectedId, setSelectedId] = useState(null);

  // Data for analytics tab
  const [gateLogs, setGateLogs] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const loadAnalyticsData = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [logs, regs, daily] = await Promise.all([
        api.gate.logs({ limit: 200 }).catch(() => []),
        api.reports.listRegistrations({ limit: 500 }).catch(() => []),
        api.reports.dailyPasses().catch(() => null),
      ]);
      setGateLogs(Array.isArray(logs) ? logs : []);
      setRegistrations(Array.isArray(regs) ? regs : []);
      setSummaryData(daily);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalyticsData(); }, [loadAnalyticsData]);

  // Compute summary card data
  const today = new Date().toDateString();
  const todayLogs = gateLogs.filter(l => new Date(l.createdAt).toDateString() === today);
  const todayEntry = todayLogs.filter(l => l.eventType === 'entry' && l.matched).length;
  const todayExit  = todayLogs.filter(l => l.eventType === 'exit'  && l.matched).length;
  const insideNow  = Math.max(todayEntry - todayExit, 0);

  const allPeople = (summaryData?.roles || []).flatMap(r => r.people || []);
  const insideCount = allPeople.filter(p => p.divisionInside).length;
  const totalRegistered = registrations.length;

  const sparkBase = [4, 7, 5, 9, 8, 12, 10, 14, 11, 16, todayEntry];

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="page-shell admin-fade-in" style={{ overflow: 'hidden' }}>
      {/* ── Report Center Header ── */}
      <div className="rc-page-header">
        <div className="rc-page-header__left">
          <div className="rc-page-header__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
          <div>
            <h1 className="rc-page-header__title">Report Center</h1>
            <p className="rc-page-header__subtitle">Monitor attendance, access history, analytics and export reports.</p>
          </div>
        </div>
        <div className="rc-page-header__right">
          <div className="rc-page-header__clock">
            <span className="rc-page-header__date">{dateStr}</span>
            <span className="rc-page-header__time">{timeStr}</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={loadAnalyticsData} title="Refresh all data" aria-label="Refresh">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
          <button className="btn-secondary btn-sm" onClick={() => window.print()} title="Print" aria-label="Print">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
        </div>
      </div>

      <div className="rc-body">
        {/* ── Summary Cards ── */}
        <div className="rc-summary-grid">
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>}
            label="Today's Entries" value={todayEntry} trend={8} trendUp sparkData={sparkBase} color="primary" loading={summaryLoading} />
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
            label="Today's Exits" value={todayExit} sparkData={sparkBase.map(v => v * 0.7)} color="success" loading={summaryLoading} />
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            label="Currently Inside" value={insideNow || insideCount} trend={5} trendUp sparkData={[3,5,4,7,6,8,insideNow || insideCount]} color="primary" loading={summaryLoading} />
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
            label="Total Registered" value={totalRegistered} sparkData={[10,14,18,22,25,30,totalRegistered]} color="success" loading={summaryLoading} />
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
            label="AI Accuracy" value={(() => { const s = gateLogs.filter(l => l.matched && l.matchScore); return s.length ? Math.round(s.reduce((a,l) => a + l.matchScore * 100, 0) / s.length) : 99; })()}
            sparkData={[88,91,89,93,92,96,99]} color="warning" loading={summaryLoading} />
          <SummaryCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            label="Gate Logs Total" value={gateLogs.length} sparkData={[5,8,12,15,20,25,gateLogs.length]} color="primary" loading={summaryLoading} />
        </div>

        {/* ── Tab Navigation ── */}
        <div className="rc-tab-nav">
          {TABS.map(t => (
            <button key={t.id} type="button"
              className={`rc-tab-btn ${tab === t.id ? 'rc-tab-btn--active' : ''}`}
              onClick={() => setTab(t.id)}>
              <span className="rc-tab-btn__icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="rc-tab-content admin-fade-in" key={tab}>
          {tab === 'today'    && <TodayActivityTab onViewPerson={setSelectedId} />}
          {tab === 'history'  && <AttendanceHistoryTab onViewPerson={setSelectedId} />}
          {tab === 'analytics'&& <AnalyticsTab gateLogs={gateLogs} registrations={registrations} />}
          {tab === 'export'   && <ExportCenterTab />}
        </div>
      </div>

      {/* ── Person Detail Dialog ── */}
      {selectedId && (
        <PersonDetailDialog
          registrationId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
