'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';

export default function CreateSystemRolePage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('system_roles', '/system/roles/manage');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const role = await api.systemRoles.create({
        name: name.trim(),
        description: description.trim(),
      });
      setSuccess(`Role "${role.name}" created. Assign privileges on the permissions page.`);
      setName('');
      setDescription('');
      setTimeout(() => router.push(`/system/roles/${role._id}/permissions`), 1200);
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
      <div className="card">
        <h3 className="section-title">System Role Details</h3>
        <p className="section-desc">
          Create the role name first. Privileges (read/write per module) are assigned separately.
        </p>

        <div className="form-group">
          <label>Role Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gate Operator, Department Manager"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Role'}
        </button>
      </div>
    </form>
  );
}
