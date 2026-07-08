'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import PermissionMatrix from '@/components/PermissionMatrix';
import { emptyPermissions } from '@/lib/auth/permissions';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NewRoleModal({ onClose, onComplete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState(emptyPermissions());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create the role
      const role = await api.systemRoles.create({
        name: name.trim(),
        description: description.trim(),
      });
      // Save privileges in the same flow
      await api.systemRoles.updatePermissions(role._id, permissions);
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
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New System Role"
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth: 780, width: '95vw', maxHeight: 'none', overflowY: 'visible' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New System Role</h3>
              <p className="reg-details-modal__sub">Set the role name and assign its privileges</p>
            </div>
          </div>
          <button
            type="button"
            className="reg-details-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="reg-details-modal__body" style={{ overflowY: 'visible' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="role-name">
                Role Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gate Operator, Department Manager"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="role-description">Description</label>
              <input
                id="role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>Privileges</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Set read and write access for each module. Write access includes read.
              </p>
              <PermissionMatrix permissions={permissions} onChange={setPermissions} />
            </div>

            {error && <p className="error-msg" style={{ marginTop: '1rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Role'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
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
          <p className="section-desc">Manage roles and assign module privileges separately</p>
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

      {showNewRoleModal && (
        <NewRoleModal
          onClose={() => setShowNewRoleModal(false)}
          onComplete={handleRoleCreated}
        />
      )}
    </div>
  );
}
