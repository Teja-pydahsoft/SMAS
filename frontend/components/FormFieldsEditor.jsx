'use client';

import { useState } from 'react';

export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox', 'media'];

const FIELD_TYPE_LABELS = {
  text: 'text',
  number: 'number',
  email: 'email',
  phone: 'phone',
  date: 'date',
  select: 'select',
  textarea: 'textarea',
  checkbox: 'checkbox',
  media: 'media upload',
};

export const emptyFormField = (order = 0) => ({
  fieldId: `__draft__${order}`,
  label: '',
  type: 'text',
  required: false,
  unique: false,
  placeholder: '',
  options: [],
  order: 0,
});

export default function FormFieldsEditor({ fields, onChange, usedOptions = {}, onMigrateOption }) {
  const [unlockedOptions, setUnlockedOptions] = useState(new Set());
  const [modalState, setModalState] = useState({ isOpen: false, type: '', fieldIndex: null, optionIndex: null, originalValue: '', newValue: '', users: [], replacementValue: '' });

  function closeModal() {
    setModalState({ isOpen: false, type: '', fieldIndex: null, optionIndex: null, originalValue: '', newValue: '', users: [], replacementValue: '' });
  }

  async function confirmModalAction() {
    const { type, fieldIndex, optionIndex, originalValue, newValue, replacementValue } = modalState;
    const field = fields[fieldIndex];

    if (type === 'edit') {
      if (onMigrateOption) {
        await onMigrateOption(field.fieldId, originalValue, newValue);
      }
      const newUnlocked = new Set(unlockedOptions);
      newUnlocked.add(`${field.fieldId}-${originalValue}`);
      setUnlockedOptions(newUnlocked);
      updateOption(fieldIndex, optionIndex, newValue);
    } else if (type === 'remove') {
      if (onMigrateOption) {
        await onMigrateOption(field.fieldId, originalValue, replacementValue);
      }
      const options = (fields[fieldIndex].options || []).filter((_, i) => i !== optionIndex);
      updateField(fieldIndex, 'options', options);
    }
    closeModal();
  }

  function updateField(index, key, value) {
    onChange(fields.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  }

  function updateFieldType(index, type) {
    if (type === 'select' && !(fields[index].options || []).length) {
      onChange(
        fields.map((f, i) => (i === index ? { ...f, type, options: [''] } : f))
      );
      return;
    }
    updateField(index, 'type', type);
  }

  function updateOption(fieldIndex, optionIndex, value) {
    const options = [...(fields[fieldIndex].options || [])];
    options[optionIndex] = value;
    updateField(fieldIndex, 'options', options);
  }

  function handleOptionChange(fieldIndex, optionIndex, originalValue, newValue) {
    const field = fields[fieldIndex];
    const optionUsers = usedOptions?.[field.fieldId]?.[originalValue] || [];
    const isUsed = optionUsers.length > 0;

    if (isUsed && !unlockedOptions.has(`${field.fieldId}-${originalValue}`)) {
      setModalState({
        isOpen: true,
        type: 'edit',
        fieldIndex,
        optionIndex,
        originalValue,
        newValue,
        users: optionUsers
      });
    } else {
      updateOption(fieldIndex, optionIndex, newValue);
    }
  }

  function addOption(fieldIndex) {
    const options = [...(fields[fieldIndex].options || []), ''];
    updateField(fieldIndex, 'options', options);
  }

  function handleRemoveOption(fieldIndex, optionIndex, originalValue) {
    const field = fields[fieldIndex];
    const optionUsers = usedOptions?.[field.fieldId]?.[originalValue] || [];
    const isUsed = optionUsers.length > 0;

    if (isUsed) {
      setModalState({
        isOpen: true,
        type: 'remove',
        fieldIndex,
        optionIndex,
        originalValue,
        newValue: '',
        users: optionUsers
      });
      return;
    }
    const options = (fields[fieldIndex].options || []).filter((_, i) => i !== optionIndex);
    updateField(fieldIndex, 'options', options);
  }

  function addField() {
    onChange([...fields, { ...emptyFormField(fields.length), order: fields.length }]);
  }

  function removeField(index) {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <div className="form-fields-editor">
      <div className="form-fields-head">
        <span>Field Label</span>
        <span>Type</span>
        <span>Required</span>
        <span title="Must be unique across all registrations">Unique</span>
        <span>Placeholder</span>
        <span aria-hidden="true" />
      </div>

      {fields.map((field, index) => (
        <div key={`field-row-${index}`} className="form-field-inline-wrap">
          <div className="form-field-inline">
            <input
              value={field.label}
              onChange={(e) => updateField(index, 'label', e.target.value)}
              placeholder="e.g. Full Name"
              aria-label="Field label"
            />
            <select
              value={field.type}
              onChange={(e) => updateFieldType(index, e.target.value)}
              aria-label="Field type"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t] || t}</option>
              ))}
            </select>
            <select
              value={String(field.required)}
              onChange={(e) => updateField(index, 'required', e.target.value === 'true')}
              aria-label="Required"
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
            <div className="form-field-checkbox" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={field.unique || false}
                onChange={(e) => updateField(index, 'unique', e.target.checked)}
                aria-label="Unique"
                title="Require this field to be unique across registrations"
                style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }}
              />
            </div>
            <input
              value={field.placeholder}
              onChange={(e) => updateField(index, 'placeholder', e.target.value)}
              placeholder="Placeholder text"
              aria-label="Placeholder"
            />
            {fields.length > 1 ? (
              <button
                type="button"
                className="btn-danger btn-icon"
                onClick={() => removeField(index)}
                title="Remove field"
                aria-label="Remove field"
              >
                ✕
              </button>
            ) : (
              <span />
            )}
          </div>

          {field.type === 'select' && (
            <div className="form-field-options form-field-options--inline">
              <label className="form-field-options-label">Options</label>
              <div className="form-field-options-list">
                {(field.options || []).map((opt, optIndex) => (
                  <div key={`option-${index}-${optIndex}`} className="form-field-option-cell">
                    <input
                      value={opt}
                      onChange={(e) => handleOptionChange(index, optIndex, opt, e.target.value)}
                      placeholder={`Option ${optIndex + 1}`}
                      aria-label={`Option ${optIndex + 1}`}
                    />
                    <button
                      type="button"
                      className="form-field-option-remove"
                      onClick={() => handleRemoveOption(index, optIndex, opt)}
                      title="Remove option"
                      aria-label="Remove option"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="form-field-option-add"
                  onClick={() => addOption(index)}
                  title="Add option"
                  aria-label="Add option"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button type="button" className="btn-secondary" onClick={addField} style={{ marginTop: '0.75rem' }}>
        + Add Field
      </button>

      {modalState.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--danger, #e74c3c)' }}>
              Warning: Option In Use
            </h3>
            <p>
              The option <strong>"{modalState.originalValue}"</strong> is currently used by{' '}
              <strong>{modalState.users.length}</strong> {modalState.users.length === 1 ? 'person' : 'people'}.
            </p>
            <p style={{ marginBottom: '0.5rem' }}>
              {modalState.type === 'edit'
                ? 'Editing this option will affect existing data. Are you sure you want to proceed?'
                : 'Removing this option might cause unexpected data inconsistencies. Are you sure you want to proceed?'}
            </p>
            
            <div style={{ 
              background: 'var(--bg-secondary, #f8f9fa)', 
              padding: '0.75rem', 
              borderRadius: '6px',
              maxHeight: '200px',
              overflowY: 'auto',
              marginBottom: '1.5rem',
              border: '1px solid var(--border-color, #e0e0e0)'
            }}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                {modalState.users.map((user, i) => (
                  <li key={i}>{user.name} {user.code ? `(${user.code})` : ''}</li>
                ))}
              </ul>
            </div>

            {modalState.type === 'remove' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Select replacement option for these persons:
                </label>
                <select 
                  value={modalState.replacementValue} 
                  onChange={e => setModalState({ ...modalState, replacementValue: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)' }}
                >
                  <option value="">-- Clear their data (No replacement) --</option>
                  {(fields[modalState.fieldIndex]?.options || [])
                    .filter(opt => opt !== modalState.originalValue)
                    .map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={confirmModalAction}>
                Yes, {modalState.type === 'edit' ? 'Edit' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function normalizeFormFields(fields) {
  return fields
    .filter((f) => f.label.trim())
    .map((f, i) => ({
      ...f,
      fieldId: f.fieldId?.startsWith('__draft__') ? undefined : f.fieldId,
      order: i,
      options: f.type === 'select' ? (f.options || []).map((s) => s.trim()).filter(Boolean) : [],
    }));
}
