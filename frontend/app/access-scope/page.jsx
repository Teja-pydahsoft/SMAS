'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import { buildEntryExitUrl, makeEntryButtonLabel } from '@/lib/entryExit';
import { clearGateFlowState, setGateSession } from '@/lib/gateSession';
import { getDashboardRoute, hasAssignedEntryExitScope } from '@/lib/auth/routing';
import AccessRulesPanel from '@/components/AccessRulesPanel';

export default function AccessScopePage() {
  const router = useRouter();
  const { user, can, logout, loading: authLoading } = useAuth();
  const [scope, setScope] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canGate = can('gate', 'write');

  useEffect(() => {
    if (authLoading || !user) return;
    if (!hasAssignedEntryExitScope(user) && !user.isSuperAdmin) {
      router.replace(getDashboardRoute());
      return;
    }
    clearGateFlowState();
    api.auth
      .accessScope()
      .then(setScope)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="gate-landing-shell">
        <p className="gate-landing-loading">Loading your gates...</p>
      </div>
    );
  }

  const divisions = scope?.divisions || [];
  const gateDivisions = divisions.filter((d) => (d.gates || []).length > 0);
  const deptDivisions = divisions.filter((d) => (d.departments || []).length > 0);
  const hasGates = gateDivisions.length > 0;
  const hasDepartments = deptDivisions.length > 0;
  const hasScopeItems = hasGates || hasDepartments;

  function startGateSession(params) {
    setGateSession(params);
    router.push(buildEntryExitUrl(params));
  }

  return (
    <div className="gate-landing-shell">
      <div className="gate-landing">
        <header className="gate-landing__header">
          <div className="gate-landing__brand">
            <span className="brand-icon">S</span>
            <div>
              <h1>SMAS</h1>
              <p>Gate Access</p>
            </div>
          </div>
          <button type="button" className="btn-secondary gate-landing__signout" onClick={logout}>
            Sign Out
          </button>
        </header>

        <div className="gate-landing__welcome card">
          <p className="gate-landing__greeting">Welcome, <strong>{user.displayName}</strong></p>
          <p className="gate-landing__hint">
            Select a gate or department below to start entry or exit scanning.
          </p>
        </div>

        <AccessRulesPanel compact />

        {loading && <p className="gate-landing-loading">Loading division gates...</p>}
        {error && <p className="error-msg">{error}</p>}

        {!loading && !error && !hasScopeItems && (
          <div className="card gate-landing__empty">
            <p className="section-title">No gates assigned</p>
            <p className="section-desc">
              Ask an administrator to assign division gates or departments to your account.
            </p>
          </div>
        )}

        {!loading && !error && hasGates && (
          <div className="gate-landing__list">
            {gateDivisions.map((division) => (
              <section key={division._id} className="card gate-landing__division">
                <h2 className="gate-landing__division-name">{division.name}</h2>
                <ul className="gate-landing__gates">
                  {division.gates.map((gate) => (
                    <li key={gate._id} className="gate-landing__gate">
                      <div className="gate-landing__gate-info">
                        <span className="gate-landing__gate-name">{gate.name}</span>
                        <span className="gate-landing__gate-type">
                          {gate.gateType === 'entry'
                            ? 'Entry gate'
                            : gate.gateType === 'exit'
                              ? 'Exit gate'
                              : 'Entry & exit'}
                        </span>
                      </div>
                      <div className="gate-landing__gate-actions">
                        {(gate.allowedEvents || ['entry']).map((eventType) => (
                          <button
                            key={`${gate._id}-${eventType}`}
                            type="button"
                            className="btn-primary"
                            disabled={!canGate}
                            onClick={() =>
                              startGateSession({
                                scanType: 'gate',
                                divisionId: division._id,
                                gateId: gate._id,
                                eventType,
                              })
                            }
                          >
                            {makeEntryButtonLabel('gate', eventType)}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!loading && !error && hasDepartments && (
          <div className="gate-landing__list" style={{ marginTop: hasGates ? '1rem' : 0 }}>
            {deptDivisions.map((division) => (
              <section key={`dept-${division._id}`} className="card gate-landing__division">
                <h2 className="gate-landing__division-name">{division.name}</h2>
                <p className="access-scope-section__title" style={{ marginBottom: '0.75rem' }}>Departments</p>
                <ul className="gate-landing__gates">
                  {division.departments.map((dept) => (
                    <li key={dept._id} className="gate-landing__gate">
                      <div className="gate-landing__gate-info">
                        <span className="gate-landing__gate-name">{dept.name}</span>
                        <span className="gate-landing__gate-type">Check-in / check-out</span>
                      </div>
                      <div className="gate-landing__gate-actions">
                        {['entry', 'exit'].map((eventType) => (
                          <button
                            key={`${dept._id}-${eventType}`}
                            type="button"
                            className={eventType === 'entry' ? 'btn-primary' : 'btn-secondary'}
                            disabled={!canGate}
                            onClick={() =>
                              startGateSession({
                                scanType: 'department',
                                divisionId: division._id,
                                departmentId: dept._id,
                                eventType,
                              })
                            }
                          >
                            {makeEntryButtonLabel('department', eventType)}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!canGate && hasScopeItems && (
          <p className="read-only-banner" style={{ marginTop: '1rem' }}>
            View only — gate actions require write access.
          </p>
        )}
      </div>
    </div>
  );
}
