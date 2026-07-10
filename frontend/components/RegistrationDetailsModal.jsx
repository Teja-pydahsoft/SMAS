'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import PassCard from '@/components/PassCard';
import MediaDocumentModal from '@/components/MediaDocumentModal';
import { formatDateTime } from '@/lib/formatDate';
import { resolveMediaUrl } from '@/lib/mediaUtils';

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

function DocumentRow({ doc, onPreview }) {
  const [imgError, setImgError] = useState(false);
  const url = resolveMediaUrl(doc.url || doc.path);
  const extLabel = (doc.extension || '').replace('.', '').toUpperCase() || 'FILE';
  const showImage = doc.isImage && url && !imgError;

  return (
    <div className="reg-doc-row">
      <div
        className="reg-doc-row__thumb"
        role="button"
        tabIndex={0}
        onClick={() => onPreview(doc)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPreview(doc); }}
        aria-label={`Preview ${doc.label}`}
      >
        {showImage ? (
          <img
            src={url}
            alt=""
            className="reg-doc-row__img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="reg-doc-row__file-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{extLabel}</span>
          </div>
        )}
      </div>

      <div className="reg-doc-row__info">
        <p className="reg-doc-row__field">{doc.label}</p>
        <p className="reg-doc-row__name">{doc.originalName || 'Uploaded file'}</p>
        <div className="reg-doc-row__meta">
          <span className="reg-doc-row__badge">{extLabel}</span>
          <button type="button" className="reg-doc-row__view" onClick={() => onPreview(doc)}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegistrationDetailsModal({ registration, onClose }) {
  const [pass, setPass] = useState(null);
  const [loadingPass, setLoadingPass] = useState(false);
  const [error, setError] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  const isVerified = registration?.status === 'verified';
  const photoUrl = registration?.photoUrl || photoUrlFromPath(registration?.photoPath);
  const formDetails = (registration?.formDetails || []).filter((d) => d.value?.trim());
  const mediaDetails = registration?.mediaDetails || [];
  const showDocuments = registration?.hasMediaFields && mediaDetails.length > 0;
  const hasFormDetails = formDetails.length > 0;

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
      <div className="reg-details-modal reg-details-modal--wide" onClick={(e) => e.stopPropagation()}>

        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <span className="reg-details-modal__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <div>
              <h3 className="reg-details-modal__title">Registration Details</h3>
              <p className="reg-details-modal__sub">
                {registration.displayName || 'Unnamed'} · {registration.roleId?.name || '—'}
              </p>
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reg-details-modal__body">

          {/* Profile strip */}
          <div className="reg-details-summary no-print">
            <div className="reg-details-summary__photo-wrap">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="reg-details-summary__photo" />
              ) : (
                <div className="reg-details-summary__photo reg-details-summary__photo--placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              )}
            </div>
            <div className="reg-details-summary__info">
              <div className="reg-details-summary__name-row">
                <p className="reg-details-summary__name">{registration.displayName || '—'}</p>
                <span className={`badge ${STATUS_BADGE[registration.status] || 'badge-info'}`}>
                  {registration.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="reg-details-summary__role">{registration.roleId?.name || '—'}</p>
              <div className="reg-details-summary__chips">
                {registration.registrationCode && (
                  <span className="reg-details-summary__chip">{registration.registrationCode}</span>
                )}
                {registration.displayPhone && (
                  <span className="reg-details-summary__chip">{registration.displayPhone}</span>
                )}
                <span className="reg-details-summary__chip reg-details-summary__chip--muted">
                  {formatDateTime(registration.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs when verified (keeps pass from pushing details off screen) */}
          {isVerified && (
            <div className="reg-details-tabs no-print">
              <button
                type="button"
                className={`reg-details-tabs__btn ${activeTab === 'details' ? 'reg-details-tabs__btn--active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                Details & Documents
              </button>
              <button
                type="button"
                className={`reg-details-tabs__btn ${activeTab === 'pass' ? 'reg-details-tabs__btn--active' : ''}`}
                onClick={() => setActiveTab('pass')}
              >
                Registration Pass
              </button>
            </div>
          )}

          {(activeTab === 'details' || !isVerified) && (
            <div className="reg-details-content no-print">
              {hasFormDetails && (
                <div className="reg-details-block">
                  <h4 className="reg-details-block__title">Form Information</h4>
                  <dl className="reg-details-dl">
                    {formDetails.map((d) => (
                      <div key={`${d.label}-${d.value}`} className="reg-details-dl__item">
                        <dt>{d.label}</dt>
                        <dd>{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {showDocuments && (
                <div className="reg-details-block">
                  <h4 className="reg-details-block__title">
                    Uploaded Documents
                    <span className="reg-details-block__count">{mediaDetails.length}</span>
                  </h4>
                  <div className="reg-doc-list">
                    {mediaDetails.map((doc) => (
                      <DocumentRow key={doc.fieldId} doc={doc} onPreview={setPreviewDocument} />
                    ))}
                  </div>
                </div>
              )}

              {!hasFormDetails && !showDocuments && (
                <p className="reg-details-empty">No additional registration details submitted.</p>
              )}
            </div>
          )}

          {activeTab === 'pass' && isVerified && (
            <div className="reg-details-pass-wrap no-print">
              {loadingPass && (
                <div className="reg-details-loading">
                  <span className="reports-slide-modal__spinner" aria-hidden="true" />
                  <p>Loading pass…</p>
                </div>
              )}
              {error && <p className="error-msg">{error}</p>}
              {!loadingPass && !pass && !error && (
                <p className="reg-details-empty">Pass could not be loaded.</p>
              )}
              {!loadingPass && pass && <PassCard pass={pass} />}
            </div>
          )}

          {!isVerified && (
            <div className="reg-details-notice no-print">
              <p>Registration pass is issued after verification is complete.</p>
            </div>
          )}
        </div>

        <div className="reg-details-modal__footer no-print">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {previewDocument && (
        <MediaDocumentModal document={previewDocument} onClose={() => setPreviewDocument(null)} />
      )}
    </div>
  );
}
