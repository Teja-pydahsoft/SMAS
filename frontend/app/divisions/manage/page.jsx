'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageDivisionsPage() {
  const { can } = useAuth();
  const canWrite = can('divisions', 'write');
  const [divisions, setDivisions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDivisions();
  }, []);

  async function loadDivisions() {
    setLoading(true);
    try {
      setDivisions(await api.divisions.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete division "${name}" and all its gates and departments? This cannot be undone.`)) return;
    try {
      await api.divisions.delete(id);
      await loadDivisions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(division) {
    try {
      await api.divisions.update(division._id, { isActive: !division.isActive });
      await loadDivisions();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading divisions...</p>;
  }

  return (
    <div>
      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — division changes require write access.</p>
      )}

      {divisions.length === 0 ? (
        <div className="empty-state card">
          <p>No divisions created yet.</p>
          <WriteAccess module="divisions">
            <Link href="/divisions/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create Your First Division
              </button>
            </Link>
          </WriteAccess>
        </div>
      ) : (
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h3>All Divisions ({divisions.length})</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Manage divisions, gate counts, and activation status
            </p>
          </div>

          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Division</th>
                  <th>Description</th>
                  <th>Gates</th>
                  <th>Departments</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>{canWrite ? 'Actions' : 'View'}</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((division) => (
                  <tr key={division._id} className={!division.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{division.name}</td>
                    <td>{division.description || '—'}</td>
                    <td>
                      {division.activeGateCount ?? division.gateCount ?? 0} active
                      {' / '}
                      {division.gateCount ?? 0} total
                    </td>
                    <td>
                      {division.activeDepartmentCount ?? division.departmentCount ?? 0} active
                      {' / '}
                      {division.departmentCount ?? 0} total
                    </td>
                    <td>
                      <span className={`badge ${division.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {division.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(division.createdAt)}</td>
                    <td className="actions-cell">
                      <Link href={`/divisions/${division._id}`}>
                        <button type="button" className="btn-secondary">
                          {canWrite ? 'Manage Gates' : 'View Gates'}
                        </button>
                      </Link>
                      <WriteAccess module="departments">
                        <Link href={`/departments/create?division=${division._id}`}>
                          <button type="button" className="btn-secondary">Add Department</button>
                        </Link>
                      </WriteAccess>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleToggleActive(division)}
                          >
                            {division.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDelete(division._id, division.name)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
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
