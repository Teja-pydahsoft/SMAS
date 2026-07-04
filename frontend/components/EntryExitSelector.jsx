'use client';

import { useEffect, useMemo, useState } from 'react';
import { eventActionLabel, isAutoGateEvent } from '@/lib/entryExit';

function emptySelection() {
  return {
    scanType: 'gate',
    divisionId: '',
    gateId: '',
    departmentId: '',
    eventType: 'entry',
  };
}

export default function EntryExitSelector({ divisions, value, onApply, disabled }) {
  const [draft, setDraft] = useState(value || emptySelection());

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const divisionOptions = useMemo(() => {
    if (draft.scanType === 'department') {
      return divisions.filter((d) => (d.departments || []).length > 0);
    }
    return divisions.filter((d) => (d.gates || []).length > 0);
  }, [divisions, draft.scanType]);

  const selectedDivision = useMemo(
    () => divisionOptions.find((d) => d._id === draft.divisionId) || null,
    [divisionOptions, draft.divisionId]
  );

  const gateOptions = selectedDivision?.gates || [];
  const departmentOptions = selectedDivision?.departments || [];

  const selectedGate = useMemo(
    () => gateOptions.find((g) => g._id === draft.gateId) || null,
    [gateOptions, draft.gateId]
  );

  const eventOptions = useMemo(() => {
    if (draft.scanType === 'department') return ['entry', 'exit'];
    return selectedGate?.allowedEvents || ['entry', 'exit'];
  }, [draft.scanType, selectedGate]);

  function updateDraft(patch) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };

      if (patch.scanType && patch.scanType !== prev.scanType) {
        next.divisionId = '';
        next.gateId = '';
        next.departmentId = '';
        next.eventType = 'entry';
      }

      if (patch.divisionId !== undefined && patch.divisionId !== prev.divisionId) {
        next.gateId = '';
        next.departmentId = '';
        next.eventType = 'entry';
      }

      if (patch.gateId !== undefined && patch.gateId !== prev.gateId) {
        const gate = gateOptions.find((g) => g._id === patch.gateId);
        next.eventType = gate?.gateType === 'both' ? 'auto' : 'entry';
      }

      return next;
    });
  }

  useEffect(() => {
    if (disabled) return;

    const hasDivision = Boolean(draft.divisionId);
    const hasTarget =
      draft.scanType === 'gate' ? Boolean(draft.gateId) : Boolean(draft.departmentId);
    const hasEvent = eventOptions.includes(draft.eventType);

    if (!hasDivision || !hasTarget || !hasEvent) return;

    const payload = {
      scanType: draft.scanType,
      divisionId: draft.divisionId,
      eventType: draft.eventType,
      ...(draft.scanType === 'gate'
        ? { gateId: draft.gateId }
        : { departmentId: draft.departmentId }),
    };

    const sameAsValue =
      value &&
      value.scanType === payload.scanType &&
      value.divisionId === payload.divisionId &&
      value.eventType === payload.eventType &&
      (payload.scanType === 'gate'
        ? value.gateId === payload.gateId
        : value.departmentId === payload.departmentId);

    if (!sameAsValue) onApply(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onApply is stable from parent useCallback
  }, [draft, disabled, eventOptions, value]);

  useEffect(() => {
    if (!eventOptions.includes(draft.eventType)) {
      setDraft((prev) => ({ ...prev, eventType: eventOptions[0] || 'entry' }));
    }
  }, [draft.eventType, eventOptions]);

  const selectionReady =
    draft.divisionId &&
    (draft.scanType === 'gate' ? draft.gateId : draft.departmentId) &&
    eventOptions.includes(draft.eventType);

  return (
    <div className="card entry-exit-selector">
      <h3 className="section-title">Select access point</h3>
      <p className="section-desc">Choose division, gate or department, and action — scanning starts once all fields are set.</p>

      <div className="entry-exit-selector__type">
        <span className="entry-exit-selector__type-label">Scan type</span>
        <div className="sub-nav entry-exit-selector__tabs">
          {['gate', 'department'].map((type) => (
            <button
              key={type}
              type="button"
              className={`sub-nav-item ${draft.scanType === type ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => updateDraft({ scanType: type })}
            >
              {type === 'gate' ? 'Gate' : 'Department'}
            </button>
          ))}
        </div>
      </div>

      <div className="gate-select-grid">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="entry-exit-division">Division</label>
          <select
            id="entry-exit-division"
            value={draft.divisionId}
            disabled={disabled || divisionOptions.length === 0}
            onChange={(e) => updateDraft({ divisionId: e.target.value })}
          >
            <option value="">Select division</option>
            {divisionOptions.map((division) => (
              <option key={division._id} value={division._id}>
                {division.name}
              </option>
            ))}
          </select>
        </div>

        {draft.scanType === 'gate' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="entry-exit-gate">Gate</label>
            <select
              id="entry-exit-gate"
              value={draft.gateId}
              disabled={disabled || !draft.divisionId || gateOptions.length === 0}
              onChange={(e) => updateDraft({ gateId: e.target.value })}
            >
              <option value="">Select gate</option>
              {gateOptions.map((gate) => (
                <option key={gate._id} value={gate._id}>
                  {gate.name}
                  {gate.gateType === 'entry'
                    ? ' (Entry)'
                    : gate.gateType === 'exit'
                      ? ' (Exit)'
                      : ' (Entry & exit)'}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="entry-exit-department">Department</label>
            <select
              id="entry-exit-department"
              value={draft.departmentId}
              disabled={disabled || !draft.divisionId || departmentOptions.length === 0}
              onChange={(e) => updateDraft({ departmentId: e.target.value })}
            >
              <option value="">Select department</option>
              {departmentOptions.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {draft.scanType === 'gate' && isAutoGateEvent(draft.eventType) ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Action</label>
            <p className="entry-exit-selector__auto-hint field-hint" style={{ marginTop: '0.35rem' }}>
              Entry or exit is chosen automatically from each person&apos;s current division status.
            </p>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="entry-exit-event">Action</label>
            <select
              id="entry-exit-event"
              value={draft.eventType}
              disabled={disabled || !draft.divisionId}
              onChange={(e) => updateDraft({ eventType: e.target.value })}
            >
              {eventOptions.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventActionLabel(draft.scanType, eventType)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {divisionOptions.length === 0 && (
        <p className="field-hint">No {draft.scanType === 'gate' ? 'gates' : 'departments'} configured yet.</p>
      )}

      {selectionReady && (
        <p className="entry-exit-selector__ready">
          Ready to scan —{' '}
          {isAutoGateEvent(draft.eventType) && draft.scanType === 'gate'
            ? 'auto entry / exit'
            : eventActionLabel(draft.scanType, draft.eventType)}{' '}
          at{' '}
          <strong>
            {draft.scanType === 'gate'
              ? selectedGate?.name
              : departmentOptions.find((d) => d._id === draft.departmentId)?.name}
          </strong>
        </p>
      )}
    </div>
  );
}
