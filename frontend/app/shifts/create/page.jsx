'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import {
  formatDurationHours,
  validateShiftMinHours,
} from '@/lib/shiftTiming';
import useRequireWrite from '@/hooks/useRequireWrite';

export default function CreateShiftPage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('shifts', '/shifts/manage');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [halfDayMinHours, setHalfDayMinHours] = useState('');
  const [fullDayMinHours, setFullDayMinHours] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const parsedTotal = totalHours === '' ? null : Number(totalHours);
  const totalHoursLabel =
    parsedTotal != null && Number.isFinite(parsedTotal)
      ? formatDurationHours(parsedTotal)
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allowed) return;
    if (!name.trim()) {
      setError('Shift name is required');
      return;
    }
    if (totalHours === '' || parsedTotal == null || !Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setError('Total hours is required');
      return;
    }

    const halfDay = halfDayMinHours === '' ? null : Number(halfDayMinHours);
    const fullDay = fullDayMinHours === '' ? null : Number(fullDayMinHours);
    const timingError = validateShiftMinHours({
      totalHours: parsedTotal,
      halfDayMinHours: halfDayMinHours === '' ? null : halfDay,
      fullDayMinHours: fullDayMinHours === '' ? null : fullDay,
    });
    if (timingError) {
      setError(timingError);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const shift = await api.shifts.create({
        name: name.trim(),
        description: description.trim(),
        totalHours: parsedTotal,
        halfDayMinHours: halfDay,
        fullDayMinHours: fullDay,
      });
      setSuccess(`Shift "${shift.name}" created successfully.`);
      setName('');
      setDescription('');
      setTotalHours('');
      setHalfDayMinHours('');
      setFullDayMinHours('');
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
          Set the shift name, total working hours, and minimum hours for half/full day
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
            placeholder="Optional notes about this shift"
          />
        </div>

        <div className="form-group">
          <label>
            Total Hours <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={totalHours}
            onChange={(e) => setTotalHours(e.target.value)}
            placeholder="e.g. 8"
            required
          />
        </div>

        {totalHoursLabel && (
          <p style={{ margin: '-0.25rem 0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Shift total hours: <strong style={{ color: 'var(--text)' }}>{totalHoursLabel}h</strong>
            {' '}— half/full day minimums cannot exceed this.
          </p>
        )}

        <div className="form-two-col-grid">
          <div className="form-group">
            <label>Half Day Minimum Hours</label>
            <input
              type="number"
              min="0"
              max={parsedTotal ?? undefined}
              step="0.5"
              value={halfDayMinHours}
              onChange={(e) => setHalfDayMinHours(e.target.value)}
              placeholder={totalHoursLabel ? `max ${totalHoursLabel}` : 'e.g. 4'}
            />
          </div>
          <div className="form-group">
            <label>Full Day Minimum Hours</label>
            <input
              type="number"
              min="0"
              max={parsedTotal ?? undefined}
              step="0.5"
              value={fullDayMinHours}
              onChange={(e) => setFullDayMinHours(e.target.value)}
              placeholder={totalHoursLabel ? `max ${totalHoursLabel}` : 'e.g. 8'}
            />
          </div>
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
