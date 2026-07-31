'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import {
  formatDurationHours,
  formatShiftHoursLabel,
  getShiftDurationHours,
  validateShiftMinHours,
} from '@/lib/shiftTiming';
import { useAuth } from '@/components/AuthProvider';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function formatMinHours(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}h`;
}

function NewShiftModal({ onClose, onComplete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [halfDayMinHours, setHalfDayMinHours] = useState('');
  const [fullDayMinHours, setFullDayMinHours] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const parsedTotal = totalHours === '' ? null : Number(totalHours);
  const totalHoursLabel =
    parsedTotal != null && Number.isFinite(parsedTotal)
      ? formatDurationHours(parsedTotal)
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Shift name is required');
      return;
    }
    if (totalHours === '' || parsedTotal == null || !Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setError('Total hours is required');
      return;
    }

    const halfDay = halfDayMinHours === '' ? null : Number(halfDayMinHours);
    const fullDay = fullDayMinHours === '' ? null : Number(fullDayMinHours);
    const timingError = validateShiftMinHours({
      totalHours: parsedTotal,
      halfDayMinHours: halfDayMinHours === '' ? null : halfDay,
      fullDayMinHours: fullDayMinHours === '' ? null : fullDay,
    });
    if (timingError) {
      setError(timingError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const shift = await api.shifts.create({
        name: name.trim(),
        description: description.trim(),
        totalHours: parsedTotal,
        halfDayMinHours: halfDay,
        fullDayMinHours: fullDay,
      });
      onComplete(shift);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New Shift"
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth: 580, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New Shift</h3>
              <p className="reg-details-modal__sub">Create a shift with total hours and minimum hours</p>
            </div>
          </div>
          <button
            type="button"
            className="reg-details-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reg-details-modal__body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="shift-name">
                Shift Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="shift-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Shift, Afternoon Shift, Night Shift"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="shift-description">Description</label>
              <input
                id="shift-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this shift"
              />
            </div>

            <div className="form-group">
              <label htmlFor="shift-total">
                Total Hours <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="shift-total"
                type="number"
                min="0.5"
                step="0.5"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                placeholder="e.g. 8"
                required
              />
            </div>

            {totalHoursLabel && (
              <p style={{ margin: '-0.25rem 0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Shift total hours: <strong style={{ color: 'var(--text)' }}>{totalHoursLabel}h</strong>
                {' '}— half/full day minimums cannot exceed this.
              </p>
            )}

            <div className="form-two-col-grid">
              <div className="form-group">
                <label htmlFor="shift-half-day">Half Day Minimum Hours</label>
                <input
                  id="shift-half-day"
                  type="number"
                  min="0"
                  max={parsedTotal ?? undefined}
                  step="0.5"
                  value={halfDayMinHours}
                  onChange={(e) => setHalfDayMinHours(e.target.value)}
                  placeholder={totalHoursLabel ? `max ${totalHoursLabel}` : 'e.g. 4'}
                />
              </div>
              <div className="form-group">
                <label htmlFor="shift-full-day">Full Day Minimum Hours</label>
                <input
                  id="shift-full-day"
                  type="number"
                  min="0"
                  max={parsedTotal ?? undefined}
                  step="0.5"
                  value={fullDayMinHours}
                  onChange={(e) => setFullDayMinHours(e.target.value)}
                  placeholder={totalHoursLabel ? `max ${totalHoursLabel}` : 'e.g. 8'}
                />
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Shift'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ManageShiftsPage() {
  const { can } = useAuth();
  const canWrite = can('shifts', 'write');

  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setLoading(true);
    try {
      setShifts(await api.shifts.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete shift "${name}"? This cannot be undone.`)) return;
    try {
      await api.shifts.delete(id);
      await loadShifts();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(shift) {
    try {
      await api.shifts.update(shift._id, { isActive: !shift.isActive });
      await loadShifts();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleShiftCreated() {
    setShowNewShiftModal(false);
    loadShifts();
  }

  if (loading && shifts.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading shifts...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Shifts ({shifts.length})</h3>
          <p className="section-desc">Shifts available for role-based scheduling</p>
        </div>
        <div className="reports-section-actions">
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => setShowNewShiftModal(true)}
              aria-label="New Shift"
            >
              <PlusIcon />
              New
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — shift changes require write access.</p>
      )}

      {shifts.length === 0 ? (
        <div className="empty-state card">
          <p>No shifts created yet.</p>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => setShowNewShiftModal(true)}
            >
              Create Your First Shift
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Total Hours</th>
                  <th>Half Day</th>
                  <th>Full Day</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift._id} className={!shift.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">
                      <div>{shift.name}</div>
                      {shift.description ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {shift.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatShiftHoursLabel(shift) || formatMinHours(getShiftDurationHours(shift))}</td>
                    <td>{formatMinHours(shift.halfDayMinHours)}</td>
                    <td>{formatMinHours(shift.fullDayMinHours)}</td>
                    <td>
                      <span
                        className={`badge ${shift.isActive ? 'badge-success' : 'badge-danger'}`}
                      >
                        {shift.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(shift.createdAt)}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleToggleActive(shift)}
                        >
                          {shift.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => handleDelete(shift._id, shift.name)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewShiftModal && (
        <NewShiftModal
          onClose={() => setShowNewShiftModal(false)}
          onComplete={handleShiftCreated}
        />
      )}
    </div>
  );
}
