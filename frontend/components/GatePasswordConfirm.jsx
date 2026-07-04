'use client';

import { useState } from 'react';
import { eventActionLabel } from '@/lib/entryExit';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" />
        <path d="M1 1l22 22" strokeLinecap="round" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function gateSelectionLabel(session) {
  if (!session) return 'the selected access point';
  if (session.scanType === 'department') {
    return eventActionLabel('department', session.eventType);
  }
  if (session.eventType === 'auto') {
    return `${eventActionLabel('gate', 'auto')} gate`;
  }
  return eventActionLabel('gate', session.eventType);
}

export default function GatePasswordConfirm({
  displayName,
  gateSession,
  onConfirm,
  onBack,
  submitting = false,
  error = '',
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    await onConfirm(password);
  }

  return (
    <div className="gate-landing-shell login-gate-shell">
      <div className="gate-landing">
        <div className="login-card card gate-password-card">
          <div className="login-brand">
            <span className="brand-icon">S</span>
            <div>
              <h1>SAMS</h1>
              <p>Confirm Password</p>
            </div>
          </div>

          <p className="section-desc" style={{ marginBottom: '1.25rem' }}>
            Confirm your password to switch to{' '}
            <strong>{gateSelectionLabel(gateSession)}</strong>
            {displayName ? (
              <>
                {' '}
                as <strong>{displayName}</strong>
              </>
            ) : null}
            .
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="gate-confirm-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="gate-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button type="submit" className="btn-primary login-submit" disabled={submitting}>
              {submitting ? 'Verifying...' : 'Continue to Entry & Exit'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.75rem' }}
              onClick={onBack}
              disabled={submitting}
            >
              Back to gate selection
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
