'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import AdminIcon from '@/components/admin/AdminIcons';
import { AreaChart } from '@/components/admin/AdminCharts';
import { formatDate } from '@/lib/formatDate';

const JATTU_SLUG = 'jattu';
const WEEKLY_LABELS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function Panel({ title, meta, children, className = '' }) {
  return (
    <div className={`admin-panel glass-panel admin-fade-in ${className}`}>
      <div className="admin-panel__head">
        <h2>{title}</h2>
        {meta && <span className="admin-panel__meta">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ icon, iconColor, label, value, loading, href }) {
  const card = (
    <div className={`admin-metric-card admin-hover-lift admin-fade-in${href ? ' admin-metric-card--link' : ''}`}>
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
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link> : card;
}

function statusLabel(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function JattuDashboardPage() {
  const [role, setRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentRegs, setRecentRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const roles = await api.roles.list();
      const jattuRole = (roles || []).find((r) => r.slug === JATTU_SLUG);
      if (!jattuRole) {
        setRole(null);
        setStats(null);
        setRecentRegs([]);
        setError('JATTU role was not found. Create it under Roles first.');
        return;
      }
      setRole(jattuRole);

      const [dashboardStats, regsResult] = await Promise.all([
        api.dashboard.stats({ roleIds: jattuRole._id }).catch(() => null),
        api.registrations.list({ roleId: jattuRole._id, limit: 8, page: 1 }).catch(() => ({ items: [] })),
      ]);

      setStats(dashboardStats);
      const items = Array.isArray(regsResult) ? regsResult : (regsResult?.items || []);
      setRecentRegs(items);
    } catch (err) {
      setError(err.message || 'Failed to load JATTU dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weeklyRegSeries = stats?.division?.weeklyRegistrationsSeries || [];
  const weeklyEntrySeries = stats?.division?.weeklyEntriesSeries || [];
  const weekRegs = useMemo(
    () => weeklyRegSeries.reduce((sum, ds) => sum + (ds.data || []).reduce((s, v) => s + v, 0), 0),
    [weeklyRegSeries]
  );
  const weekEntries = useMemo(
    () => weeklyEntrySeries.reduce((sum, ds) => sum + (ds.data || []).reduce((s, v) => s + v, 0), 0),
    [weeklyEntrySeries]
  );

  const statusCounts = stats?.statusCounts || {};
  const total = stats?.totalRegistrations ?? recentRegs.length;

  const headerActions = (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={load} disabled={loading}>
        Refresh
      </button>
      <Link href="/jattu/registrations" className="admin-btn admin-btn--primary">
        + Manage Registrations
      </Link>
    </div>
  );

  return (
    <PageShell
      title="JATTU Dashboard"
      description="Overview of JATTU registrations and gate activity."
      headerActions={headerActions}
    >
      {error && (
        <div className="admin-alert admin-alert--danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section className="admin-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <MetricCard icon="registrations" iconColor="primary" label="Total Registrations" value={total} loading={loading} href="/jattu/registrations" />
        <MetricCard icon="roles" iconColor="success" label="Verified" value={statusCounts.verified || 0} loading={loading} />
        <MetricCard icon="entryExit" iconColor="warning" label="Today Entries" value={stats?.todayEntries || 0} loading={loading} href="/jattu/activity" />
        <MetricCard icon="entryExit" iconColor="secondary" label="Today Exits" value={stats?.todayExits || 0} loading={loading} href="/jattu/activity" />
        <MetricCard icon="cameras" iconColor="accent" label="Inside Now" value={stats?.insideNow || 0} loading={loading} href="/jattu/activity" />
        <MetricCard icon="reports" iconColor="primary" label="Week Registrations" value={weekRegs} loading={loading} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Panel title="Weekly Registration Trend" meta={`${weekRegs} this week`}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : weeklyRegSeries.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No JATTU registrations yet.</p>
          ) : (
            <AreaChart datasets={weeklyRegSeries} labels={WEEKLY_LABELS} showLegend={false} />
          )}
        </Panel>

        <Panel title="Weekly Gate Activity" meta={`${weekEntries} entries this week`}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : weeklyEntrySeries.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No JATTU gate activity yet.</p>
          ) : (
            <AreaChart datasets={weeklyEntrySeries} labels={WEEKLY_LABELS} showLegend={false} />
          )}
        </Panel>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <Panel title="Registration Status" meta={role ? `Role: ${role.name}` : undefined}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {Object.entries(statusCounts).map(([key, value]) => (
                <li key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <span>{statusLabel(key)}</span>
                  <strong>{value}</strong>
                </li>
              ))}
              {Object.keys(statusCounts).length === 0 && (
                <li style={{ color: 'var(--text-muted)' }}>No status data yet.</li>
              )}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent Registrations"
          meta={<Link href="/jattu/registrations" style={{ fontSize: '0.875rem' }}>View all</Link>}
        >
          <div className="admin-table-container" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>Loading…</td></tr>
                ) : recentRegs.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No JATTU registrations yet.</td></tr>
                ) : (
                  recentRegs.map((reg) => (
                    <tr key={reg._id}>
                      <td style={{ fontWeight: 600 }}>{reg.displayName || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{reg.registrationCode || '—'}</td>
                      <td>{statusLabel(reg.status)}</td>
                      <td>{reg.createdAt ? formatDate(reg.createdAt) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </PageShell>
  );
}
