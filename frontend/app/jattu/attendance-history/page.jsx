'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import AdminIcon from '@/components/admin/AdminIcons';
import { formatDateTime, todayDateStringIst } from '@/lib/formatDate';

const JATTU_SLUG = 'jattu';
const UNGROUPED = 'No Group';

function MetricCard({ icon, iconColor, label, value, loading }) {
  return (
    <div className="admin-metric-card admin-hover-lift admin-fade-in">
      <div className="admin-metric-card__head">
        <span className={`admin-metric-card__icon admin-metric-card__icon--${iconColor}`}>
          <AdminIcon name={icon} className="admin-icon" />
        </span>
      </div>
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value">
        {loading ? (
          <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: 60 }} />
        ) : (
          <AnimatedCounter value={value} />
        )}
      </div>
    </div>
  );
}

function selectionValue(emp, labelMatchers) {
  const selections = emp?.selections || [];
  for (const sel of selections) {
    const label = String(sel.label || '').toLowerCase();
    if (labelMatchers.some((m) => label.includes(m))) {
      const value = String(sel.value || '').trim();
      if (value) return value;
    }
  }
  return '';
}

function groupNameFor(emp) {
  return selectionValue(emp, ['group']) || UNGROUPED;
}

function dayForDate(emp, date) {
  return (emp?.days || []).find((d) => d.date === date) || null;
}

function isPresentStatus(status) {
  return status === 'P' || status === 'HD' || status === 'FH' || status === 'SH' || status === 'PT';
}

function personAttendance(emp, date, today) {
  const day = dayForDate(emp, date);
  const status = day?.status || 'A';
  const present = isPresentStatus(status);
  const stillInside =
    present &&
    (day?.lastActivityType === 'entry' ||
      (Boolean(day?.checkIn) && day?.lastActivityType !== 'exit'));
  const active = Boolean(stillInside && date === today);
  const inTime = day?.checkInTime || (day?.checkIn ? formatDateTime(day.checkIn) : '—');

  let state = 'Absent';
  let stateKey = 'absent';
  if (active) {
    state = 'Active';
    stateKey = 'active';
  } else if (present) {
    state = 'Present';
    stateKey = 'present';
  }

  return {
    registrationId: emp.registrationId,
    displayName: emp.displayName || 'Unnamed',
    registrationCode: emp.registrationCode || '—',
    group: groupNameFor(emp),
    details: (emp.selections || [])
      .filter((s) => s.label && s.value)
      .map((s) => `${s.label}: ${s.value}`)
      .join(' · '),
    photoUrl: emp.photoUrl || null,
    inTime: present ? inTime : '—',
    state,
    stateKey,
    present,
    active,
    absent: !present,
    label: day?.label || state,
  };
}

async function fetchAllJattuAttendance({ roleId, date }) {
  const pageSize = 100;
  let page = 1;
  let hasMore = true;
  const employees = [];

  while (hasMore) {
    const result = await api.reports.attendanceHistory({
      dateFrom: date,
      dateTo: date,
      roleId,
      limit: pageSize,
      page,
    });
    const batch = Array.isArray(result?.employees) ? result.employees : [];
    employees.push(...batch);
    hasMore = Boolean(result?.hasMore);
    page += 1;
    if (page > 50) break;
  }

  return employees;
}

function statusBadgeClass(stateKey) {
  if (stateKey === 'active') return 'admin-badge admin-badge--success';
  if (stateKey === 'present') return 'admin-badge admin-badge--primary';
  return 'admin-badge admin-badge--secondary';
}

