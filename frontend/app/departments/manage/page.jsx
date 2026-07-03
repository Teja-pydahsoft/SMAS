'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageDepartmentsPage() {
  const { can } = useAuth();
  const canWrite = can('departments', 'write');
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  if (loading && departments.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading departments...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Departments</h3>
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
          <Link href="/departments/create">
            <WriteAccess module="departments">
              <button type="button" className="btn-primary">+ New Department</button>
            </WriteAccess>
          </Link>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — department changes require write access.</p>
      )}

      {departments.length === 0 ? (
        <div className="empty-state card">
          <p>No departments yet.</p>
          <WriteAccess module="departments">
            <Link href="/departments/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create Department
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
    </div>
  );
}
