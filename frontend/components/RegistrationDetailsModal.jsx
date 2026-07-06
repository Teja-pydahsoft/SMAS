'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import PassCard from '@/components/PassCard';
import { formatDateTime } from '@/lib/formatDate';

const STATUS_BADGE = {
  draft: 'badge-info',
  in_progress: 'badge-info',
  pending_verification: 'badge-warning',
  verified: 'badge-success',
  rejected: 'badge-danger',
};

function photoUrlFromPath(photoPath) {
  if (!photoPath) return null;
  const name = photoPath.replace(/\\/g, '/').split('/').pop();
  return `/uploads/registrations/${name}`;
}

export default function RegistrationDetailsModal({ registration, onClose }) {
  const [pass, setPass] = useState(null);
  const [loadingPass, setLoadingPass] = useState(false);
  const [error, setError] = useState('');

  const isVerified = registration?.status === 'verified';
  const photoUrl = registration?.photoUrl || photoUrlFromPath(registration?.photoPath);

  useEffect(() => {
    if (!registration || !isVerified) return;

    setLoadingPass(true);
    setError('');
    api.passes
      .getRegistrationPass(registration._id)
      .then(setPass)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingPass(false));
  }, [registration, isVerified]);

  if (!registration) return null;

  return (
    <div className="pass-modal-overlay reg-details-overlay" onClick={onClose}>
      <div className="reg-details-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Modal header (screen only) ── */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <span className="reg-details-modal__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </span>
            <div>
              <h3 className="reg-details-modal__title">Registration Details</h3>
              <p className="reg-details-modal__sub">
                {registration.displayName || 'Unnamed'} · {registration.roleId?.name || '—'}
              </p>
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

        <div className="reg-details-modal__body">

          {/* ── Registration info summary (screen only) ── */}
          <div className="reg-details-summary no-print">
            <div className="reg-details-summary__photo-wrap">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="reg-details-summary__photo" />
              ) : (
                <div className="reg-details-summary__photo reg-details-summary__photo--placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              )}
            </div>
            <div className="reg-details-summary__info">
              <p className="reg-details-summary__name">{registration.displayName || '—'}</p>
              <p className="reg-details-summary__role">{registration.roleId?.name || '—'}</p>
              <div className="reg-details-summary__meta-row">
                <span className={`badge ${STATUS_BADGE[registration.status] || 'badge-info'}`}>
                  {registration.status?.replace(/_/g, ' ')}
                </span>
                {registration.registrationCode && (
                  <span className="reg-details-summary__code">{registration.registrationCode}</span>
                )}
              </div>
              <p className="reg-details-summary__date">
                Registered: {formatDateTime(registration.createdAt)}
              </p>
            </div>
          </div>

          {/* ── Form details (screen only) ── */}
          {(registration.formDetails || []).length > 0 && (
            <div className="reg-details-fields no-print">
              <h4 className="reg-details-fields__title">Registration Form Details</h4>
              <div className="reg-details-fields__grid">
                {registration.formDetails.map((d) => (
                  <div key={`${d.label}-${d.value}`} className="reg-details-fields__row">
                    <span className="reg-details-fields__label">{d.label}</span>
                    <span className="reg-details-fields__value">{d.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Pass section ── */}
          {isVerified && (
            <div className="reg-details-pass-section">
              <h4 className="reg-details-pass-section__title no-print">Registration Pass</h4>
              {loadingPass && (
                <div className="reg-details-loading no-print">
                  <span className="reports-slide-modal__spinner" aria-hidden="true" />
                  <p>Loading pass…</p>
                </div>
              )}
              {error && <p className="error-msg no-print">{error}</p>}
              {!loadingPass && !pass && !error && (
                <p className="no-print" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Pass could not be loaded.
                </p>
              )}
              {!loadingPass && pass && <PassCard pass={pass} />}
            </div>
          )}

          {!isVerified && (
            <div className="no-print" style={{ padding: '1rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Registration pass is issued after verification is complete.
              </p>
            </div>
          )}
        </div>

        <div className="reg-details-modal__footer no-print">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
