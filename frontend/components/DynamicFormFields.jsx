'use client';

export const FIELD_TYPES = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'checkbox'];

export default function DynamicFormFields({ fields, values, onChange, readOnly = false }) {
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

            {field.type === 'textarea' ? (
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
