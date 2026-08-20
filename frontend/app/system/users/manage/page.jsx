'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import SystemUserDetailsModal from '@/components/SystemUserDetailsModal';
import GateAccessPicker, { gateModeBadgeLabel } from '@/components/GateAccessPicker';
import ScopeOverflowCell from '@/components/ScopeOverflowCell';
import DepartmentPicker from '@/components/DepartmentPicker';

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
  const [gateAccessModes, setGateAccessModes] = useState({});
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
      setGateAccessModes((prevModes) => {
        const cleaned = {};
        for (const [gid, mode] of Object.entries(prevModes)) {
          if (allowedGateIds.has(gid)) cleaned[gid] = mode;
        }
        return cleaned;
      });
      const allowedDeptIds = new Set(departments.filter((d) => (d.divisionIds || []).some((div) => next.includes(div._id))).map((d) => d._id));
      setDepartmentIds((p) => p.filter((did) => allowedDeptIds.has(did)));
      return next;
    });
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
        gateAccessModes,
        departmentIds,
      });
      onComplete(user);
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
      aria-label="New System User"
    >
      <div
        className="reg-details-modal su-modal su-modal--create"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <span className="reg-details-modal__icon">
              <PlusIcon />
            </span>
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

        <form onSubmit={handleSubmit}>
          <div className="reg-details-modal__body">
            <div className="su-account-panel">
              <p className="su-create-col__title">Account</p>
              <div className="su-account-grid">
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
            </div>

            <div className="su-create-grid">
              <div className="su-create-col">
                <p className="su-create-col__title">Divisions</p>
                <p className="su-hint">Leave empty for no division restriction.</p>
                {divisions.length === 0 ? (
                  <p className="scope-empty">No divisions available.</p>
                ) : (
                  <div className="checkbox-group su-scroll-list su-scroll-list--dept">
                    {divisions.map((d) => (
                      <label key={d._id} className="checkbox-option">
                        <input type="checkbox" checked={divisionIds.includes(d._id)} onChange={() => toggleDivision(d._id)} />
                        <span>{d.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="su-create-col">
                <p className="su-create-col__title">Departments</p>
                <p className="su-hint">
                  {divisionIds.length === 0
                    ? 'Search and assign departments for check-in/check-out. Gate assignment is optional.'
                    : 'Search and select departments for check-in/check-out.'}
                </p>
                <DepartmentPicker
                  departments={scopedDepartments}
                  selectedIds={departmentIds}
                  onToggle={toggleDepartment}
                  emptyMessage={divisionIds.length === 0 ? 'No departments available.' : 'No departments in selected divisions.'}
                />
              </div>

              <div className="su-create-col">
                <p className="su-create-col__title">Gates</p>
                {divisionIds.length === 0 ? (
                  <div className="su-empty-scope">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }} aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <p>Select divisions to see available gates.</p>
                  </div>
                ) : scopedGates.length === 0 ? (
                  <p className="scope-empty">No gates in the selected divisions.</p>
                ) : (
                  <div className="form-group">
                    <p className="su-hint">Optional. Combined gates can be entry, exit, or both.</p>
                    <GateAccessPicker
                      gates={scopedGates}
                      selectedIds={gateIds}
                      modes={gateAccessModes}
                      showDivision={false}
                      onChange={({ gateIds: nextIds, gateAccessModes: nextModes }) => {
                        setGateIds(nextIds);
                        setGateAccessModes(nextModes);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}
          </div>

          <div className="reg-details-modal__footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading || roles.length === 0}>
              {loading ? 'Creating...' : 'Create System User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManageSystemUsersPage() {
  const { can } = useAuth();
  const canWrite = can('system_users', 'write');
  const canEditRole = can('system_roles', 'write');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRoleId, setFilterRoleId] = useState('');
  const [filterDivisionId, setFilterDivisionId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    loadUsers();
    Promise.all([
      api.systemRoles.list(),
      api.divisions.list({ isActive: 'true' }),
      api.departments.list({ isActive: 'true' }),
    ])
      .then(([roleList, divisionList, departmentList]) => {
        setRoles(Array.isArray(roleList) ? roleList : []);
        setDivisions(Array.isArray(divisionList) ? divisionList : []);
        setDepartments(Array.isArray(departmentList) ? departmentList : []);
      })
      .catch(() => {});
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

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (filterStatus === 'active' && !user.isActive) return false;
      if (filterStatus === 'inactive' && user.isActive) return false;

      if (filterRoleId === '__super__') {
        if (!user.isSuperAdmin) return false;
      } else if (filterRoleId) {
        const roleId = user.systemRoleId?._id || user.systemRoleId || '';
        if (String(roleId) !== filterRoleId) return false;
      }

      if (filterDivisionId === '__none__') {
        if (user.isSuperAdmin || (user.divisionIds || []).length > 0) return false;
      } else if (filterDivisionId) {
        if (user.isSuperAdmin) return false;
        const assigned = (user.divisionIds || []).some((div) => String(div?._id || div) === filterDivisionId);
        if (!assigned) return false;
      }

      if (filterDepartmentId === '__none__') {
        if (user.isSuperAdmin || (user.departmentIds || []).length > 0) return false;
      } else if (filterDepartmentId) {
        if (user.isSuperAdmin) return false;
        const assigned = (user.departmentIds || []).some((dept) => String(dept?._id || dept) === filterDepartmentId);
        if (!assigned) return false;
      }

      if (!q) return true;
      const haystack = [
        user.displayName,
        user.username,
        user.email,
        user.isSuperAdmin ? 'super admin unrestricted' : user.systemRoleId?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, searchQuery, filterRoleId, filterDivisionId, filterDepartmentId, filterStatus]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || filterRoleId || filterDivisionId || filterDepartmentId || filterStatus
  );

  const departmentFilterOptions = useMemo(() => {
    if (!filterDivisionId || filterDivisionId === '__none__') return departments;
    return departments.filter((dept) =>
      (dept.divisionIds || []).some((div) => String(div?._id || div) === filterDivisionId)
    );
  }, [departments, filterDivisionId]);

  if (loading && users.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system users...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 className="section-title">
            System Users ({hasActiveFilters ? `${filteredUsers.length} of ${users.length}` : users.length})
          </h3>
          <p className="section-desc">Users with assigned roles and optional division, gate, and department access scope.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label htmlFor="user-search">Search</label>
            <div className="reg-search-wrap">
              <svg className="reg-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="user-search"
                type="search"
                className="reg-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, username, or email…"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label htmlFor="user-filter-role">Filter by Role</label>
            <select
              id="user-filter-role"
              value={filterRoleId}
              onChange={(e) => setFilterRoleId(e.target.value)}
            >
              <option value="">All roles</option>
              <option value="__super__">Super Admin</option>
              {roles.map((role) => (
                <option key={role._id} value={role._id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label htmlFor="user-filter-division">Filter by Division</label>
            <select
              id="user-filter-division"
              value={filterDivisionId}
              onChange={(e) => {
                setFilterDivisionId(e.target.value);
                setFilterDepartmentId('');
              }}
            >
              <option value="">All divisions</option>
              <option value="__none__">Unassigned</option>
              {divisions.map((division) => (
                <option key={division._id} value={division._id}>{division.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
            <label htmlFor="user-filter-department">Filter by Department</label>
            <select
              id="user-filter-department"
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
            >
              <option value="">All departments</option>
              <option value="__none__">Unassigned</option>
              {departmentFilterOptions.map((department) => (
                <option key={department._id} value={department._id}>{department.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label htmlFor="user-filter-status">Status</label>
            <select
              id="user-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state card">
          <p>No users match the current search or filters.</p>
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
                {filteredUsers.map((user) => (
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
                    <td className="scope-col">
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (
                        <ScopeOverflowCell
                          items={user.divisionIds || []}
                          badgeClass="badge-info"
                          title="Divisions"
                          subtitle={user.displayName}
                        />
                      )}
                    </td>

                    {/* Gates */}
                    <td className="scope-col">
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (
                        <ScopeOverflowCell
                          items={user.gateIds || []}
                          badgeClass="badge-success"
                          title="Gates"
                          subtitle={user.displayName}
                          renderLabel={(gate) => `${gate.name} (${gateModeBadgeLabel(gate, user.gateAccessModes || {})})`}
                        />
                      )}
                    </td>

                    {/* Departments */}
                    <td className="scope-col">
                      {user.isSuperAdmin ? (
                        <span className="badge badge-success">All</span>
                      ) : (
                        <ScopeOverflowCell
                          items={user.departmentIds || []}
                          badgeClass="badge-warning"
                          title="Departments"
                          subtitle={user.displayName}
                        />
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
