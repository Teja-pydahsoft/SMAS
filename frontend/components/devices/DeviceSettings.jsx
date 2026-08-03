'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

const OS_OPTIONS = ['Windows 11', 'Windows 10', 'Windows Server 2022', 'Windows Server 2019', 'macOS', 'Ubuntu', 'Other Linux', 'Other'];

function SettingRow({ label, description, children }) {
  return (
    <div className="dm-setting-row">
      <div className="dm-setting-row__label-col">
        <span className="dm-setting-row__label">{label}</span>
        {description && <span className="dm-setting-row__desc">{description}</span>}
      </div>
      <div className="dm-setting-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`dm-toggle${checked ? ' dm-toggle--on' : ''}`}
    >
      <span className="dm-toggle__thumb" />
    </button>
  );
}

/**
 * DeviceMaintenanceModeToggle
 *
 * Isolated sub-component for the deviceMaintenanceEnabled toggle.
 * Handles the confirmation warning when enabling, and immediate disable without warning.
 */
function DeviceMaintenanceModeToggle({ value, onChange, disabled }) {
  const [showWarning, setShowWarning] = useState(false);

  function handleToggle(newValue) {
    if (newValue === true) {
      // Show confirmation warning before enabling
      setShowWarning(true);
    } else {
      // Disable immediately — no warning needed
      onChange(false);
    }
  }

  function handleConfirmEnable() {
    setShowWarning(false);
    onChange(true);
  }

  function handleCancelEnable() {
    setShowWarning(false);
  }

  return (
    <div className="dm-maintenance-mode-control">
      <div className="dm-maintenance-mode-toggle-row">
        <Toggle checked={value} onChange={handleToggle} disabled={disabled} />
        <span className={`dm-maintenance-mode-status ${value ? 'dm-maintenance-mode-status--on' : 'dm-maintenance-mode-status--off'}`}>
          {value ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="dm-maintenance-mode-state-desc">
        {value ? (
          <ul className="dm-maintenance-mode-requirements">
            <li>Require approved device</li>
            <li>Require Windows Agent</li>
            <li>Require fingerprint validation</li>
          </ul>
        ) : (
          <span className="dm-maintenance-mode-bypass-label">Normal Username + Password login</span>
        )}
      </div>

      {showWarning && (
        <div className="dm-maintenance-mode-warning" role="alertdialog" aria-modal="true" aria-labelledby="dm-warning-title">
          <div className="dm-maintenance-mode-warning__inner">
            <svg className="dm-maintenance-mode-warning__icon" width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p id="dm-warning-title" className="dm-maintenance-mode-warning__text">
              After enabling Device Maintenance, only approved devices can access the system.
              Ensure at least one administrator device has already been approved.
            </p>
            <div className="dm-maintenance-mode-warning__actions">
              <button type="button" className="btn-primary btn-sm" onClick={handleConfirmEnable}>
                Enable Device Maintenance
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={handleCancelEnable}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeviceSettings({ canWrite }) {
  const [form,    setForm]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [osInput, setOsInput] = useState('');

  useEffect(() => {
    api.devices.settings()
      .then((s) => {
        setForm({
          autoApprove:                s.autoApprove               ?? false,
          allowAutoRegistration:      s.allowAutoRegistration      ?? true,
          deviceExpirationDays:       s.deviceExpirationDays       ?? 0,
          maxDevicesAllowed:          s.maxDevicesAllowed           ?? 0,
          allowedOperatingSystems:    s.allowedOperatingSystems     ?? [],
          strictFingerprintValidation:s.strictFingerprintValidation ?? true,
          adminContactEmail:          s.adminContactEmail           ?? '',
          pendingMessage:             s.pendingMessage              ?? '',
          blockedMessage:             s.blockedMessage              ?? '',
          rejectedMessage:            s.rejectedMessage             ?? '',
          deviceMaintenanceEnabled:   s.deviceMaintenanceEnabled    ?? false,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess('');
  }

  function toggleOs(os) {
    setForm((prev) => {
      const list = prev.allowedOperatingSystems ?? [];
      return {
        ...prev,
        allowedOperatingSystems: list.includes(os)
          ? list.filter((o) => o !== os)
          : [...list, os],
      };
    });
    setSuccess('');
  }

  function addCustomOs() {
    const trimmed = osInput.trim();
    if (!trimmed) return;
    setForm((prev) => ({
      ...prev,
      allowedOperatingSystems: [...new Set([...(prev.allowedOperatingSystems ?? []), trimmed])],
    }));
    setOsInput('');
    setSuccess('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.devices.updateSettings(form);
      setSuccess('Settings saved successfully.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="admin-skeleton__line" style={{ height: 20, marginBottom: 14 }} />
        ))}
      </div>
    );
  }

  if (!form) return <p className="error-msg">{error || 'Failed to load settings.'}</p>;

  return (
    <form className="dm-settings" onSubmit={handleSave}>
      {error   && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      {/* ── Security ── */}
      <div className="dm-settings-section">
        <h3 className="dm-settings-section__title">Security</h3>

        {/* Device Maintenance Mode — master feature flag */}
        <SettingRow
          label="Device Maintenance"
          description="When enabled, users can only log in from approved devices using the SAMS Device Agent. When disabled, device validation is skipped and normal username/password authentication is used."
        >
          <DeviceMaintenanceModeToggle
            value={form.deviceMaintenanceEnabled}
            onChange={(v) => set('deviceMaintenanceEnabled', v)}
            disabled={!canWrite}
          />
        </SettingRow>

        <SettingRow label="Strict Fingerprint Validation"
          description="Require a full 64-character SHA-256 fingerprint. Disable only for testing.">
          <Toggle checked={form.strictFingerprintValidation} onChange={(v) => set('strictFingerprintValidation', v)} disabled={!canWrite} />
        </SettingRow>
        <SettingRow label="Device Expiration (days)"
          description="Approved devices expire after this many days and require re-approval. 0 = never expires.">
          <input
            type="number" min="0" max="3650"
            className="dm-settings-number"
            value={form.deviceExpirationDays}
            onChange={(e) => set('deviceExpirationDays', Number(e.target.value))}
            disabled={!canWrite}
          />
        </SettingRow>
        <SettingRow label="Allowed Operating Systems"
          description="If any are selected, only devices matching these OS strings (case-insensitive) can register. Leave all unchecked to allow any OS.">
          <div className="dm-settings-os-grid">
            {OS_OPTIONS.map((os) => (
              <label key={os} className="checkbox-option dm-settings-os-option">
                <input
                  type="checkbox"
                  checked={(form.allowedOperatingSystems ?? []).includes(os)}
                  onChange={() => toggleOs(os)}
                  disabled={!canWrite}
                />
                <span>{os}</span>
              </label>
            ))}
          </div>
          {canWrite && (
            <div className="dm-settings-os-custom">
              <input
                type="text"
                placeholder="Add custom OS string…"
                value={osInput}
                onChange={(e) => setOsInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomOs(); } }}
                className="dm-settings-os-input"
              />
              <button type="button" className="btn-secondary btn-sm" onClick={addCustomOs}>Add</button>
            </div>
          )}
          {(form.allowedOperatingSystems ?? []).filter((o) => !OS_OPTIONS.includes(o)).map((os) => (
            <div key={os} className="dm-settings-os-custom-tag">
              <code>{os}</code>
              {canWrite && (
                <button type="button" className="dm-settings-os-remove"
                  onClick={() => toggleOs(os)} aria-label={`Remove ${os}`}>✕</button>
              )}
            </div>
          ))}
        </SettingRow>
      </div>

      {/* ── Registration ── */}
      <div className="dm-settings-section">
        <h3 className="dm-settings-section__title">Registration</h3>
        <SettingRow label="Allow New Devices"
          description="When enabled, unrecognised devices are automatically registered as pending.">
          <Toggle checked={form.allowAutoRegistration} onChange={(v) => set('allowAutoRegistration', v)} disabled={!canWrite} />
        </SettingRow>
        <SettingRow label="Auto-Approve Devices"
          description="Newly registered devices are automatically approved without manual review.">
          <Toggle checked={form.autoApprove} onChange={(v) => set('autoApprove', v)} disabled={!canWrite} />
        </SettingRow>
        <SettingRow label="Maximum Devices"
          description="Maximum number of approved devices allowed. 0 = unlimited.">
          <input
            type="number" min="0" max="9999"
            className="dm-settings-number"
            value={form.maxDevicesAllowed}
            onChange={(e) => set('maxDevicesAllowed', Number(e.target.value))}
            disabled={!canWrite}
          />
        </SettingRow>
      </div>

      {/* ── Messages ── */}
      <div className="dm-settings-section">
        <h3 className="dm-settings-section__title">User-Facing Messages</h3>
        <SettingRow label="Admin Contact Email">
          <input type="email" className="dm-settings-text" value={form.adminContactEmail}
            onChange={(e) => set('adminContactEmail', e.target.value)} disabled={!canWrite}
            placeholder="admin@yourorg.com" />
        </SettingRow>
        <SettingRow label="Pending Message"
          description="Shown when a device is awaiting approval.">
          <textarea rows={2} className="dm-settings-textarea" value={form.pendingMessage}
            onChange={(e) => set('pendingMessage', e.target.value)} disabled={!canWrite} />
        </SettingRow>
        <SettingRow label="Blocked Message"
          description="Shown when a device has been blocked.">
          <textarea rows={2} className="dm-settings-textarea" value={form.blockedMessage}
            onChange={(e) => set('blockedMessage', e.target.value)} disabled={!canWrite} />
        </SettingRow>
        <SettingRow label="Rejected Message"
          description="Shown when a device registration was rejected.">
          <textarea rows={2} className="dm-settings-textarea" value={form.rejectedMessage}
            onChange={(e) => set('rejectedMessage', e.target.value)} disabled={!canWrite} />
        </SettingRow>
      </div>

      {canWrite && (
        <div className="dm-settings-footer">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {!canWrite && (
        <p className="read-only-banner">View only — you need write access to change settings.</p>
      )}
    </form>
  );
}
