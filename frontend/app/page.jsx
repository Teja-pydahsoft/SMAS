'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import PageShell from '@/components/PageShell';
import UserDashboardProfile from '@/components/UserDashboardProfile';
import WriteAccess from '@/components/WriteAccess';
import { useAuth } from '@/components/AuthProvider';
import { getAccessibleModules } from '@/lib/auth/routing';

export default function DashboardPage() {
  const { user, can, loading: authLoading } = useAuth();
  const [health, setHealth] = useState(null);
  const [roles, setRoles] = useState([]);
  const [registrations, setRegistrations] = useState([]);

  const canReadRoles = can('registration_roles', 'read');
  const canReadRegistrations = can('registrations', 'read');

  useEffect(() => {
    if (authLoading || !user) return;

    const tasks = [api.health().then(setHealth).catch(() => {})];
    if (canReadRoles) tasks.push(api.roles.list().then(setRoles).catch(() => {}));
    if (canReadRegistrations) tasks.push(api.registrations.list().then(setRegistrations).catch(() => {}));
    Promise.all(tasks);
  }, [authLoading, user, canReadRoles, canReadRegistrations]);

  if (authLoading || !user) {
    return <p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading your dashboard...</p>;
  }

  const verified = registrations.filter((r) => r.status === 'verified').length;
  const pending = registrations.filter((r) => r.status === 'pending_verification').length;
  const modules = getAccessibleModules(user);

  return (
    <PageShell
      title={`Welcome, ${user.displayName}`}
      description="Your personalized dashboard with profile, access scope, and privileges"
    >
      <UserDashboardProfile />

      {(canReadRoles || canReadRegistrations) && (
        <div className="grid-2" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <div className="card stat-card">
            <h3 style={{ marginBottom: '1rem' }}>Services</h3>
            <p>
              Backend: <span className="badge badge-success">Online</span>
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              AI Server:{' '}
              <span className={`badge ${health?.services?.ai === 'online' ? 'badge-success' : 'badge-danger'}`}>
                {health?.services?.ai || 'checking...'}
              </span>
            </p>
          </div>
          {canReadRegistrations && (
            <div className="card stat-card">
              <h3 style={{ marginBottom: '1rem' }}>Registration Stats</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {canReadRoles && (
                  <div>
                    <div className="stat-value">{roles.length}</div>
                    <div className="stat-label">Roles</div>
                  </div>
                )}
                <div>
                  <div className="stat-value">{verified}</div>
                  <div className="stat-label">Verified</div>
                </div>
                <div>
                  <div className="stat-value">{pending}</div>
                  <div className="stat-label">Pending</div>
                </div>
                <div>
                  <div className="stat-value">{registrations.length}</div>
                  <div className="stat-label">Total</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {modules.length > 0 && (
        <div className="card">
          <h3 className="section-title">Quick Actions</h3>
          <p className="section-desc" style={{ marginBottom: '1rem' }}>
            Actions available based on your write privileges
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <WriteAccess module="registration_roles">
              <Link href="/roles/create">
                <button type="button" className="btn-primary">Create Role</button>
              </Link>
            </WriteAccess>
            <WriteAccess module="registrations">
              <Link href="/registrations/register">
                <button type="button" className="btn-primary">Register Users</button>
              </Link>
            </WriteAccess>
            <WriteAccess module="gate">
              <Link href="/gate">
                <button type="button" className="btn-secondary">Gate Entry/Exit</button>
              </Link>
            </WriteAccess>
            {modules.map((m) => (
              <Link key={m.module} href={m.path}>
                <button type="button" className="btn-secondary">Open {m.label}</button>
              </Link>
            ))}
          </div>
        </div>
      )}

      <WriteAccess module="registrations">
        {roles.length > 0 && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3 className="section-title">Register by Role</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {roles.filter((r) => r.isActive).map((role) => (
                <Link key={role._id} href={`/registrations/register?role=${role._id}`}>
                  <button type="button" className="btn-primary">{role.name}</button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </WriteAccess>
    </PageShell>
  );
}
