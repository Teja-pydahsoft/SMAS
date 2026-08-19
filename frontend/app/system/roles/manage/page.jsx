'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import PermissionMatrix from '@/components/PermissionMatrix';
import {
  emptyPermissions,
  applyWriteImpliesRead,
  summarizePermissions,
  hasElevatedPrivileges,
  validateRoleName,
} from '@/lib/auth/permissions';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NewRoleModal({ existingNames, onClose, onComplete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState(emptyPermissions());
  const [error, setError] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameError = validateRoleName(name, existingNames);
  const summary = useMemo(() => summarizePermissions(permissions), [permissions]);
  const elevated = hasElevatedPrivileges(permissions);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !loading) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setNameTouched(true);
    if (nameError) {
      setError(nameError);
      return;
    }

    if (summary.grantedCount === 0) {
      const proceed = window.confirm(
        'Create this role with no privileges? Assigned users will not be able to open any module.'
      );
      if (!proceed) return;
    }

    if (elevated) {
      const proceed = window.confirm(
        'This role can manage system users or roles. That is a privileged grant. Continue?'
      );
      if (!proceed) return;
    }

    setLoading(true);
    setError('');

    try {
      const role = await api.systemRoles.create({
        name: name.trim(),
        description: description.trim(),
        permissions: applyWriteImpliesRead(permissions),
      });
      onComplete(role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={loading ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-role-title"
    >
      <div
        className="reg-details-modal reg-details-modal--flow reg-details-modal--role"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 id="new-role-title" className="reg-details-modal__title">New System Role</h3>
              <p className="reg-details-modal__sub">Name the role and grant the least privilege it needs</p>
            </div>
          </div>
          <button
            type="button"
            className="reg-details-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="reg-details-modal__body">
            <div className="role-form-grid">
              <div className="form-group">
                <label htmlFor="role-name">
                  Role Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Gate Operator, Department Manager"
                  autoFocus
                  maxLength={60}
                  className={nameTouched && nameError ? 'input-error' : undefined}
                  aria-invalid={nameTouched && Boolean(nameError)}
                  aria-describedby={nameTouched && nameError ? 'role-name-error' : undefined}
                />
                {nameTouched && nameError && (
                  <p id="role-name-error" className="error-msg">{nameError}</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="role-description">Description</label>
                <input
                  id="role-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — what this role is for"
                  maxLength={160}
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.25rem', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>Privileges</h4>
              <PermissionMatrix permissions={permissions} onChange={setPermissions} showSummary={false} />
            </div>

            {elevated && (
              <div className="role-form-warning" role="status">
                Privileged access is selected. Users with this role can create or change system users and roles.
              </div>
            )}

            {error && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</p>}
          </div>

          <div className="reg-details-modal__footer">
            <p className="role-form-footer-meta">
              {summary.grantedCount === 0
                ? 'No modules granted yet'
                : `${summary.writeCount} write · ${summary.readCount} read-only`}
            </p>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || Boolean(nameError)}>
              {loading ? 'Creating...' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManageSystemRolesPage() {
  const { can } = useAuth();
  const canWrite = can('system_roles', 'write');
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);

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

  function handleRoleCreated() {
    setShowNewRoleModal(false);
    loadRoles();
  }

  if (loading && roles.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system roles...</p>;
  }

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">System Roles ({roles.length})</h3>
          <p className="section-desc">Create roles and assign module privileges in one step</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setShowNewRoleModal(true)}
            aria-label="New Role"
          >
            <PlusIcon />
            New
          </button>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — system role changes require write access.</p>
      )}

      {roles.length === 0 ? (
        <div className="empty-state card">
          <p>No system roles yet.</p>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => setShowNewRoleModal(true)}
            >
              Create System Role
            </button>
          )}
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
                          {canWrite ? 'Edit Privileges' : 'View Privileges'}
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

      {showNewRoleModal && (
        <NewRoleModal
          existingNames={roles.map((role) => role.name)}
          onClose={() => setShowNewRoleModal(false)}
          onComplete={handleRoleCreated}
        />
      )}
    </div>
  );
}
