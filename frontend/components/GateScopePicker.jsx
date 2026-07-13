'use client';

import AccessRulesPanel from '@/components/AccessRulesPanel';
import { makeEntryButtonLabel } from '@/lib/entryExit';

export default function GateScopePicker({
  scope,
  displayName,
  canGateWrite = true,
  onSelect,
  loading = false,
  error = '',
  showWelcome = true,
  welcomeHint = 'Select a gate or department below. Combined entry & exit gates detect entry or exit automatically from each person\'s status.',
  compact = false,
}) {
  const divisions = scope?.divisions || [];
  const gateDivisions = divisions.filter((d) => (d.gates || []).length > 0);
  const deptDivisions = divisions.filter((d) => (d.departments || []).length > 0);
  const hasGates = gateDivisions.length > 0;
  const hasDepartments = deptDivisions.length > 0;
  const hasScopeItems = hasGates || hasDepartments;

  return (
    <>
      {showWelcome && displayName && (
        <div className="gate-landing__welcome card">
          <p className="gate-landing__greeting">
            Welcome, <strong>{displayName}</strong>
          </p>
          <p className="gate-landing__hint">{welcomeHint}</p>
        </div>
      )}

      {!compact && <AccessRulesPanel compact />}

      {loading && <p className="gate-landing-loading">Loading your gates...</p>}
      {error && <p className="error-msg">{error}</p>}

      {!loading && !error && !hasScopeItems && (
        <div className="card gate-landing__empty">
          <p className="section-title">No gates or departments assigned</p>
          <p className="section-desc">
            Ask an administrator to assign division gates and/or departments in System Users access scope.
            Department-only access is supported — gate assignment is not required.
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
                      {gate.gateType === 'both' ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!canGateWrite}
                          onClick={() =>
                            onSelect({
                              scanType: 'gate',
                              divisionId: division._id,
                              gateId: gate._id,
                              eventType: 'auto',
                            })
                          }
                        >
                          {makeEntryButtonLabel('gate', 'auto')}
                        </button>
                      ) : (
                        (gate.allowedEvents || ['entry']).map((eventType) => (
                          <button
                            key={`${gate._id}-${eventType}`}
                            type="button"
                            className="btn-primary"
                            disabled={!canGateWrite}
                            onClick={() =>
                              onSelect({
                                scanType: 'gate',
                                divisionId: division._id,
                                gateId: gate._id,
                                eventType,
                              })
                            }
                          >
                            {makeEntryButtonLabel('gate', eventType)}
                          </button>
                        ))
                      )}
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
              <p className="access-scope-section__title" style={{ marginBottom: '0.75rem' }}>
                Departments
              </p>
              <ul className="gate-landing__gates">
                {division.departments.map((dept) => (
                  <li key={dept._id} className="gate-landing__gate">
                    <div className="gate-landing__gate-info">
                      <span className="gate-landing__gate-name">{dept.name}</span>
                      <span className="gate-landing__gate-type">Check-in / check-out</span>
                    </div>
                    <div className="gate-landing__gate-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!canGateWrite}
                        onClick={() =>
                          onSelect({
                            scanType: 'department',
                            divisionId: division._id,
                            departmentId: dept._id,
                            eventType: 'auto',
                          })
                        }
                      >
                        {makeEntryButtonLabel('department', 'auto')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!canGateWrite && hasScopeItems && (
        <p className="read-only-banner" style={{ marginTop: '1rem' }}>
          View only — gate actions require write access.
        </p>
      )}
    </>
  );
}
