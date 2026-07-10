'use client';

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
  placeholder: '',
  options: [],
  order: 0,
});

export default function FormFieldsEditor({ fields, onChange }) {
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

  function addOption(fieldIndex) {
    const options = [...(fields[fieldIndex].options || []), ''];
    updateField(fieldIndex, 'options', options);
  }

  function removeOption(fieldIndex, optionIndex) {
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
                      onChange={(e) => updateOption(index, optIndex, e.target.value)}
                      placeholder={`Option ${optIndex + 1}`}
                      aria-label={`Option ${optIndex + 1}`}
                    />
                    <button
                      type="button"
                      className="form-field-option-remove"
                      onClick={() => removeOption(index, optIndex)}
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
