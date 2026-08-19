'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';
import PermissionMatrix from '@/components/PermissionMatrix';
import {
  emptyPermissions,
  applyWriteImpliesRead,
  summarizePermissions,
  hasElevatedPrivileges,
  validateRoleName,
} from '@/lib/auth/permissions';

export default function CreateSystemRolePage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('system_roles', '/system/roles/manage');
  const [existingNames, setExistingNames] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState(emptyPermissions());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameError = validateRoleName(name, existingNames);
  const summary = useMemo(() => summarizePermissions(permissions), [permissions]);
  const elevated = hasElevatedPrivileges(permissions);

  useEffect(() => {
    api.systemRoles.list()
      .then((roles) => setExistingNames(roles.map((role) => role.name)))
      .catch(() => {});
  }, []);

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
    setSuccess('');

    try {
      const role = await api.systemRoles.create({
        name: name.trim(),
        description: description.trim(),
        permissions: applyWriteImpliesRead(permissions),
      });
      setSuccess(`Role "${role.name}" created.`);
      setTimeout(() => router.push(`/system/roles/${role._id}/permissions`), 900);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (permLoading || !allowed) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title">System Role Details</h3>
        <p className="section-desc">
          Create the role and assign privileges together. Write access includes read.
        </p>

        <div className="role-form-grid">
          <div className="form-group">
            <label htmlFor="create-role-name">
              Role Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="create-role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="e.g. Gate Operator, Department Manager"
              maxLength={60}
              className={nameTouched && nameError ? 'input-error' : undefined}
              aria-invalid={nameTouched && Boolean(nameError)}
            />
            {nameTouched && nameError && <p className="error-msg">{nameError}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="create-role-description">Description</label>
            <input
              id="create-role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this role is for"
              maxLength={160}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Privileges</h3>
        <p className="section-desc">Grant the least access this role needs. Checking write also grants read.</p>
        <PermissionMatrix permissions={permissions} onChange={setPermissions} showSummary={false} />

        {elevated && (
          <div className="role-form-warning" role="status">
            Privileged access is selected. Users with this role can create or change system users and roles.
          </div>
        )}

        {error && <p className="error-msg" style={{ marginTop: '1rem' }}>{error}</p>}
        {success && <p className="success-msg" style={{ marginTop: '1rem' }}>{success}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', alignItems: 'center' }}>
          <button type="submit" className="btn-primary" disabled={loading || Boolean(nameError)}>
            {loading ? 'Creating...' : 'Create Role'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.push('/system/roles/manage')} disabled={loading}>
            Cancel
          </button>
          <span className="role-form-footer-meta" style={{ marginLeft: 'auto', marginRight: 0 }}>
            {summary.grantedCount === 0
              ? 'No modules granted yet'
              : `${summary.writeCount} write · ${summary.readCount} read-only`}
          </span>
        </div>
      </div>
    </form>
  );
}
