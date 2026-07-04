'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import PassVerifyView from '@/components/PassVerifyView';

export default function RegistrationReportModal({ registrationId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!registrationId) return;

    setLoading(true);
    setError('');
    api.reports
      .getRegistration(registrationId)
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load report'))
      .finally(() => setLoading(false));
  }, [registrationId]);

  if (!registrationId) return null;

  return (
    <div className="pass-modal-overlay" onClick={onClose}>
      <div className="details-modal reports-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-modal-header">
          <div>
            <h3>Access Report</h3>
            <p className="details-modal-sub">Complete gate and department activity</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="details-modal-body">
          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading report...</p>}
          {error && <p className="error-msg">{error}</p>}
          {!loading && !error && data && (
            <PassVerifyView
              data={data}
              title="Registered person report"
              subtitle="Access history"
              showPassFields={false}
            />
          )}
        </div>

        <div className="details-modal-footer no-print">
          <button type="button" className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