export default function JattuAttendanceHistoryPage() {
  const [date, setDate] = useState(() => todayDateStringIst());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [people, setPeople] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const roles = await api.roles.list();
      const jattu = (roles || []).find((r) => r.slug === JATTU_SLUG);
      if (!jattu?._id) {
        setPeople([]);
        setError('JATTU role was not found. Create it under Roles first.');
        return;
      }

      const employees = await fetchAllJattuAttendance({ roleId: jattu._id, date });
      const today = todayDateStringIst();
      setPeople(employees.map((emp) => personAttendance(emp, date, today)));
    } catch (err) {
      setPeople([]);
      setError(err.message || 'Failed to load JATTU attendance');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedGroup(null);
  }, [date]);

  const totals = useMemo(() => {
    const total = people.length;
    const present = people.filter((p) => p.present).length;
    const absent = people.filter((p) => p.absent).length;
    const active = people.filter((p) => p.active).length;
    return { total, present, absent, active };
  }, [people]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const person of people) {
      const key = person.group || UNGROUPED;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          total: 0,
          present: 0,
          absent: 0,
          active: 0,
          people: [],
        });
      }
      const row = map.get(key);
      row.total += 1;
      row.people.push(person);
      if (person.active) row.active += 1;
      if (person.present) row.present += 1;
      if (person.absent) row.absent += 1;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const selected = useMemo(
    () => groups.find((g) => g.name === selectedGroup) || null,
    [groups, selectedGroup]
  );

  const visiblePeople = useMemo(() => {
    if (!selected) return [];
    const q = search.trim().toLowerCase();
    if (!q) return selected.people;
    return selected.people.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.registrationCode.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q) ||
        p.details.toLowerCase().includes(q)
    );
  }, [selected, search]);

  const headerActions = (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={loading}
        />
      </label>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={load} disabled={loading}>
        Refresh
      </button>
    </div>
  );

  return (
    <PageShell
      title="JATTU Attendance"
      description="Group-wise present / absent / active counts for JATTU — no pay or pay slips."
      headerActions={headerActions}
    >
      {error && (
        <div className="admin-alert admin-alert--danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section
        className="admin-fade-in"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <MetricCard icon="registrations" iconColor="primary" label="Total People" value={totals.total} loading={loading} />
        <MetricCard icon="entryExit" iconColor="success" label="Present" value={totals.present} loading={loading} />
        <MetricCard icon="entryExit" iconColor="secondary" label="Absent" value={totals.absent} loading={loading} />
        <MetricCard icon="cameras" iconColor="warning" label="Active Today" value={totals.active} loading={loading} />
      </section>

      <div className="admin-panel glass-panel admin-fade-in" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-panel__head">
          <h2>Groups</h2>
          <span className="admin-panel__meta">Click a group row to view people</span>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading attendance…</p>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No JATTU registrations found for this date.</p>
        ) : (
          <div className="admin-table-container" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Total</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Active Today</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isOpen = selectedGroup === group.name;
                  return (
                    <tr
                      key={group.name}
                      onClick={() => setSelectedGroup(isOpen ? null : group.name)}
                      style={{
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken, rgba(37, 99, 235, 0.08))' : undefined,
                      }}
                      title="Click to view people in this group"
                    >
                      <td style={{ fontWeight: 600 }}>
                        {group.name}
                        {isOpen ? ' ▸' : ''}
                      </td>
                      <td>{group.total}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{group.present}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{group.absent}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{group.active}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className="admin-panel glass-panel admin-fade-in">
          <div className="admin-panel__head" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2>{selected.name} — People</h2>
              <span className="admin-panel__meta">
                {visiblePeople.length} shown · Name, details, in-time, present/absent
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
              <input
                type="search"
                placeholder="Search name, code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={loading}
                style={{ minWidth: 220 }}
              />
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setSelectedGroup(null)}>
                Back to groups
              </button>
            </div>
          </div>

          <div className="admin-table-container" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Group</th>
                  <th>Details</th>
                  <th>In Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visiblePeople.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      No people in this group.
                    </td>
                  </tr>
                ) : (
                  visiblePeople.map((person) => (
                    <tr key={person.registrationId}>
                      <td style={{ fontWeight: 600 }}>{person.displayName}</td>
                      <td style={{ fontFamily: 'monospace' }}>{person.registrationCode}</td>
                      <td>{person.group}</td>
                      <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{person.details || '—'}</td>
                      <td>{person.inTime}</td>
                      <td>
                        <span className={statusBadgeClass(person.stateKey)}>{person.state}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !loading &&
        groups.length > 0 && (
          <p className="field-hint" style={{ marginTop: '0.25rem' }}>
            Select a group in the table above to view its people list.
          </p>
        )
      )}
    </PageShell>
  );
}
