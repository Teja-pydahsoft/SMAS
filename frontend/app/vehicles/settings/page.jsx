"use client";

import React, { useState, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import PageTabs from '@/components/PageTabs';
import { api } from '@/lib/api/client';
import AdminIcon from '@/components/admin/AdminIcons';

export default function VehicleSettingsPage() {
  const [settings, setSettings] = useState({ ocrEnabled: true, qrEnabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const tabs = [
    { label: 'Vehicles', path: '/vehicles' },
    { label: 'Categories', path: '/vehicles/categories' },
    { label: 'Types', path: '/vehicles/types' },
    { label: 'Settings', path: '/vehicles/settings' }
  ];

  useEffect(() => {
    setLoading(true);
    api.vehicles.settings()
      .then(data => {
        if (data) {
          setSettings(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message || 'Failed to load vehicle settings');
        setLoading(false);
      });
  }, []);

  const handleToggleOcr = () => {
    setSettings(prev => {
      const nextOcr = !prev.ocrEnabled;
      const nextQr = !nextOcr ? true : prev.qrEnabled; // if OCR is turned OFF, turn ON QR by default
      return { ...prev, ocrEnabled: nextOcr, qrEnabled: nextQr };
    });
  };

  const handleToggleQr = () => {
    setSettings(prev => {
      const nextQr = !prev.qrEnabled;
      // if QR is turned OFF, turn ON OCR by default to guarantee some form of verification is active
      const nextOcr = !nextQr ? true : prev.ocrEnabled; 
      return { ...prev, qrEnabled: nextQr, ocrEnabled: nextOcr };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await api.vehicles.updateSettings(settings);
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toolbar = (
    <button 
      onClick={handleSave} 
      disabled={saving || loading}
      className="admin-btn admin-btn--primary"
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px' }}
    >
      {saving ? 'Saving...' : 'Save Settings'}
    </button>
  );

  return (
    <PageShell 
      title="Vehicle Settings" 
      description="Configure machine vision AI and QR enrollment behaviors."
      toolbar={toolbar}
    >
      <PageTabs tabs={tabs} />
      
      <div className="admin-page-content" style={{ marginTop: '1.5rem', maxWidth: '800px' }}>
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AdminIcon name="alert" /> {error}
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Settings saved successfully!
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <div className="dash-loading__spinner"></div>
          </div>
        ) : (
          <div className="admin-panel glass-panel admin-fade-in" style={{ padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              Machine Vision & Gate Verification
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* TOGGLE 1: OCR */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                  <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>Enable OCR Scanning</span>
                  <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                    Automatically detect and transcribe vehicle license plates using Cloud OCR. Disabling this skips AI analysis during enrollment and allows direct manual entries.
                  </span>
                </div>
                
                {/* Switch Toggle */}
                <button 
                  type="button"
                  onClick={handleToggleOcr}
                  style={{
                    width: '54px',
                    height: '28px',
                    borderRadius: '9999px',
                    backgroundColor: settings.ocrEnabled ? 'var(--primary)' : 'var(--border-color)',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                    padding: 0
                  }}
                  aria-pressed={settings.ocrEnabled}
                >
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: settings.ocrEnabled ? '29px' : '3px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>

              {/* TOGGLE 2: QR */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                  <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>Enable QR Enrollment</span>
                  <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                    Generate printable entry/exit pass QR codes for registered logistics equipment. 
                    <strong style={{ color: 'var(--warning)', marginLeft: '4px' }}>
                      (Required and turned ON automatically if OCR scanning is disabled).
                    </strong>
                  </span>
                </div>
                
                {/* Switch Toggle */}
                <button 
                  type="button"
                  onClick={handleToggleQr}
                  style={{
                    width: '54px',
                    height: '28px',
                    borderRadius: '9999px',
                    backgroundColor: settings.qrEnabled ? 'var(--primary)' : 'var(--border-color)',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                    padding: 0
                  }}
                  aria-pressed={settings.qrEnabled}
                >
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: settings.qrEnabled ? '29px' : '3px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>

            </div>

            {/* Note alert */}
            {!settings.ocrEnabled && (
              <div style={{ 
                marginTop: '2.5rem', 
                backgroundColor: '#fffbeb', 
                border: '1px solid #fef08a', 
                borderRadius: '8px', 
                padding: '1rem', 
                color: '#854d0e',
                fontSize: '0.875rem',
                lineHeight: '1.4',
                display: 'flex',
                gap: '8px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <div>
                  <strong>OCR is currently disabled</strong>. The camera scanner on the New Vehicle Registration page will capture photos but will not run AI transcription. You must enter vehicle plate numbers manually, and gate verification will fall back to QR code verification by default.
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </PageShell>
  );
}
