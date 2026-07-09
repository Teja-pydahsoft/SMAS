'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import FormFieldsEditor, { emptyFormField, normalizeFormFields } from '@/components/FormFieldsEditor';

export default function RoleFormBuilderPage() {
  const params = useParams();
  const roleId = params.roleId;
  const [role, setRole] = useState(null);
  const [isShiftBased, setIsShiftBased] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([emptyFormField(0)]);
  const [formId, setFormId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (roleId) loadData();
  }, [roleId]);

  async function loadData() {
    setInitialLoading(true);
    try {
      const r = await api.roles.get(roleId);
      setRole(r);
      setIsShiftBased(Boolean(r.isShiftBased));
      try {
        const form = await api.forms.getByRole(roleId);
        setFormId(form._id);
        setTitle(form.title);
        setDescription(form.description);
        setFields(form.fields.length ? form.fields : [emptyFormField(0)]);
      } catch {
        setTitle(`${r.name} Registration`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setInitialLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const validFields = normalizeFormFields(fields);
    if (!validFields.length) {
      setError('Add at least one field with a label');
      setLoading(false);
      return;
    }

    try {
      // Save shift setting back to the role
      await api.roles.update(roleId, { isShiftBased });

      if (formId) {
        await api.forms.update(formId, { title, description, fields: validFields });
      } else {
        const form = await api.forms.create({ roleId, title, description, fields: validFields });
        setFormId(form._id);
      }
      setSuccess('Role settings and form saved successfully');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  if (!role) return <p className="error-msg">{error || 'Role not found'}</p>;

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Editing form for role: <strong style={{ color: 'var(--text)' }}>{role.name}</strong>
        </p>
      </div>

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Form Settings</h3>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
              <label>Form Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
              <label>Shift Breakdown Selection</label>
              <label className="checkbox-option" style={{ marginTop: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={isShiftBased}
                  onChange={(e) => setIsShiftBased(e.target.checked)}
                />
                <span>Shift breakdown required for this role</span>
              </label>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Form Fields</h3>
          <FormFieldsEditor fields={fields} onChange={setFields} />
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Form'}
          </button>
          <Link href="/roles/manage">
            <button type="button" className="btn-secondary">Back to Manage Roles</button>
          </Link>
        </div>
      </form>
    </div>
  );
}
