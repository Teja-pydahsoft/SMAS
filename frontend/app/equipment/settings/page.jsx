"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';

import PageShell from '@/components/PageShell';
import PageTabs from '@/components/PageTabs';

function SettingsContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'equipment';

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.equipment.settings()
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        alert(err.message || 'Failed to load settings');
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.equipment.updateSettings(settings);
      alert('Settings saved successfully!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleThresholdChange = (index, field, value) => {
    const updated = { ...settings };
    updated.thresholds[index][field] = value;
    setSettings(updated);
  };

  const toolbar = (
    <button 
      onClick={handleSave} 
      disabled={saving}
      className="btn-primary"
    >
      {saving ? 'Saving...' : 'Save Settings'}
    </button>
  );

  const tabs = [
    { label: 'Equipment Settings', path: '/equipment/settings?tab=equipment' },
    { label: 'Alert Configuration', path: '/equipment/settings?tab=alerts' }
  ];

  if (loading) {
    return (
      <PageShell title="Equipment Settings" toolbar={toolbar}>
        <PageTabs tabs={tabs} />
        <div className="p-6 text-gray-500">Loading settings...</div>
      </PageShell>
    );
  }

  return (
    <PageShell 
      title="Equipment Settings" 
      description="Configure enterprise equipment settings and notifications."
      toolbar={toolbar}
    >
      <PageTabs tabs={tabs} />
      
      <div className="space-y-6 max-w-4xl px-6 pb-6">
        {tab === 'equipment' ? (
          <div className="card text-center py-12 text-gray-500">
            Equipment Settings are currently being constructed.
          </div>
        ) : (
          <>
            <div className="card">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Global Settings</h2>
              <div className="checkbox-group mt-4">
                <label className="checkbox-option" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input 
                    type="checkbox" 
                    checked={settings.enabled} 
                    onChange={e => setSettings({ ...settings, enabled: e.target.checked })} 
                  />
                  <span>Enable Idle Monitoring</span>
                </label>
                <label className="checkbox-option" style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={settings.dashboardNotifications} 
                    onChange={e => setSettings({ ...settings, dashboardNotifications: e.target.checked })} 
                  />
                  <span>Enable Dashboard Notifications</span>
                </label>
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-semibold mb-2 border-b pb-2">Alert Thresholds</h2>
              <p className="text-sm text-gray-500 mb-6">
                Configure when idle alerts should be generated. Background monitor runs every 5 minutes.
              </p>

              <div className="space-y-4">
                {settings.thresholds.map((t, i) => (
                  <div key={t.key} className="flex items-center gap-4 p-4 border rounded bg-gray-50">
                    <label className="checkbox-option flex items-center gap-2 flex-1" style={{ margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={t.enabled}
                        onChange={e => handleThresholdChange(i, 'enabled', e.target.checked)}
                      />
                      <span className="font-medium ml-2">{t.label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        className="border rounded p-2 w-24 text-right bg-white"
                        value={t.minutes}
                        onChange={e => handleThresholdChange(i, 'minutes', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-sm text-gray-600 font-medium">Minutes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

export default function EquipmentSettingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
