'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import {
  filterShiftsNearCurrentTime,
  formatShiftWindow,
} from '@/lib/shiftTiming';

/**
 * ShiftPickerModal
 *
 * Shows after every successful gate entry when the role has isShiftBased = true
 * (shift breakdown). Operators must pick a shift on each gate check-in,
 * including mid-day re-entries after a gate exit.
 *
 * Only shifts starting within ±4 hours of the current IST time are offered
 * (e.g. at 8 AM only shifts starting between 4 AM and 12 PM). If none match,
 * the operator can reveal the full list as a fallback.
 *
 * Props:
 *   logId       – GateLog _id to patch once a shift is selected
 *   personName  – display name shown in the heading
 *   onConfirm(shiftId, shiftName) – called after the shift is saved
 *   onSkip()    – only when no active shifts exist (escape hatch)
 */
export default function ShiftPickerModal({ logId, personName, onConfirm, onSkip }) {
  const [shifts, setShifts] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.shifts
      .list({ isActive: 'true' })
      .then((data) => setShifts(data))
      .catch((e) => setError(e.message))
      .finally(() => setFetchLoading(false));
  }, []);

  const nearbyShifts = useMemo(() => filterShiftsNearCurrentTime(shifts), [shifts]);
  const hasHiddenShifts = nearbyShifts.length < shifts.length;
  const visibleShifts = showAll ? shifts : nearbyShifts;

  async function handleConfirm() {
    if (!selected) {
      setError('Please select a shift to continue.');
      return;
    }
    const shift = shifts.find((s) => s._id === selected);
    if (!shift) return;

    setLoading(true);
    setError('');
    try {
      await api.gate.attachShift(logId, shift._id, shift.name);
      onConfirm(shift._id, shift.name);
    } catch (e) {
      setError(e.message || 'Failed to save shift. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shift-picker-overlay" role="dialog" aria-modal="true" aria-label="Select shift">
      <div className="shift-picker-modal">
        <h3 className="shift-picker-modal__title">Select Shift</h3>
        <p className="shift-picker-modal__desc">
          <strong>{personName || 'This person'}</strong> is on a shift-breakdown role.
          Choose their shift for <strong>this gate entry</strong> (required on every check-in,
          including after a mid-day gate exit).
        </p>

        {fetchLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading shifts...</p>
        ) : shifts.length === 0 ? (
          <div>
            <p className="error-msg">
              No active shifts found. Create shifts in the Shifts section first.
            </p>
            <button type="button" className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={onSkip}>
              Continue without shift
            </button>
          </div>
        ) : (
          <>
            {visibleShifts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No shifts start within 4 hours of the current time.
              </p>
            ) : (
              <div className="shift-picker-modal__options">
                {visibleShifts.map((shift) => (
                  <label
                    key={shift._id}
                    className={`shift-picker-modal__option ${selected === shift._id ? 'shift-picker-modal__option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="shift"
                      value={shift._id}
                      checked={selected === shift._id}
                      onChange={() => { setSelected(shift._id); setError(''); }}
                    />
                    <div className="shift-picker-modal__option-body">
                      <span className="shift-picker-modal__option-name">{shift.name}</span>
                      {formatShiftWindow(shift.startTime, shift.endTime) && (
                        <span className="shift-picker-modal__option-desc">
                          {formatShiftWindow(shift.startTime, shift.endTime)}
                        </span>
                      )}
                      {shift.description && (
                        <span className="shift-picker-modal__option-desc">{shift.description}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {hasHiddenShifts && (
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => { setShowAll((v) => !v); setSelected(''); setError(''); }}
              >
                {showAll
                  ? 'Show only shifts near current time'
                  : `Show all shifts (${shifts.length})`}
              </button>
            )}

            {error && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</p>}

            <div className="shift-picker-modal__actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirm}
                disabled={loading || !selected}
              >
                {loading ? 'Saving...' : 'Confirm Shift'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
