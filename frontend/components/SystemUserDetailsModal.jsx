'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { PERMISSION_MODULES, emptyPermissions } from '@/lib/auth/permissions';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import PermissionMatrix from '@/components/PermissionMatrix';

function normalizePermissions(source) {
  const base = emptyPermissions();
  if (!source) return base;
  for (const { key } of PERMISSION_MODULES) {
    const value = source[key];
    if (value) base[key] = { read: Boolean(value.read), write: Boolean(value.write) };
  }
  return base;
}

function ScopeList({ title, items, emptyText, badgeClass = 'badge-info' }) {
  return (
    <div className="system-user-scope-block">
      <p className="system-user-scope-block__title">{title}</p>
      {items.length === 0 ? (
        <p className="system-user-scope-block__empty">{emptyText}</p>
      ) : (
        <div className="scope-badges">
          {items.map((item) => (
            <span key={item._id} className={`badge ${badgeClass}`}>
              {item.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionSummary({ permissions }) {
  if (!permissions) return <p className="system-user-scope-block__empty">No role permissions</p>;

  const entries = PERMISSION_MODULES.filter(({ key }) => {
    const value = permissions[key];
    return value?.read || value?.write;
  });

  if (entries.length === 0) {
    return <p className="system-user-scope-block__empty">No module access granted</p>;
  }

  return (
    <ul className="system-user-permission-list">
      {entries.map(({ key, label }) => {
        const value = permissions[key] || {};
        const access = value.write ? 'Read & write' : 'Read only';
        return (
          <li key={key}>
            <span className="system-user-permission-list__label">{label}</span>
            <span className="system-user-permission-list__access">{access}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function SystemUserDetailsModal({ user, canWrite, canEditRole = false, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [gates, setGates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [systemRoleId, setSystemRoleId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [divisionIds, setDivisionIds] = useState([]);
  const [gateIds, setGateIds] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingPerms, setEditingPerms] = useState(false);
  const [rolePerms, setRolePerms] = useState(emptyPermissions());
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsError, setPermsError] = useState('');
  const [permsSuccess, setPermsSuccess] = useState('');

  const editable = canWrite && !user?.isSuperAdmin;
  const roleId = user?.systemRoleId?._id || null;
  const canEditPrivileges = canEditRole && !user?.isSuperAdmin && Boolean(roleId);

  useEffect(() => {
    if (!user) return;
    setEditing(false);
    setPassword('');
    setError('');
    setSuccess('');
    setDisplayName(user.displayName || '');
    setEmail(user.email || '');
    setSystemRoleId(user.systemRoleId?._id || '');
    setIsActive(Boolean(user.isActive));
    setDivisionIds((user.divisionIds || []).map((d) => d._id));
    setGateIds((user.gateIds || []).map((g) => g._id));
    setDepartmentIds((user.departmentIds || []).map((d) => d._id));
    setEditingPerms(false);
    setPermsError('');
    setPermsSuccess('');
    setRolePerms(normalizePermissions(user.systemRoleId?.permissions));
  }, [user]);

  useEffect(() => {
    if (!editing) return;
    Promise.all([
      api.systemRoles.list(),
      api.divisions.list({ isActive: 'true' }),
      api.gates.list({ isActive: 'true' }),
      api.departments.list({ isActive: 'true' }),
    ])
      .then(([roleList, divisionList, gateList, departmentList]) => {
        setRoles(roleList.filter((r) => r.isActive));
        setDivisions(divisionList);
        setGates(gateList);
        setDepartments(departmentList);
      })
      .catch((e) => setError(e.message));
  }, [editing]);

  const scopedGates = useMemo(() => {
    if (divisionIds.length === 0) return gates;
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

  if (!user) return null;

  function toggleDivision(id) {
    setDivisionIds((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
      if (!next.includes(id)) {
        const allowedGateIds = new Set(
          gates
            .filter((gate) => next.includes(gate.divisionId?._id || gate.divisionId))
            .map((gate) => gate._id)
        );
        setGateIds((gatePrev) => gatePrev.filter((gateId) => allowedGateIds.has(gateId)));
        const allowedDeptIds = new Set(
          departments
            .filter((dept) => (dept.divisionIds || []).some((div) => next.includes(div._id)))
            .map((dept) => dept._id)
        );
        setDepartmentIds((deptPrev) => deptPrev.filter((deptId) => allowedDeptIds.has(deptId)));
      }
      return next;
    });
  }

  function toggleGate(id) {
    setGateIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function toggleDepartment(id) {
    setDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!editable) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        displayName: displayName.trim(),
        email: email.trim(),
        isActive,
        systemRoleId,
        divisionIds,
        gateIds,
        departmentIds,
      };
      if (password.trim()) payload.password = password.trim();

      const updated = await api.systemUsers.update(user._id, payload);
      const full = await api.systemUsers.get(user._id);
      setSuccess('User updated successfully.');
      setEditing(false);
      setPassword('');
      onSaved?.(full);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePermissions() {
    if (!canEditPrivileges || !roleId) return;
    setSavingPerms(true);
    setPermsError('');
    setPermsSuccess('');
    try {
      await api.systemRoles.updatePermissions(roleId, rolePerms);
      setPermsSuccess('Role privileges updated.');
      setEditingPerms(false);
      const full = await api.systemUsers.get(user._id);
      onSaved?.(full);
    } catch (err) {
      setPermsError(err.message);
    } finally {
      setSavingPerms(false);
    }
  }

  function cancelPermsEdit() {
    setRolePerms(normalizePermissions(user.systemRoleId?.permissions));
    setEditingPerms(false);
    setPermsError('');
  }

  return (
    <div className="pass-modal-overlay" onClick={onClose}>
      <div className="details-modal system-user-modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-modal-header">
          <div>
            <h3>{editing ? 'Edit System User' : 'System User Details'}</h3>
            <p className="details-modal-sub">
              {user.displayName} · {user.username}
              {user.isSuperAdmin && (
                <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>Super Admin</span>
              )}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="details-modal-body">
            <div className="system-user-modal-grid">
              <section className="system-user-modal-panel card">
                <h4 className="system-user-modal-panel__title">User Details</h4>

                {editing ? (
                  <>
                    <div className="form-group">
                      <label>Display Name</label>
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Optional email"
                      />
                    </div>
                    <div className="form-group">
                      <label>Username</label>
                      <input value={user.username} disabled />
                    </div>
                    <div className="form-group">
                      <label>New Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Leave blank to keep current password"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="form-group">
                      <label>System Role</label>
                      <select value={systemRoleId} onChange={(e) => setSystemRoleId(e.target.value)} required>
                        <option value="">Select role...</option>
                        {roles.map((role) => (
                          <option key={role._id} value={role._id}>{role.name}</option>
                        ))}
                      </select>
                    </div>
                    <label className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                      />
                      <span>Active user account</span>
                    </label>
                  </>
                ) : (
                  <dl className="profile-dl">
                    <div>
                      <dt>Display Name</dt>
                      <dd>{user.displayName}</dd>
                    </div>
                    <div>
                      <dt>Username</dt>
                      <dd>{user.username}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{user.email || '—'}</dd>
                    </div>
                    <div>
                      <dt>System Role</dt>
                      <dd>{user.isSuperAdmin ? 'Unrestricted (Super Admin)' : user.systemRoleId?.name || '—'}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Last Login</dt>
                      <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{user.createdAt ? formatDate(user.createdAt) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{user.updatedAt ? formatDate(user.updatedAt) : '—'}</dd>
                    </div>
                  </dl>
                )}
              </section>

              <section className="system-user-modal-panel card">
                <h4 className="system-user-modal-panel__title">Access Scope</h4>

                {user.isSuperAdmin ? (
                  <div className="system-user-scope-unrestricted">
                    <span className="badge badge-success">All divisions, gates & departments</span>
                    <p className="field-hint">Super admin accounts are not limited by division, gate, or department scope.</p>
                  </div>
                ) : editing ? (
                  <>
                    <div className="form-group">
                      <label>Divisions</label>
                      <div className="checkbox-group">
                        {divisions.map((division) => (
                          <label key={division._id} className="checkbox-option">
                            <input
                              type="checkbox"
                              checked={divisionIds.includes(division._id)}
                              onChange={() => toggleDivision(division._id)}
                            />
                            <span>{division.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Gates</label>
                      <div className="checkbox-group">
                        {scopedGates.length === 0 ? (
                          <p className="field-hint">No gates available for the selected divisions.</p>
                        ) : (
                          scopedGates.map((gate) => (
                            <label key={gate._id} className="checkbox-option">
                              <input
                                type="checkbox"
                                checked={gateIds.includes(gate._id)}
                                onChange={() => toggleGate(gate._id)}
                              />
                              <span>
                                {gate.name}
                                <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                                  ({gate.gateType})
                                </span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Departments</label>
                      <div className="checkbox-group">
                        {scopedDepartments.length === 0 ? (
                          <p className="field-hint">No departments available for the selected divisions.</p>
                        ) : (
                          scopedDepartments.map((dept) => (
                            <label key={dept._id} className="checkbox-option">
                              <input
                                type="checkbox"
                                checked={departmentIds.includes(dept._id)}
                                onChange={() => toggleDepartment(dept._id)}
                              />
                              <span>{dept.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <ScopeList
                      title="Divisions"
                      items={user.divisionIds || []}
                      emptyText="No divisions assigned"
                      badgeClass="badge-info"
                    />
                    <div className="system-user-scope-block">
                      <p className="system-user-scope-block__title">Gates</p>
                      {(user.gateIds || []).length === 0 ? (
                        <p className="system-user-scope-block__empty">No gates assigned (department-only access may still apply)</p>
                      ) : (
                        <ul className="system-user-gate-meta">
                          {(user.gateIds || []).map((gate) => (
                            <li key={gate._id}>
                              <span className="badge badge-success">{gate.name}</span>
                              <span className="system-user-gate-meta__type">{gate.gateType}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <ScopeList
                      title="Departments"
                      items={user.departmentIds || []}
                      emptyText="No departments assigned"
                      badgeClass="badge-warning"
                    />
                  </>
                )}
              </section>

              <section className="system-user-modal-panel card">
                <div className="system-user-panel-head">
                  <h4 className="system-user-modal-panel__title">Role Privileges</h4>
                  {canEditPrivileges && !editingPerms && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingPerms(true)}>
                      Edit
                    </button>
                  )}
                </div>

                {user.isSuperAdmin ? (
                  <div className="system-user-scope-unrestricted">
                    <span className="badge badge-success">Full access</span>
                    <p className="field-hint">Super admin accounts have all privileges.</p>
                  </div>
                ) : !roleId ? (
                  <p className="system-user-scope-block__empty">No role assigned to this user.</p>
                ) : (
                  <>
                    <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
                      Privileges for role <strong>{user.systemRoleId?.name}</strong>.
                      {editingPerms && ' Changes apply to everyone with this role.'}
                    </p>
                    {editingPerms ? (
                      <PermissionMatrix permissions={rolePerms} onChange={setRolePerms} />
                    ) : (
                      <PermissionSummary permissions={user.systemRoleId?.permissions} />
                    )}

                    {permsError && <p className="error-msg">{permsError}</p>}
                    {permsSuccess && <p className="success-msg">{permsSuccess}</p>}

                    {editingPerms && (
                      <div className="system-user-perms-actions">
                        <button type="button" className="btn-secondary" onClick={cancelPermsEdit} disabled={savingPerms}>
                          Cancel
                        </button>
                        <button type="button" className="btn-primary" onClick={handleSavePermissions} disabled={savingPerms}>
                          {savingPerms ? 'Saving...' : 'Save Privileges'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>

            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">{success}</p>}
          </div>

          <div className="details-modal-footer">
            {editing ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Close
                </button>
                {editable && (
                  <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
                    Edit User
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
