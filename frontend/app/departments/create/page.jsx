'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';

function CreateDepartmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allowed, loading: permLoading } = useRequireWrite('departments', '/departments/manage');
  const preselectedDivision = searchParams.get('division');

  const [divisions, setDivisions] = useState([]);
  const [divisionIds, setDivisionIds] = useState(preselectedDivision ? [preselectedDivision] : []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.divisions
      .list({ isActive: 'true' })
      .then(setDivisions)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (preselectedDivision) {
      setDivisionIds((prev) =>
        prev.includes(preselectedDivision) ? prev : [...prev, preselectedDivision]
      );
    }
  }, [preselectedDivision]);

  function toggleDivision(id) {
    setDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allowed) return;
    if (divisionIds.length === 0) {
      setError('Please select at least one division');
      return;
    }
    if (!name.trim()) {
      setError('Department name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const department = await api.departments.create({
        divisionIds,
        name: name.trim(),
        description: description.trim(),
      });
      const divisionNames = (department.divisionIds || [])
        .map((d) => d.name)
        .filter(Boolean)
        .join(', ');
      setSuccess(
        `Department "${department.name}" linked to ${divisionNames || 'selected division(s)'}.`
      );
      setName('');
      setDescription('');
      setTimeout(() => router.push('/departments/manage'), 1500);
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
        <h3 className="section-title">Department Details</h3>
        <p className="section-desc">Create a department and link it to one or more divisions</p>

        <div className="form-group">
          <label>Department Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HR, IT, Security, Finance"
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

        <div className="form-group">
          <label>Divisions <span style={{ color: 'var(--danger)' }}>*</span></label>
          <p className="field-hint">
            Select all divisions this department belongs to
          </p>
          {divisions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No divisions yet.{' '}
              <Link href="/divisions/create">Create a division first</Link>
              {' '}before adding departments.
            </p>
          ) : (
            <div className="checkbox-group">
              {divisions.map((d) => (
                <label key={d._id} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={divisionIds.includes(d._id)}
                    onChange={() => toggleDivision(d._id)}
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <button type="submit" className="btn-primary" disabled={loading || divisions.length === 0}>
          {loading ? 'Creating...' : 'Create Department'}
        </button>
      </div>
    </form>
  );
}

export default function CreateDepartmentPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Loading...</p>}>
      <CreateDepartmentContent />
    </Suspense>
  );
}
