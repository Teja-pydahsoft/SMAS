'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  welcomeHint = 'Select a division first, then choose the department (or gate) to open. Combined entry & exit gates detect entry or exit automatically from each person\'s status.',
  compact = false,
}) {
  const divisions = scope?.divisions || [];
  const gateDivisions = divisions.filter((d) => (d.gates || []).length > 0);
  const deptDivisions = divisions.filter((d) => (d.departments || []).length > 0);
  const hasGates = gateDivisions.length > 0;
  const hasDepartments = deptDivisions.length > 0;
  const hasScopeItems = hasGates || hasDepartments;

  const [departmentPickerDivision, setDepartmentPickerDivision] = useState(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!departmentPickerDivision) return undefined;

    function onKeyDown(e) {
      if (e.key === 'Escape') setDepartmentPickerDivision(null);
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [departmentPickerDivision]);

  function selectDepartment(division, dept) {
    setDepartmentPickerDivision(null);
    onSelect({
      scanType: 'department',
      divisionId: division._id,
      departmentId: dept._id,
      eventType: 'auto',
    });
  }

  const departmentModal =
    portalReady &&
    departmentPickerDivision &&
    createPortal(
      <div
        className="pass-modal-overlay gate-landing__dept-overlay"
        onClick={() => setDepartmentPickerDivision(null)}
        role="dialog"
        aria-modal="true"
        aria-label={`Select department in ${departmentPickerDivision.name}`}
      >
        <div
          className="details-modal gate-landing__dept-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="details-modal-header">
            <div>
              <h3>{departmentPickerDivision.name}</h3>
              <p className="details-modal-sub">Select the department to proceed</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDepartmentPickerDivision(null)}
            >
              Close
            </button>
          </div>
          <div className="details-modal-body gate-landing__dept-modal-body">
            <ul className="gate-landing__gates">
              {(departmentPickerDivision.departments || []).map((dept) => (
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
                      onClick={() => selectDepartment(departmentPickerDivision, dept)}
                    >
                      {makeEntryButtonLabel('department', 'auto')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>,
      document.body
    );

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
        <div
          className="gate-landing__list gate-landing__division-picker"
          style={{ marginTop: hasGates ? '1rem' : 0 }}
        >
          <p className="gate-landing__picker-hint">
            Select a division first, then choose the department to open.
          </p>
          <div className="gate-landing__division-grid">
            {deptDivisions.map((division) => {
              const deptCount = (division.departments || []).length;
              return (
                <button
                  key={`dept-div-${division._id}`}
                  type="button"
                  className="card gate-landing__division-card"
                  disabled={!canGateWrite}
                  onClick={() => setDepartmentPickerDivision(division)}
                >
                  <span className="gate-landing__division-card-name">{division.name}</span>
                  <span className="gate-landing__division-card-meta">
                    {deptCount} department{deptCount === 1 ? '' : 's'}
                  </span>
                  <span className="gate-landing__division-card-action">Choose department →</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!canGateWrite && hasScopeItems && (
        <p className="read-only-banner" style={{ marginTop: '1rem' }}>
          View only — gate actions require write access.
        </p>
      )}

      {departmentModal}
    </>
  );
}
