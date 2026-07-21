'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import SystemUserDetailsModal from '@/components/SystemUserDetailsModal';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NewUserModal({ onClose, onComplete }) {
  const [roles, setRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [gates, setGates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [systemRoleId, setSystemRoleId] = useState('');
  const [divisionIds, setDivisionIds] = useState([]);
  const [gateIds, setGateIds] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.systemRoles.list(),
      api.divisions.list({ isActive: 'true' }),
      api.gates.list({ isActive: 'true' }),
      api.departments.list({ isActive: 'true' }),
    ])
      .then(([roleList, divisionList, gateList, departmentList]) => {
        const activeRoles = roleList.filter((r) => r.isActive);
        setRoles(activeRoles);
        setDivisions(divisionList);
        setGates(gateList);
        setDepartments(departmentList);
        if (activeRoles.length > 0) setSystemRoleId(activeRoles[0]._id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const scopedGates = useMemo(() => {
    if (divisionIds.length === 0) return [];
    const selected = new Set(divisionIds);
    return gates.filter((gate) => selected.has(gate.divisionId?._id || gate.divisionId));
  }, [gates, divisionIds]);

  const scopedDepartments = useMemo(() => {
    if (divisionIds.length === 0) return departments;
    const selected = new Set(divisionIds);
    return departments.filter((dept) =>
      (dept.divisionIds || []).some((div) => selected.has(div._id))
    );
  }, [departments, divisionIds]);

  function toggleDivision(id) {
    setDivisionIds((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
      // Remove gates/depts that no longer belong to selected divisions
      const allowedGateIds = new Set(gates.filter((g) => next.includes(g.divisionId?._id || g.divisionId)).map((g) => g._id));
      setGateIds((p) => p.filter((gid) => allowedGateIds.has(gid)));
      const allowedDeptIds = new Set(departments.filter((d) => (d.divisionIds || []).some((div) => next.includes(div._id))).map((d) => d._id));
      setDepartmentIds((p) => p.filter((did) => allowedDeptIds.has(did)));
      return next;
    });
  }

  function toggleGate(id) {
    setGateIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  }

  function toggleDepartment(id) {
    setDepartmentIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) return setError('Display name is required');
    if (!username.trim()) return setError('Username is required');
    if (!password || password.length < 6) return setError('Password must be at least 6 characters');
    if (!systemRoleId) return setError('System role is required');

    setLoading(true);
    setError('');

    try {
      const user = await api.systemUsers.create({
        displayName: displayName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        systemRoleId,
        divisionIds,
        gateIds,
        departmentIds,
      });
      onComplete(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const colStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    minWidth: 0,
  };

  const colHeaderStyle = {
    fontSize: '0.8rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    marginBottom: '0.75rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New System User"
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth: 980, width: '96vw', maxHeight: 'none', overflowY: 'visible' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New System User</h3>
              <p className="reg-details-modal__sub">Create a user, assign a role, and set access scope</p>
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} title="Close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body — 3-column layout */}
        <div className="reg-details-modal__body" style={{ overflowY: 'visible' }}>
          <form onSubmit={handleSubmit}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '0 1.5rem',
              alignItems: 'start',
            }}>

              {/* ── Col 1: Role details ── */}
              <div style={colStyle}>
                <p style={colHeaderStyle}>Role Details</p>

                <div className="form-group">
                  <label htmlFor="user-displayname">Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input id="user-displayname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. John Smith" autoFocus />
                </div>
                <div className="form-group">
                  <label htmlFor="user-email">Email</label>
                  <input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional email" />
                </div>
                <div className="form-group">
                  <label htmlFor="user-username">Username <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input id="user-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Login username" autoComplete="off" />
                </div>
                <div className="form-group">
                  <label htmlFor="user-password">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input id="user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label htmlFor="user-role">System Role <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select id="user-role" value={systemRoleId} onChange={(e) => setSystemRoleId(e.target.value)}>
                    <option value="">Select role...</option>
                    {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
                  </select>
                  {roles.length === 0 && (
                    <p className="field-hint">
                      No active roles. <Link href="/system/roles/manage" onClick={onClose}>Create a system role first.</Link>
                    </p>
                  )}
                </div>
              </div>

              {/* ── Col 2: Divisions & Departments ── */}
              <div style={colStyle}>
                <p style={colHeaderStyle}>Divisions & Departments</p>

                <div className="form-group">
                  <label>Divisions</label>
                  <p className="field-hint">Leave empty for no division scope restriction.</p>
                  {divisions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No divisions available.</p>
                  ) : (
                    <div className="checkbox-group">
                      {divisions.map((d) => (
                        <label key={d._id} className="checkbox-option">
                          <input type="checkbox" checked={divisionIds.includes(d._id)} onChange={() => toggleDivision(d._id)} />
                          <span>{d.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Departments</label>
                  <p className="field-hint">
                    {divisionIds.length === 0
                      ? 'Select divisions to filter departments, or assign departments only for check-in/check-out access.'
                      : 'Select departments for check-in/check-out. Gate assignment is optional.'}
                  </p>
                  {scopedDepartments.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {divisionIds.length === 0 ? 'No divisions selected.' : 'No departments in selected divisions.'}
                    </p>
                  ) : (
                    <div className="checkbox-group">
                      {scopedDepartments.map((dept) => (
                        <label key={dept._id} className="checkbox-option">
                          <input type="checkbox" checked={departmentIds.includes(dept._id)} onChange={() => toggleDepartment(dept._id)} />
                          <span>{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Col 3: Gates (only when divisions selected) ── */}
              <div style={colStyle}>
                <p style={colHeaderStyle}>Gates</p>
                {divisionIds.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem 1rem',
                    background: 'var(--bg-inset, #f9fafb)',
                    borderRadius: 'var(--radius)',
                    border: '1.5px dashed var(--border)',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    gap: '0.5rem',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }} aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <p style={{ fontSize: '0.85rem' }}>Select divisions to see available gates.</p>
                  </div>
                ) : scopedGates.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No gates in the selected divisions.
                  </p>
                ) : (
                  <div className="form-group">
                    <p className="field-hint">Optional — assign gates for entry/exit. Not required for department-only operators.</p>
                    <div className="checkbox-group">
                      {scopedGates.map((gate) => (
                        <label key={gate._id} className="checkbox-option">
                          <input type="checkbox" checked={gateIds.includes(gate._id)} onChange={() => toggleGate(gate._id)} />
                          <span>
                            {gate.name}
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.3rem' }}>
                              ({gate.divisionId?.name || 'Division'})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {error && <p className="error-msg" style={{ marginTop: '1rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
              <button type="submit" className="btn-primary" disabled={loading || roles.length === 0}>
                {loading ? 'Creating...' : 'Create System User'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ManageSystemUsersPage() {
  const { can } = useAuth();
  const canWrite = can('system_users', 'write');
  const canEditRole = can('system_roles', 'write');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);

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

  async function handleOpenUser(user) {
    setLoadingUser(true);
    setError('');
    try {
      const full = await api.systemUsers.get(user._id);
      setSelectedUser(full);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingUser(false);
    }
  }

  function handleUserSaved(updated) {
    setSelectedUser(updated);
    loadUsers();
  }

  function handleUserCreated() {
    setShowNewUserModal(false);
    loadUsers();
  }

  if (loading && users.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system users...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">System Users ({users.length})</h3>
          <p className="section-desc">Users with assigned roles and optional division, gate, and department access scope.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setShowNewUserModal(true)}
            aria-label="New User"
          >
            <PlusIcon />
            New
          </button>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — system user changes require write access.</p>
      )}

      {users.length === 0 ? (
        <div className="empty-state card">
          <p>No system users yet.</p>
          {canWrite && (
            <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowNewUserModal(true)}>
              Create System User
            </button>
          )}
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
                  <th>Divisions</th>
                  <th>Gates</th>
                  <th>Departments</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
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

                    {/* Divisions */}
                    <td>
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (user.divisionIds || []).length > 0 ? (
                        <div className="scope-badges-col">
                          {user.divisionIds.map((div) => (
                            <span key={div._id} className="badge badge-info">{div.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-13)' }}>null</span>
                      )}
                    </td>

                    {/* Gates */}
                    <td>
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (user.gateIds || []).length > 0 ? (
                        <div className="scope-badges-col">
                          {user.gateIds.map((gate) => (
                            <span key={gate._id} className="badge badge-success">{gate.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-13)' }}>null</span>
                      )}
                    </td>

                    {/* Departments */}
                    <td>
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (user.departmentIds || []).length > 0 ? (
                        <div className="scope-badges-col">
                          {user.departmentIds.map((dept) => (
                            <span key={dept._id} className="badge badge-warning">{dept.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-13)' }}>null</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</td>
                    <td className="actions-cell">
                      {!user.isSuperAdmin && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleOpenUser(user)}
                          title="Edit user details"
                          disabled={loadingUser}
                        >
                          Edit
                        </button>
                      )}
                      {canWrite && !user.isSuperAdmin && (
                        <>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => handleToggleActive(user)}>
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" className="btn-danger btn-sm" onClick={() => handleDelete(user._id, user.displayName)}>
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

      {selectedUser && (
        <SystemUserDetailsModal
          user={selectedUser}
          canWrite={canWrite}
          canEditRole={canEditRole}
          onClose={() => setSelectedUser(null)}
          onSaved={handleUserSaved}
        />
      )}

      {showNewUserModal && (
        <NewUserModal
          onClose={() => setShowNewUserModal(false)}
          onComplete={handleUserCreated}
        />
      )}
    </div>
  );
}
