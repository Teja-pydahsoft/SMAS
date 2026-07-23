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

/* View-mode scope list — shows nothing when empty */
function ScopeList({ title, items, badgeClass = 'badge-info' }) {
  if (items.length === 0) return null;
  return (
    <div className="system-user-scope-block">
      <p className="system-user-scope-block__title">{title}</p>
      <div className="scope-badges">
        {items.map((item) => (
          <span key={item._id} className={`badge ${badgeClass}`}>{item.name}</span>
        ))}
      </div>
    </div>
  );
}

function PermissionSummary({ permissions }) {
  const entries = PERMISSION_MODULES.filter(({ key }) => {
    const v = permissions?.[key];
    return v?.read || v?.write;
  });
  if (entries.length === 0) return null;
  return (
    <ul className="system-user-permission-list">
      {entries.map(({ key, label }) => {
        const v = permissions[key] || {};
        return (
          <li key={key}>
            <span className="system-user-permission-list__label">{label}</span>
            <span className="system-user-permission-list__access">{v.write ? 'Read & write' : 'Read only'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* Edit-mode checkbox list */
function CheckboxList({ items, selected, onToggle, renderLabel }) {
  if (items.length === 0) return null;
  return (
    <div className="checkbox-group">
      {items.map((item) => (
        <label key={item._id} className="checkbox-option">
          <input
            type="checkbox"
            checked={selected.includes(item._id)}
            onChange={() => onToggle(item._id)}
          />
          <span>{renderLabel ? renderLabel(item) : item.name}</span>
        </label>
      ))}
    </div>
  );
}

export default function SystemUserDetailsModal({ user, canWrite, canEditRole = false, onClose, onSaved }) {
  const [editing, setEditing]       = useState(false);
  const [roles, setRoles]           = useState([]);
  const [divisions, setDivisions]   = useState([]);
  const [gates, setGates]           = useState([]);
  const [departments, setDepartments] = useState([]);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [systemRoleId, setSystemRoleId] = useState('');
  const [isActive, setIsActive]     = useState(true);
  const [divisionIds, setDivisionIds]   = useState([]);
  const [gateIds, setGateIds]           = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);

  const [rolePerms, setRolePerms]   = useState(emptyPermissions());
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  const editable         = canWrite && !user?.isSuperAdmin;
  const roleId           = user?.systemRoleId?._id || null;
  const canEditPrivileges = canEditRole && !user?.isSuperAdmin && Boolean(roleId);

  /* Reset when user changes */
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
    setRolePerms(normalizePermissions(user.systemRoleId?.permissions));
  }, [user]);

  /* Load dropdowns when editing starts */
  useEffect(() => {
    if (!editing) return;
    Promise.all([
      api.systemRoles.list(),
      api.divisions.list({ isActive: 'true' }),
      api.gates.list({ isActive: 'true' }),
      api.departments.list({ isActive: 'true' }),
    ])
      .then(([r, d, g, dep]) => {
        setRoles(r.filter((x) => x.isActive));
        setDivisions(d);
        setGates(g);
        setDepartments(dep);
      })
      .catch((e) => setError(e.message));
  }, [editing]);

  const scopedGates = useMemo(() => {
    if (divisionIds.length === 0) return gates;
    const sel = new Set(divisionIds);
    return gates.filter((g) => sel.has(g.divisionId?._id || g.divisionId));
  }, [gates, divisionIds]);

  const scopedDepartments = useMemo(() => {
    if (divisionIds.length === 0) return departments;
    const sel = new Set(divisionIds);
    return departments.filter((d) => (d.divisionIds || []).some((div) => sel.has(div._id)));
  }, [departments, divisionIds]);

  if (!user) return null;

  function toggleDivision(id) {
    setDivisionIds((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
      const okGates = new Set(gates.filter((g) => next.includes(g.divisionId?._id || g.divisionId)).map((g) => g._id));
      setGateIds((p) => p.filter((gid) => okGates.has(gid)));
      const okDepts = new Set(departments.filter((d) => (d.divisionIds || []).some((div) => next.includes(div._id))).map((d) => d._id));
      setDepartmentIds((p) => p.filter((did) => okDepts.has(did)));
      return next;
    });
  }

  function handleCancel() {
    setEditing(false);
    setError('');
    setSuccess('');
    setPassword('');
    setDisplayName(user.displayName || '');
    setEmail(user.email || '');
    setSystemRoleId(user.systemRoleId?._id || '');
    setIsActive(Boolean(user.isActive));
    setDivisionIds((user.divisionIds || []).map((d) => d._id));
    setGateIds((user.gateIds || []).map((g) => g._id));
    setDepartmentIds((user.departmentIds || []).map((d) => d._id));
    setRolePerms(normalizePermissions(user.systemRoleId?.permissions));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!editable) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = { displayName: displayName.trim(), email: email.trim(), isActive, systemRoleId, divisionIds, gateIds, departmentIds };
      if (password.trim()) payload.password = password.trim();
      await api.systemUsers.update(user._id, payload);
      if (canEditPrivileges && roleId) {
        await api.systemRoles.updatePermissions(roleId, rolePerms);
      }
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

  /* ── Render ─────────────────────────────── */
  return (
    <div className="pass-modal-overlay" onClick={onClose}>
      <div className="details-modal system-user-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="details-modal-header">
          <div>
            <h3>{editing ? 'Edit System User' : 'System User Details'}</h3>
            <p className="details-modal-sub">
              {user.displayName} · {user.username}
              {user.isSuperAdmin && <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>Super Admin</span>}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="details-modal-body">

            {/* ══════════════════════════════
                VIEW MODE
            ══════════════════════════════ */}
            {!editing && (
              <div className="system-user-modal-grid">

                {/* Panel 1 — User Details */}
                <section className="system-user-modal-panel card">
                  <h4 className="system-user-modal-panel__title">User Details</h4>
                  <dl className="profile-dl">
                    <div><dt>Display Name</dt><dd>{user.displayName}</dd></div>
                    <div><dt>Username</dt><dd>{user.username}</dd></div>
                    <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
                    <div><dt>System Role</dt><dd>{user.isSuperAdmin ? 'Unrestricted (Super Admin)' : user.systemRoleId?.name || '—'}</dd></div>
                    <div>
                      <dt>Status</dt>
                      <dd><span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></dd>
                    </div>
                    <div><dt>Last Login</dt><dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</dd></div>
                    <div><dt>Created</dt><dd>{user.createdAt ? formatDate(user.createdAt) : '—'}</dd></div>
                    <div><dt>Updated</dt><dd>{user.updatedAt ? formatDate(user.updatedAt) : '—'}</dd></div>
                  </dl>
                </section>

                {/* Panel 2 — Access Scope */}
                <section className="system-user-modal-panel card">
                  <h4 className="system-user-modal-panel__title">Access Scope</h4>
                  {user.isSuperAdmin ? (
                    <span className="badge badge-success">All divisions, gates &amp; departments</span>
                  ) : (
                    <>
                      <ScopeList title="Divisions"   items={user.divisionIds   || []} badgeClass="badge-info"    />
                      <ScopeList title="Gates"       items={user.gateIds       || []} badgeClass="badge-success" />
                      <ScopeList title="Departments" items={user.departmentIds || []} badgeClass="badge-warning" />
                      {!(user.divisionIds?.length || user.gateIds?.length || user.departmentIds?.length) && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-13)' }}>—</span>
                      )}
                    </>
                  )}
                </section>

                {/* Panel 3 — Role Privileges */}
                <section className="system-user-modal-panel card">
                  <h4 className="system-user-modal-panel__title">Role Privileges</h4>
                  {user.isSuperAdmin ? (
                    <span className="badge badge-success">Full access</span>
                  ) : !roleId ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-13)' }}>—</span>
                  ) : (
                    <PermissionSummary permissions={user.systemRoleId?.permissions} />
                  )}
                </section>

              </div>
            )}

            {/* ══════════════════════════════
                EDIT MODE  — 2-column layout
                Left : User Details
                Right: Access Scope (3 cols) + Role Privileges
            ══════════════════════════════ */}
            {editing && (
              <div className="suedit-grid">

                {/* LEFT — User Details */}
                <section className="system-user-modal-panel card suedit-left">
                  <h4 className="system-user-modal-panel__title">User Details</h4>

                  <div className="form-group">
                    <label>Display Name *</label>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input value={user.username} disabled />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" autoComplete="new-password" />
                  </div>
                  <div className="form-group">
                    <label>System Role *</label>
                    <select value={systemRoleId} onChange={(e) => setSystemRoleId(e.target.value)} required>
                      <option value="">Select role...</option>
                      {roles.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </div>
                  <label className="checkbox-option">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <span>Active user account</span>
                  </label>
                </section>

                {/* RIGHT — Access Scope + Role Privileges */}
                <div className="suedit-right">

                  {/* Access Scope */}
                  <section className="system-user-modal-panel card">
                    <h4 className="system-user-modal-panel__title">Access Scope</h4>
                    {user.isSuperAdmin ? (
                      <span className="badge badge-success">All divisions, gates &amp; departments</span>
                    ) : (
                      <div className="suedit-scope-grid">

                        <div className="suedit-scope-col">
                          <p className="system-user-scope-block__title">Divisions</p>
                          <CheckboxList
                            items={divisions}
                            selected={divisionIds}
                            onToggle={toggleDivision}
                          />
                        </div>

                        <div className="suedit-scope-col">
                          <p className="system-user-scope-block__title">Gates</p>
                          <CheckboxList
                            items={scopedGates}
                            selected={gateIds}
                            onToggle={(id) => setGateIds((p) => p.includes(id) ? p.filter((g) => g !== id) : [...p, id])}
                            renderLabel={(g) => (
                              <span>{g.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({g.gateType})</span></span>
                            )}
                          />
                        </div>

                        <div className="suedit-scope-col">
                          <p className="system-user-scope-block__title">Departments</p>
                          <CheckboxList
                            items={scopedDepartments}
                            selected={departmentIds}
                            onToggle={(id) => setDepartmentIds((p) => p.includes(id) ? p.filter((d) => d !== id) : [...p, id])}
                          />
                        </div>

                      </div>
                    )}
                  </section>

                  {/* Role Privileges */}
                  {canEditPrivileges && (
                    <section className="system-user-modal-panel card">
                      <h4 className="system-user-modal-panel__title">
                        Role Privileges
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--text-13)', marginLeft: '0.5rem' }}>
                          — {user.systemRoleId?.name}
                        </span>
                      </h4>
                      <PermissionMatrix permissions={rolePerms} onChange={setRolePerms} />
                    </section>
                  )}

                </div>
              </div>
            )}

            {error   && <p className="error-msg"   style={{ marginTop: '1rem' }}>{error}</p>}
            {success && <p className="success-msg" style={{ marginTop: '1rem' }}>{success}</p>}
          </div>

          {/* Footer */}
          <div className="details-modal-footer">
            {editing ? (
              <>
                <button type="button" className="btn-secondary" onClick={handleCancel} disabled={saving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
                {editable && (
                  <button type="button" className="btn-primary" onClick={() => setEditing(true)}>Edit</button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
