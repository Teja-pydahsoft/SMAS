'use client';

import { useState } from 'react';
import { api } from '@/lib/api/client';

/**
 * Shown after a successful department check-in so the operator can enter an optional remark.
 * Remark is stored on the GateLog and appears in the Excel report Remark column.
 */
export default function RemarkEntryModal({ logId, personName, departmentName, onConfirm, onSkip }) {
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setLoading(true);
    setError('');
    try {
      const trimmed = remark.trim();
      if (trimmed) {
        await api.gate.attachRemark(logId, trimmed);
      }
      onConfirm(trimmed);
    } catch (e) {
      setError(e.message || 'Failed to save remark. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shift-picker-overlay" role="dialog" aria-modal="true" aria-label="Enter remark">
      <div className="shift-picker-modal">
        <h3 className="shift-picker-modal__title">Add Remark</h3>
        <p className="shift-picker-modal__desc">
          Optional note for <strong>{personName || 'this person'}</strong>
          {departmentName ? (
            <>
              {' '}
              at <strong>{departmentName}</strong>
            </>
          ) : null}
          . This appears in the report Remark column.
        </p>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="dept-checkin-remark">Remark</label>
          <textarea
            id="dept-checkin-remark"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={3}
            placeholder="Enter remark (optional)"
            maxLength={500}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}

        <div className="shift-picker-modal__actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : remark.trim() ? 'Save Remark' : 'Continue'}
          </button>
          <button type="button" className="btn-secondary" onClick={onSkip} disabled={loading}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
