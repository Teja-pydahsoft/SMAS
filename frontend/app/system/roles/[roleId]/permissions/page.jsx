'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import PermissionMatrix from '@/components/PermissionMatrix';
import { emptyPermissions } from '@/lib/auth/permissions';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

export default function SystemRolePermissionsPage() {
  const { can } = useAuth();
  const canWrite = can('system_roles', 'write');
  const params = useParams();
  const router = useRouter();
  const roleId = params.roleId;

  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState(emptyPermissions());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRole();
  }, [roleId]);

  async function loadRole() {
    setLoading(true);
    try {
      const data = await api.systemRoles.get(roleId);
      setRole(data);
      setPermissions({ ...emptyPermissions(), ...(data.permissions || {}) });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api.systemRoles.updatePermissions(roleId, permissions);
      setRole(updated);
      setPermissions({ ...emptyPermissions(), ...(updated.permissions || {}) });
      setSuccess('Privileges updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading role...</p>;
  if (!role) return <p className="error-msg">{error || 'Role not found'}</p>;

  return (
    <form onSubmit={handleSave}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="reports-section-header">
          <div>
            <h3 className="section-title">Assign Privileges — {role.name}</h3>
            <p className="section-desc">
              Set read and write access for each module. Write access includes read.
            </p>
          </div>
          <Link href="/system/roles/manage">
            <button type="button" className="btn-secondary">Back to Roles</button>
          </Link>
        </div>
      </div>

      <div className="card">
        <PermissionMatrix
          permissions={permissions}
          onChange={setPermissions}
          readOnly={!canWrite}
        />

        {error && <p className="error-msg" style={{ marginTop: '1rem' }}>{error}</p>}
        {success && <p className="success-msg" style={{ marginTop: '1rem' }}>{success}</p>}
        {!canWrite && (
          <p className="read-only-banner" style={{ marginTop: '1rem' }}>
            View only — you cannot change privileges without write access.
          </p>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <WriteAccess module="system_roles">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Privileges'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => router.push('/system/users/create')}>
              Create User with This Role
            </button>
          </WriteAccess>
        </div>
      </div>
    </form>
  );
}
