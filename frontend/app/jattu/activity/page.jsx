'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import AdminIcon from '@/components/admin/AdminIcons';
import { formatDate } from '@/lib/formatDate';

const JATTU_SLUG = 'jattu';

function Panel({ title, meta, children }) {
  return (
    <div className="admin-panel glass-panel admin-fade-in">
      <div className="admin-panel__head">
        <h2>{title}</h2>
        {meta && <span className="admin-panel__meta">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

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

function statusLabel(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function JattuActivityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [registrations, setRegistrations] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const roles = await api.roles.list();
      const jattuRole = (roles || []).find((r) => r.slug === JATTU_SLUG);
      if (!jattuRole) {
        setError('JATTU role was not found. Create it under Roles first.');
        setStats(null);
        setRegistrations([]);
        return;
      }

      const [dashboardStats, regsResult] = await Promise.all([
        api.dashboard.stats({ roleIds: jattuRole._id }).catch(() => null),
        api.registrations.list({ roleId: jattuRole._id, limit: 25, page: 1 }).catch(() => ({ items: [] })),
      ]);

      setStats(dashboardStats);
      const items = Array.isArray(regsResult) ? regsResult : (regsResult?.items || []);
      setRegistrations(items);
    } catch (err) {
      setError(err.message || 'Failed to load JATTU activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const headerActions = (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={load} disabled={loading}>
        Refresh
      </button>
      <Link href="/jattu/registrations" className="admin-btn admin-btn--primary">
        Open Registrations
      </Link>
    </div>
  );

  return (
    <PageShell
      title="JATTU Activity"
      description="Today’s gate movement and recent JATTU registration activity."
      headerActions={headerActions}
    >
      {error && (
        <div className="admin-alert admin-alert--danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section
        className="admin-fade-in"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}
      >
        <MetricCard icon="entryExit" iconColor="warning" label="Today Entries" value={stats?.todayEntries || 0} loading={loading} />
        <MetricCard icon="entryExit" iconColor="secondary" label="Today Exits" value={stats?.todayExits || 0} loading={loading} />
        <MetricCard icon="cameras" iconColor="accent" label="Inside Now" value={stats?.insideNow || 0} loading={loading} />
        <MetricCard icon="registrations" iconColor="primary" label="Total Registrations" value={stats?.totalRegistrations || 0} loading={loading} />
      </section>

      <Panel title="Registration Activity" meta="Latest JATTU records">
        <div className="admin-table-container" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem' }}>Loading…</td></tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    No JATTU registration activity yet.
                  </td>
                </tr>
              ) : (
                registrations.map((reg) => (
                  <tr key={reg._id}>
                    <td style={{ fontWeight: 600 }}>{reg.displayName || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{reg.registrationCode || '—'}</td>
                    <td>{statusLabel(reg.status)}</td>
                    <td>{reg.updatedAt ? formatDate(reg.updatedAt) : '—'}</td>
                    <td>{reg.createdAt ? formatDate(reg.createdAt) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
