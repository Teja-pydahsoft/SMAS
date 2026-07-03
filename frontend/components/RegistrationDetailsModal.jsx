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
    <div className="pass-modal-overlay" onClick={onClose}>
      <div className="details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-modal-header">
          <div>
            <h3>Registration Details</h3>
            <p className="details-modal-sub">
              {registration.displayName || 'Unnamed'} · {registration.roleId?.name || '—'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="details-modal-body">
          <div className="details-summary card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="details-photo" />
              ) : (
                <div className="details-photo-placeholder">No Photo</div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{registration.displayName || '—'}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {registration.roleId?.name}
                </p>
                <span className={`badge ${STATUS_BADGE[registration.status] || 'badge-info'}`} style={{ marginTop: '0.5rem' }}>
                  {registration.status?.replace(/_/g, ' ')}
                </span>
                {registration.registrationCode && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    Code: <strong>{registration.registrationCode}</strong>
                  </p>
                )}
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Registered: {formatDateTime(registration.createdAt)}
                </p>
              </div>
            </div>

            {registration.formDetails?.length > 0 && (
              <div className="details-fields" style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Form Data</h4>
                {registration.formDetails.map((d) => (
                  <div key={`${d.label}-${d.value}`} className="pass-meta-row">
                    <span className="pass-meta-label">{d.label}</span>
                    <span className="pass-meta-value">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isVerified && (
            <div>
              <h4 style={{ marginBottom: '0.75rem' }}>Registration Pass</h4>
              {loadingPass && (
                <p style={{ color: 'var(--text-muted)' }}>Loading pass...</p>
              )}
              {error && <p className="error-msg">{error}</p>}
              {!loadingPass && pass && <PassCard pass={pass} />}
              {!loadingPass && !pass && !error && (
                <p style={{ color: 'var(--text-muted)' }}>Pass could not be loaded.</p>
              )}
            </div>
          )}

          {!isVerified && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Registration pass is issued after verification is complete.
            </p>
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
