'use client';

import { isPdfMedia, resolveMediaUrl } from '@/lib/mediaUtils';

export default function MediaDocumentModal({ document, onClose }) {
  if (!document) return null;

  const extLabel = (document.extension || '').replace('.', '').toUpperCase() || 'FILE';
  const fileUrl = resolveMediaUrl(document.url || document.path);
  const canEmbed = (document.isImage || isPdfMedia(document)) && fileUrl;

  return (
    <div className="pass-modal-overlay media-doc-overlay" onClick={onClose}>
      <div className="media-doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-doc-modal__header">
          <div>
            <p className="media-doc-modal__ext">{extLabel}</p>
            <h3 className="media-doc-modal__title">{document.label}</h3>
            <p className="media-doc-modal__filename">{document.originalName}</p>
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

        <div className="media-doc-modal__body">
          {canEmbed && document.isImage ? (
            <img src={fileUrl} alt={document.label} className="media-doc-modal__image" />
          ) : canEmbed ? (
            <iframe
              src={fileUrl}
              title={document.originalName}
              className="media-doc-modal__iframe"
            />
          ) : (
            <div className="media-doc-modal__fallback">
              <span className="media-doc-modal__ext media-doc-modal__ext--large">{extLabel}</span>
              <p>This file type cannot be previewed in the browser.</p>
            </div>
          )}
        </div>

        <div className="media-doc-modal__footer">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Open {extLabel} file
          </a>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
