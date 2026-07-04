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
    <div className="pass-modal-overlay reports-modal-overlay" onClick={onClose}>
      <div className="reports-slide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reports-slide-modal__header">
          <div className="reports-slide-modal__title-wrap">
            <span className="reports-slide-modal__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </span>
            <div>
              <h3 className="reports-slide-modal__title">Access Report</h3>
              <p className="reports-slide-modal__sub">Complete gate and department activity</p>
            </div>
          </div>
          <button type="button" className="reports-slide-modal__close" onClick={onClose} title="Close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reports-slide-modal__body">
          {loading && (
            <div className="reports-slide-modal__loading">
              <span className="reports-slide-modal__spinner" aria-hidden="true" />
              <p>Loading report…</p>
            </div>
          )}
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

        <div className="reports-slide-modal__footer no-print">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
