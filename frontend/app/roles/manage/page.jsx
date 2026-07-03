'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageRolesPage() {
  const { can } = useAuth();
  const canWriteRoles = can('registration_roles', 'write');
  const canWriteRegistrations = can('registrations', 'write');
  const showActions = canWriteRoles || canWriteRegistrations;
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    setLoading(true);
    try {
      setRoles(await api.roles.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return;
    try {
      await api.roles.delete(id);
      await loadRoles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(role) {
    try {
      await api.roles.update(role._id, { isActive: !role.isActive });
      await loadRoles();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading roles...</p>;
  }

  return (
    <div>
      {error && <p className="error-msg">{error}</p>}

      {!canWriteRoles && (
        <p className="read-only-banner">View only — role changes require write access.</p>
      )}

      {roles.length === 0 ? (
        <div className="empty-state card">
          <p>No roles created yet.</p>
          <WriteAccess module="registration_roles">
            <Link href="/roles/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create Your First Role
              </button>
            </Link>
          </WriteAccess>
        </div>
      ) : (
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h3>All Roles ({roles.length})</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Manage role forms, registrations, and activation status
            </p>
          </div>

          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Role Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  {showActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id} className={!role.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{role.name}</td>
                    <td>{role.description || '—'}</td>
                    <td>
                      <span className={`badge ${role.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(role.createdAt)}</td>
                    {showActions && (
                      <td className="actions-cell">
                        <WriteAccess module="registration_roles">
                          <Link href={`/roles/${role._id}/form`}>
                            <button type="button" className="btn-secondary">Edit Form</button>
                          </Link>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleToggleActive(role)}
                          >
                            {role.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDelete(role._id, role.name)}
                          >
                            Delete
                          </button>
                        </WriteAccess>
                        <WriteAccess module="registrations">
                          <Link href={`/registrations/register?role=${role._id}`}>
                            <button type="button" className="btn-primary">Register</button>
                          </Link>
                        </WriteAccess>
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
