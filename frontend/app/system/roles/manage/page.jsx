'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageSystemRolesPage() {
  const { can } = useAuth();
  const canWrite = can('system_roles', 'write');
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    setLoading(true);
    try {
      setRoles(await api.systemRoles.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete system role "${name}"?`)) return;
    try {
      await api.systemRoles.delete(id);
      await loadRoles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(role) {
    try {
      await api.systemRoles.update(role._id, { isActive: !role.isActive });
      await loadRoles();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading && roles.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system roles...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">System Roles</h3>
          <p className="section-desc">Manage roles and assign module privileges separately</p>
        </div>
        <WriteAccess module="system_roles">
          <Link href="/system/roles/create">
            <button type="button" className="btn-primary">+ New Role</button>
          </Link>
        </WriteAccess>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — system role changes require write access.</p>
      )}

      {roles.length === 0 ? (
        <div className="empty-state card">
          <p>No system roles yet.</p>
          <WriteAccess module="system_roles">
            <Link href="/system/roles/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create System Role
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
                  <th>Role</th>
                  <th>Description</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>{canWrite ? 'Actions' : 'View'}</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id} className={!role.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{role.name}</td>
                    <td>{role.description || '—'}</td>
                    <td>{role.userCount ?? 0}</td>
                    <td>
                      <span className={`badge ${role.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(role.createdAt)}</td>
                    <td className="actions-cell">
                      <Link href={`/system/roles/${role._id}/permissions`}>
                        <button type="button" className="btn-secondary">
                          {canWrite ? 'Assign Privileges' : 'View Privileges'}
                        </button>
                      </Link>
                      {canWrite && (
                        <>
                          <button type="button" className="btn-secondary" onClick={() => handleToggleActive(role)}>
                            {role.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" className="btn-danger" onClick={() => handleDelete(role._id, role.name)}>
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
