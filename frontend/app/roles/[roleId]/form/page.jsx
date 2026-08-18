'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import FormFieldsEditor, { emptyFormField, normalizeFormFields } from '@/components/FormFieldsEditor';
import PayFrequencySettings from '@/components/PayFrequencySettings';

export default function RoleFormBuilderPage() {
  const params = useParams();
  const roleId = params.roleId;
  const [role, setRole] = useState(null);
  const [isShiftBased, setIsShiftBased] = useState(false);
  const [payFrequencies, setPayFrequencies] = useState([]);
  const [customPayDaysOptions, setCustomPayDaysOptions] = useState([]);
  const [customDayInput, setCustomDayInput] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([emptyFormField(0)]);
  const [formId, setFormId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [usedOptions, setUsedOptions] = useState({});

  useEffect(() => {
    if (roleId) loadData();
  }, [roleId]);

  async function loadData() {
    setInitialLoading(true);
    try {
      const r = await api.roles.get(roleId);
      setRole(r);
      setIsShiftBased(Boolean(r.isShiftBased));
      setPayFrequencies(Array.isArray(r.payFrequencies) ? r.payFrequencies : []);
      setCustomPayDaysOptions(Array.isArray(r.customPayDaysOptions) ? r.customPayDaysOptions : []);
      try {
        const form = await api.forms.getByRole(roleId);
        setFormId(form._id);
        setTitle(form.title);
        setDescription(form.description);
        setFields(form.fields.length ? form.fields : [emptyFormField(0)]);
        
        try {
          const used = await api.forms.getUsedOptions(form._id);
          setUsedOptions(used);
        } catch (err) {
          console.error('Failed to load used options:', err);
        }
      } catch {
        setTitle(`${r.name} Registration`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setInitialLoading(false);
    }
  }

  function togglePayFrequency(value) {
    setPayFrequencies((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      if (value === 'custom_days' && !next.includes('custom_days')) {
        setCustomPayDaysOptions([]);
        setCustomDayInput('');
      }
      return next;
    });
  }

  function addCustomDayOption() {
    const days = Number(customDayInput);
    if (!Number.isInteger(days) || days < 1) {
      setError('Enter a valid number of days (1 or more)');
      return;
    }
    if (customPayDaysOptions.includes(days)) {
      setCustomDayInput('');
      return;
    }
    setError('');
    setCustomPayDaysOptions((prev) => [...prev, days].sort((a, b) => a - b));
    setCustomDayInput('');
  }

  function removeCustomDayOption(days) {
    setCustomPayDaysOptions((prev) => prev.filter((item) => item !== days));
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

    if (payFrequencies.includes('custom_days') && customPayDaysOptions.length === 0) {
      setError('Add at least one custom day option, or unselect "Custom Days"');
      setLoading(false);
      return;
    }

    try {
      // Save shift setting back to the role
      await api.roles.update(roleId, {
        isShiftBased,
        payFrequencies,
        customPayDaysOptions: payFrequencies.includes('custom_days') ? customPayDaysOptions : [],
      });

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

  async function handleMigrateOption(fieldId, oldValue, newValue) {
    if (!formId) return;
    try {
      setLoading(true);
      await api.forms.migrateOption(formId, { fieldId, oldValue, newValue });
      const used = await api.forms.getUsedOptions(formId);
      setUsedOptions(used);
      setSuccess('Option data successfully migrated.');
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
          <div className="role-form-settings-grid">
            <div className="form-group">
              <label>Form Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Form Fields</h3>
          <FormFieldsEditor fields={fields} onChange={setFields} usedOptions={usedOptions} onMigrateOption={handleMigrateOption} />
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
