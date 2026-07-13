'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import FormFieldsEditor, { emptyFormField, normalizeFormFields } from '@/components/FormFieldsEditor';
import useRequireWrite from '@/hooks/useRequireWrite';
import PayFrequencySettings from '@/components/PayFrequencySettings';

export default function CreateRolePage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('registration_roles', '/roles/manage');
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [isShiftBased, setIsShiftBased] = useState(false);
  const [payFrequencies, setPayFrequencies] = useState([]);
  const [customPayDaysOptions, setCustomPayDaysOptions] = useState([]);
  const [customDayInput, setCustomDayInput] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState([emptyFormField(0)]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleRoleNameChange(value) {
    setRoleName(value);
    if (!formTitle || formTitle.endsWith(' Registration')) {
      setFormTitle(value.trim() ? `${value.trim()} Registration` : '');
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roleName.trim()) {
      setError('Role name is required');
      return;
    }

    const validFields = normalizeFormFields(fields);
    if (!validFields.length) {
      setError('Add at least one form field with a label');
      return;
    }

    if (payFrequencies.includes('custom_days') && customPayDaysOptions.length === 0) {
      setError('Add at least one custom day option, or unselect "Custom Days"');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const role = await api.roles.create({
        name: roleName.trim(),
        description: roleDescription.trim(),
        isShiftBased,
        payFrequencies,
        customPayDaysOptions: payFrequencies.includes('custom_days') ? customPayDaysOptions : [],
      });

      await api.forms.create({
        roleId: role._id,
        title: formTitle.trim() || `${role.name} Registration`,
        description: formDescription.trim(),
        fields: validFields,
      });

      setSuccess(`Role "${role.name}" and registration form created successfully.`);
      setRoleName('');
      setRoleDescription('');
      setIsShiftBased(false);
      setPayFrequencies([]);
      setCustomPayDaysOptions([]);
      setCustomDayInput('');
      setFormTitle('');
      setFormDescription('');
      setFields([emptyFormField(0)]);

      setTimeout(() => router.push('/roles/manage'), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (permLoading || !allowed) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title">1. Role Details</h3>
        <p className="section-desc">Define the role name and description</p>

        <div className="role-details-grid">
          <div className="form-group">
            <label>Role Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              value={roleName}
              onChange={(e) => handleRoleNameChange(e.target.value)}
              placeholder="e.g. Student, Staff, Visitor, Labour"
            />
          </div>
          <div className="form-group">
            <label>Role Description</label>
            <input
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Optional description for this role"
            />
          </div>
          <div className="form-group">
            <label>Shift Breakdown Selection</label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={isShiftBased}
                onChange={(e) => setIsShiftBased(e.target.checked)}
              />
              <span>Shift breakdown required for this role</span>
            </label>
          </div>
          <div className="form-group role-form-settings-grid__full">
            <PayFrequencySettings
              payFrequencies={payFrequencies}
              customPayDaysOptions={customPayDaysOptions}
              customDayInput={customDayInput}
              onTogglePayFrequency={togglePayFrequency}
              onCustomDayInputChange={setCustomDayInput}
              onAddCustomDayOption={addCustomDayOption}
              onRemoveCustomDayOption={removeCustomDayOption}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title">2. Registration Form</h3>
        <p className="section-desc">Design the dynamic registration form for this role</p>

        <div className="form-two-col-grid">
          <div className="form-group">
            <label>Form Title</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Staff Registration"
            />
          </div>
          <div className="form-group">
            <label>Form Description</label>
            <input
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optional form description"
            />
          </div>
        </div>

        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Form Fields</h4>
        <FormFieldsEditor fields={fields} onChange={setFields} />
      </div>

      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Creating Role & Form...' : 'Create Role & Form'}
      </button>
    </form>
  );
}
