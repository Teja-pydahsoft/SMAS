'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

function NewDepartmentModal({ onClose, onComplete, preselectedDivision }) {
  const [divisions, setDivisions] = useState([]);
  const [divisionIds, setDivisionIds] = useState(preselectedDivision ? [preselectedDivision] : []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.divisions
      .list({ isActive: 'true' })
      .then(setDivisions)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (preselectedDivision) {
      setDivisionIds((prev) =>
        prev.includes(preselectedDivision) ? prev : [...prev, preselectedDivision]
      );
    }
  }, [preselectedDivision]);

  function toggleDivision(id) {
    setDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (divisionIds.length === 0) {
      setError('Please select at least one division');
      return;
    }
    if (!name.trim()) {
      setError('Department name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const department = await api.departments.create({
        divisionIds,
        name: name.trim(),
        description: description.trim(),
      });
      onComplete(department);
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
      aria-label="New Department"
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth: 550, width: '95vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New Department</h3>
              <p className="reg-details-modal__sub">Create a department and link it to divisions</p>
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
              <label htmlFor="dept-name">
                Department Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HR, IT, Security, Finance"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="dept-description">Description</label>
              <input
                id="dept-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="form-group">
              <label>
                Divisions <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <p className="field-hint">
                Select all divisions this department belongs to
              </p>
              {divisions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No divisions yet.{' '}
                  <Link href="/divisions/create" onClick={onClose}>Create a division first</Link>
                  {' '}before adding departments.
                </p>
              ) : (
                <div className="checkbox-group">
                  {divisions.map((d) => (
                    <label key={d._id} className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={divisionIds.includes(d._id)}
                        onChange={() => toggleDivision(d._id)}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="error-msg">{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn-primary" disabled={loading || divisions.length === 0}>
                {loading ? 'Creating...' : 'Create Department'}
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

export default function ManageDepartmentsPage() {
  const { can } = useAuth();
  const canWrite = can('departments', 'write');
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewDepartmentModal, setShowNewDepartmentModal] = useState(false);

  useEffect(() => {
    api.divisions.list().then(setDivisions).catch(() => {});
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [divisionFilter]);

  async function loadDepartments() {
    setLoading(true);
    try {
      const params = {};
      if (divisionFilter) params.divisionId = divisionFilter;
      setDepartments(await api.departments.list(params));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete department "${name}"?`)) return;
    try {
      await api.departments.delete(id);
      await loadDepartments();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(department) {
    try {
      await api.departments.update(department._id, { isActive: !department.isActive });
      await loadDepartments();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleDepartmentCreated() {
    setShowNewDepartmentModal(false);
    loadDepartments();
  }

  if (loading && departments.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading departments...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Departments ({departments.length})</h3>
          <p className="section-desc">Departments linked to their divisions</p>
        </div>
        <div className="reports-section-actions">
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            aria-label="Filter by division"
          >
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => setShowNewDepartmentModal(true)}
              aria-label="New Department"
            >
              <PlusIcon />
              New
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — department changes require write access.</p>
      )}

      {departments.length === 0 ? (
        <div className="empty-state card">
          <p>No departments yet.</p>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => setShowNewDepartmentModal(true)}
            >
              Create Department
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Divisions</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept._id} className={!dept.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{dept.name}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {(dept.divisionIds || []).length > 0
                          ? dept.divisionIds.map((div) => (
                              <span key={div._id} className="badge badge-info">
                                {div.name}
                              </span>
                            ))
                          : '—'}
                      </div>
                    </td>
                    <td>{dept.description || '—'}</td>
                    <td>
                      <span className={`badge ${dept.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(dept.createdAt)}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button type="button" className="btn-secondary" onClick={() => handleToggleActive(dept)}>
                          {dept.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="btn-danger" onClick={() => handleDelete(dept._id, dept.name)}>
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

      {showNewDepartmentModal && (
        <NewDepartmentModal
          onClose={() => setShowNewDepartmentModal(false)}
          onComplete={handleDepartmentCreated}
        />
      )}
    </div>
  );
}
