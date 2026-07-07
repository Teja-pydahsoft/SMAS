'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';

export default function CreateShiftPage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('shifts', '/shifts/manage');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allowed) return;
    if (!name.trim()) {
      setError('Shift name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const shift = await api.shifts.create({
        name: name.trim(),
        description: description.trim(),
      });
      setSuccess(`Shift "${shift.name}" created successfully.`);
      setName('');
      setDescription('');
      setTimeout(() => router.push('/shifts/manage'), 1500);
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
        <h3 className="section-title">Shift Details</h3>
        <p className="section-desc">
          Give this shift a clear name and an optional description
        </p>

        <div className="form-group">
          <label>
            Shift Name <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Shift, Afternoon Shift, Night Shift"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 6:00 AM – 2:00 PM"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Shift'}
        </button>
      </div>
    </form>
  );
}
