'use client';

export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox'];

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
              onChange={(e) => updateField(index, 'type', e.target.value)}
              aria-label="Field type"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
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
            <div className="form-field-options">
              <label className="form-field-options-label">Options (comma-separated)</label>
              <input
                value={(field.options || []).join(', ')}
                onChange={(e) =>
                  updateField(
                    index,
                    'options',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="Option 1, Option 2"
              />
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
      options: f.type === 'select' ? f.options : [],
    }));
}
