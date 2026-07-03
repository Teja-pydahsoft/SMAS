'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function ManageSystemUsersPage() {
  const { can } = useAuth();
  const canWrite = can('system_users', 'write');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await api.systemUsers.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete system user "${name}"?`)) return;
    try {
      await api.systemUsers.delete(id);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(user) {
    try {
      await api.systemUsers.update(user._id, { isActive: !user.isActive });
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading && users.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system users...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">System Users</h3>
          <p className="section-desc">
            Users with assigned roles and optional division, gate, and department access scope. Super admin has no restrictions.
          </p>
        </div>
        <WriteAccess module="system_users">
          <Link href="/system/users/create">
            <button type="button" className="btn-primary">+ New User</button>
          </Link>
        </WriteAccess>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — system user changes require write access.</p>
      )}

      {users.length === 0 ? (
        <div className="empty-state card">
          <p>No system users yet.</p>
          <WriteAccess module="system_users">
            <Link href="/system/users/create">
              <button type="button" className="btn-primary" style={{ marginTop: '1rem' }}>
                Create System User
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
                  <th>User</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Access Scope</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className={!user.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">
                      {user.displayName}
                      {user.isSuperAdmin && (
                        <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>Super Admin</span>
                      )}
                    </td>
                    <td>{user.username}</td>
                    <td>{user.isSuperAdmin ? 'Unrestricted' : user.systemRoleId?.name || '—'}</td>
                    <td>
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All divisions, gates & departments</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {(user.divisionIds || []).map((div) => (
                            <span key={div._id} className="badge badge-info">{div.name}</span>
                          ))}
                          {(user.gateIds || []).map((gate) => (
                            <span key={gate._id} className="badge badge-success">{gate.name}</span>
                          ))}
                          {(user.departmentIds || []).map((dept) => (
                            <span key={dept._id} className="badge badge-warning">{dept.name}</span>
                          ))}
                          {!user.divisionIds?.length && !user.gateIds?.length && !user.departmentIds?.length && '—'}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        {!user.isSuperAdmin && (
                          <>
                            <button type="button" className="btn-secondary" onClick={() => handleToggleActive(user)}>
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleDelete(user._id, user.displayName)}
                            >
                              Delete
                            </button>
                          </>
                        )}
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
