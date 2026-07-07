'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageShiftsPage() {
  const { can } = useAuth();
  const canWrite = can('shifts', 'write');

  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  if (loading && shifts.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading shifts...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Shifts</h3>
          <p className="section-desc">Shifts available for role-based scheduling</p>
        </div>
        <div className="reports-section-actions">
          <WriteAccess module="shifts">
            <Link href="/shifts/create">
              <button type="button" className="btn-primary">+ New Shift</button>
            </Link>
          </WriteAccess>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — shift changes require write access.</p>
      )}

      {shifts.length === 0 ? (
        <div className="empty-state card">
          <p>No shifts created yet.</p>
          <WriteAccess module="shifts">
            <Link href="/shifts/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create Your First Shift
              </button>
            </Link>
          </WriteAccess>
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
    </div>
  );
}
