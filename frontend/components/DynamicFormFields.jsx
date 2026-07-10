'use client';

import { useEffect, useState } from 'react';
import { hasMediaValue, isImageMedia, parseMediaValue, resolveMediaUrl } from '@/lib/mediaUtils';

export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox', 'media'];

function MediaFieldInput({ field, value, pendingFile, onFileSelect, readOnly }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const savedMedia = parseMediaValue(value);
  const displayMedia = pendingFile
    ? {
        originalName: pendingFile.name,
        mimetype: pendingFile.type,
        extension: pendingFile.name.includes('.') ? `.${pendingFile.name.split('.').pop().toLowerCase()}` : '',
      }
    : savedMedia;
  const showAsImage = pendingFile
    ? pendingFile.type.startsWith('image/')
    : isImageMedia(savedMedia);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return undefined;
    }
    if (!pendingFile.type.startsWith('image/')) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  if (readOnly) {
    if (!savedMedia) {
      return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No file uploaded</p>;
    }
    if (isImageMedia(savedMedia)) {
      return (
        <div className="media-field-preview">
          <img src={resolveMediaUrl(savedMedia.url || savedMedia.path)} alt={field.label} className="media-field-preview__image" />
          <p className="media-field-preview__name">{savedMedia.originalName}</p>
        </div>
      );
    }
    return (
      <div className="media-field-doc">
        <span className="media-field-doc__ext">{(savedMedia.extension || '').replace('.', '').toUpperCase() || 'FILE'}</span>
        <span className="media-field-doc__name">{savedMedia.originalName}</span>
      </div>
    );
  }

  return (
    <div className="media-field-input">
      <input
        type="file"
        accept="*/*"
        onChange={(e) => onFileSelect?.(e.target.files?.[0] || null)}
        aria-label={`Upload file for ${field.label}`}
      />
      {field.placeholder && (
        <p className="media-field-input__hint">{field.placeholder}</p>
      )}
      {(pendingFile || savedMedia) && displayMedia && (
        <div className="media-field-input__current">
          {showAsImage && (previewUrl || savedMedia?.url || savedMedia?.path) ? (
            <img
              src={previewUrl || resolveMediaUrl(savedMedia?.url || savedMedia?.path)}
              alt=""
              className="media-field-preview__image media-field-preview__image--small"
            />
          ) : (
            <span className="media-field-doc__ext">
              {(displayMedia.extension || '').replace('.', '').toUpperCase() || 'FILE'}
            </span>
          )}
          <span className="media-field-doc__name">
            {displayMedia.originalName}
            {pendingFile ? ' (pending upload)' : ''}
          </span>
          {(pendingFile || savedMedia) && (
            <button
              type="button"
              className="btn-secondary media-field-input__clear"
              onClick={() => onFileSelect?.(null)}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DynamicFormFields({
  fields,
  values,
  onChange,
  readOnly = false,
  pendingMediaFiles = {},
  onMediaChange,
}) {
  function handleChange(fieldId, value) {
    onChange({ ...values, [fieldId]: value });
  }

  return (
    <div className="dynamic-form">
      {fields
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((field) => (
          <div key={field.fieldId} className="form-group">
            <label>
              {field.label}
              {field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
            </label>

            {field.type === 'media' ? (
              <MediaFieldInput
                field={field}
                value={values[field.fieldId]}
                pendingFile={pendingMediaFiles[field.fieldId]}
                onFileSelect={(file) => onMediaChange?.(field.fieldId, file)}
                readOnly={readOnly}
              />
            ) : field.type === 'textarea' ? (
              <textarea
                value={values[field.fieldId] || ''}
                onChange={(e) => handleChange(field.fieldId, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                disabled={readOnly}
              />
            ) : field.type === 'select' ? (
              <select
                value={values[field.fieldId] || ''}
                onChange={(e) => handleChange(field.fieldId, e.target.value)}
                disabled={readOnly}
              >
                <option value="">Select...</option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === 'checkbox' ? (
              <label className="checkbox-option" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(values[field.fieldId])}
                  onChange={(e) => handleChange(field.fieldId, e.target.checked)}
                  disabled={readOnly}
                />
                <span>{field.placeholder || 'Yes'}</span>
              </label>
            ) : (
              <input
                type={field.type === 'phone' ? 'tel' : field.type}
                value={values[field.fieldId] || ''}
                onChange={(e) => handleChange(field.fieldId, e.target.value)}
                placeholder={field.placeholder}
                disabled={readOnly}
              />
            )}
          </div>
        ))}
    </div>
  );
}

export function validateMediaFields(fields, values, pendingMediaFiles = {}) {
  for (const field of fields) {
    if (field.type !== 'media' || !field.required) continue;
    const hasSaved = hasMediaValue(values[field.fieldId]);
    const hasPending = Boolean(pendingMediaFiles[field.fieldId]);
    if (!hasSaved && !hasPending) {
      return `Please upload a file for "${field.label}"`;
    }
  }
  return null;
}
