'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NewShiftModal({ onClose, onComplete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Shift name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const shift = await api.shifts.create({
        name: name.trim(),
        description: description.trim(),
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
        style={{ maxWidth: 500, width: '95vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New Shift</h3>
              <p className="reg-details-modal__sub">Create a new shift for role-based scheduling</p>
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

        {/* Body */}
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
                placeholder="e.g. 6:00 AM – 2:00 PM"
              />
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
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift._id} className={!shift.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{shift.name}</td>
                    <td>{shift.description || '—'}</td>
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
