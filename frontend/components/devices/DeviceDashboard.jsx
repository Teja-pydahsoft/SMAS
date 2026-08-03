'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/formatDate';

/* ── Tiny inline icons ────────────────────────────────────────── */
function Icon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const Icons = {
  monitor:  'M2 3h20v14H2zM8 21h8M12 17v4',
  clock:    'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 6v4l3 3',
  check:    'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  x:        'M18 6 6 18M6 6l12 12',
  shield:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  users:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
  refresh:  'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
};

const ACTION_LABELS = {
  registered:       'Registered',
  approved:         'Approved',
  rejected:         'Rejected',
  blocked:          'Blocked',
  unblocked:        'Unblocked',
  deleted:          'Deleted',
  login_attempt:    'Login',
  validation_failed:'Validation Failed',
  settings_updated: 'Settings Updated',
};

const ACTION_VARIANT = {
  registered:       'info',
  approved:         'success',
  rejected:         'danger',
  blocked:          'danger',
  unblocked:        'success',
  deleted:          'danger',
  login_attempt:    'success',
  validation_failed:'warning',
  settings_updated: 'info',
};

function StatCard({ label, value, iconKey, variant = 'primary', href, loading }) {
  const inner = (
    <div className="admin-metric-card dm-stat-card">
      <div className="admin-metric-card__head">
        <div className={`admin-metric-card__icon admin-metric-card__icon--${variant}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={Icons[iconKey]} />
          </svg>
        </div>
      </div>
      <div className="admin-metric-card__label">{label}</div>
      {loading
        ? <div className="admin-skeleton__line admin-skeleton__line--lg" />
        : <div className="admin-metric-card__value">{value ?? '—'}</div>
      }
    </div>
  );
  if (href) return <Link href={href} className="admin-metric-card--link">{inner}</Link>;
  return inner;
}

function MiniTrend({ data = [], color = 'var(--color-primary)' }) {
  if (!data.length) return null;
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const W = 120, H = 32, pts = counts.length;
  const points = counts.map((c, i) => {
    const x = pts === 1 ? W / 2 : (i / (pts - 1)) * W;
    const y = H - (c / max) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="32" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}

export default function DeviceDashboard() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    api.devices.stats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const s = stats ?? {};

  return (
    <div className="admin-dashboard">
      {error && <p className="error-msg">{error}</p>}

      {/* ── Stat cards ── */}
      <div className="dm-stats-grid stagger-children">
        <StatCard label="Total Devices"     value={s.total}    iconKey="monitor"   variant="primary"   href="/system/devices/list"    loading={loading} />
        <StatCard label="Pending Approval"  value={s.pending}  iconKey="clock"     variant="warning"   href="/system/devices/pending" loading={loading} />
        <StatCard label="Approved"          value={s.approved} iconKey="check"     variant="success"   loading={loading} />
        <StatCard label="Blocked"           value={s.blocked}  iconKey="shield"    variant="danger"    loading={loading} />
        <StatCard label="Rejected"          value={s.rejected} iconKey="x"         variant="danger"    loading={loading} />
        <StatCard label="Logins Today"      value={s.todayLogins}  iconKey="activity" variant="accent" loading={loading} />
        <StatCard label="New Today"         value={s.newRequests}  iconKey="users"    variant="secondary" loading={loading} />
      </div>

      {/* ── Trend + Recent activity ── */}
      <div className="dm-dash-grid">

        {/* Registration trend */}
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>Registration Trend <span className="admin-panel__meta">(30 days)</span></h2>
          </div>
          {loading ? (
            <div className="admin-skeleton__line admin-skeleton__line--chart" style={{ height: 80 }} />
          ) : (s.registrationTrend?.length ?? 0) === 0 ? (
            <p className="admin-empty-note">No registrations in the last 30 days.</p>
          ) : (
            <>
              <MiniTrend data={s.registrationTrend ?? []} color="var(--color-primary)" />
              <p className="dm-trend-meta">
                {s.registrationTrend?.reduce((a, d) => a + d.count, 0) ?? 0} total registrations
              </p>
            </>
          )}
        </div>

        {/* Daily login activity */}
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>Login Activity <span className="admin-panel__meta">(14 days)</span></h2>
          </div>
          {loading ? (
            <div className="admin-skeleton__line admin-skeleton__line--chart" style={{ height: 80 }} />
          ) : (s.dailyLoginTrend?.length ?? 0) === 0 ? (
            <p className="admin-empty-note">No login activity in the last 14 days.</p>
          ) : (
            <>
              <MiniTrend data={s.dailyLoginTrend ?? []} color="var(--color-success)" />
              <p className="dm-trend-meta">
                {s.dailyLoginTrend?.reduce((a, d) => a + d.count, 0) ?? 0} total logins
              </p>
            </>
          )}
        </div>

        {/* Recent audit events */}
        <div className="admin-panel dm-recent-panel">
          <div className="admin-panel__head">
            <h2>Recent Activity</h2>
            <Link href="/system/devices/audit" className="admin-link">View all</Link>
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="admin-skeleton__line" style={{ height: 18, marginBottom: 10 }} />
            ))
          ) : (s.recentActivity?.length ?? 0) === 0 ? (
            <p className="admin-empty-note">No recent activity.</p>
          ) : (
            <ul className="dm-activity-list">
              {s.recentActivity.map((log) => (
                <li key={log.id} className="dm-activity-item">
                  <span className={`dm-activity-dot dm-activity-dot--${ACTION_VARIANT[log.action] ?? 'info'}`} aria-hidden />
                  <div className="dm-activity-item__body">
                    <span className="dm-activity-item__device">{log.deviceName || log.computerName || 'Unknown device'}</span>
                    <span className="dm-activity-item__action">{ACTION_LABELS[log.action] ?? log.action}</span>
                    {log.performedByName && (
                      <span className="dm-activity-item__actor">by {log.performedByName}</span>
                    )}
                  </div>
                  <time className="dm-activity-item__time">{formatDateTime(log.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
