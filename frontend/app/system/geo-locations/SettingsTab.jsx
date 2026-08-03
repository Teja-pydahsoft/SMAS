'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

export default function SettingsTab({ canWrite }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState({
    geoLocationEnabled: false,
    accuracyThreshold: 100,
    superAdminBypass: true,
    mobileLoginEnabled: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError('');
      const data = await api.geoLocations.settings();
      setSettings({
        geoLocationEnabled: data.geoLocationEnabled ?? false,
        accuracyThreshold: data.accuracyThreshold ?? 100,
        superAdminBypass: data.superAdminBypass ?? true,
        mobileLoginEnabled: data.mobileLoginEnabled ?? true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.geoLocations.updateSettings(settings);
      setSettings({
        geoLocationEnabled: data.geoLocationEnabled,
        accuracyThreshold: data.accuracyThreshold,
        superAdminBypass: data.superAdminBypass,
        mobileLoginEnabled: data.mobileLoginEnabled,
      });
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card empty-state"><p>Loading settings...</p></div>;

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <h3 className="section-title" style={{ marginBottom: '1.5rem' }}>Security Settings</h3>
      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <p className="success-msg" style={{ marginBottom: '1rem', color: 'var(--success)' }}>{success}</p>}
      
      <form onSubmit={handleSave}>
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <label className="checkbox-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <input 
              type="checkbox" 
              checked={settings.geoLocationEnabled} 
              onChange={(e) => setSettings({ ...settings, geoLocationEnabled: e.target.checked })}
              disabled={!canWrite}
            />
            Enable Geo Location Access Control
          </label>
          <p className="field-hint" style={{ paddingLeft: '1.5rem' }}>
            When enabled, users must be physically within one of their permitted locations to log in.
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="accuracyThreshold">Accuracy Threshold (meters)</label>
          <input 
            id="accuracyThreshold"
            type="number" 
            min="10"
            max="10000"
            value={settings.accuracyThreshold} 
            onChange={(e) => setSettings({ ...settings, accuracyThreshold: Number(e.target.value) })}
            disabled={!canWrite}
          />
          <p className="field-hint">
            The maximum acceptable GPS accuracy radius. If a device reports a worse accuracy (e.g., 500m) than this threshold, login will be denied.
          </p>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <label className="checkbox-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <input 
              type="checkbox" 
              checked={settings.superAdminBypass} 
              onChange={(e) => setSettings({ ...settings, superAdminBypass: e.target.checked })}
              disabled={!canWrite}
            />
            Super Admin Bypass
          </label>
          <p className="field-hint" style={{ paddingLeft: '1.5rem' }}>
            Allow Super Admins to bypass the location check completely.
          </p>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <label className="checkbox-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <input 
              type="checkbox" 
              checked={settings.mobileLoginEnabled} 
              onChange={(e) => setSettings({ ...settings, mobileLoginEnabled: e.target.checked })}
              disabled={!canWrite}
            />
            Allow Mobile Login
          </label>
          <p className="field-hint" style={{ paddingLeft: '1.5rem' }}>
            Allow logins from mobile devices. If disabled, smartphones and tablets will be blocked.
          </p>
        </div>

        {canWrite && (
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        )}
      </form>
    </div>
  );
}
