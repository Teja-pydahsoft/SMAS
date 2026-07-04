'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import GateScopePicker from '@/components/GateScopePicker';
import { getPostLoginRoute } from '@/lib/auth/routing';
import { getToken } from '@/lib/auth/session';
import { buildEntryExitUrl, eventActionLabel } from '@/lib/entryExit';
import { getGateSession, normalizeGateSession, setGateSession } from '@/lib/gateSession';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" />
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

function LoginSteps({ step, flow }) {
  const steps =
    flow === 'gate'
      ? [
          { id: 'username', label: 'Username' },
          { id: 'gate-select', label: 'Select Gate' },
          { id: 'password', label: 'Password' },
        ]
      : [
          { id: 'username', label: 'Username' },
          { id: 'password', label: 'Password' },
        ];

  return (
    <div className="login-steps">
      {steps.map((item, index) => {
        const active = item.id === step;
        const done = steps.findIndex((s) => s.id === step) > index;
        return (
          <span
            key={item.id}
            className={`login-steps__item ${active ? 'login-steps__item--active' : ''} ${done ? 'login-steps__item--done' : ''}`}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

function gateSelectionLabel(session) {
  if (!session) return 'your access point';
  if (session.scanType === 'department') {
    return eventActionLabel('department', session.eventType);
  }
  return eventActionLabel('gate', session.eventType);
}

function LoginForm() {
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [step, setStep] = useState('username');
  const [flow, setFlow] = useState('standard');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessScope, setAccessScope] = useState(null);
  const [canGateWrite, setCanGateWrite] = useState(true);
  const [pendingGateSession, setPendingGateSession] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user && !getToken()) return;

    const gateSession = getGateSession();
    if (gateSession) {
      router.replace(buildEntryExitUrl(gateSession));
      return;
    }

    router.replace(getPostLoginRoute(user));
    // Only redirect when session is restored on load, not after in-form login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  function resetToUsername() {
    setStep('username');
    setFlow('standard');
    setPassword('');
    setDisplayName('');
    setAccessScope(null);
    setPendingGateSession(null);
    setError('');
  }

  async function handleUsernameContinue(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api.auth.precheck(username.trim());
      setDisplayName(result.displayName || username.trim());

      if (result.flow === 'gate' && result.accessScope) {
        setFlow('gate');
        setAccessScope(result.accessScope);
        setCanGateWrite(result.canGateWrite !== false);
        setStep('gate-select');
      } else {
        setFlow('standard');
        setStep('password');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleGateSelect(params) {
    setPendingGateSession(normalizeGateSession(params));
    setStep('password');
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const gateSession = pendingGateSession ? normalizeGateSession(pendingGateSession) : null;

    try {
      const loggedInUser = await login(username.trim(), password, { keepGateSession: Boolean(gateSession) });

      if (gateSession) {
        setGateSession(gateSession);
        router.replace(buildEntryExitUrl(gateSession));
        return;
      }

      router.replace(getPostLoginRoute(loggedInUser));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'gate-select') {
    return (
      <div className="gate-landing-shell login-gate-shell">
        <div className="gate-landing">
          <header className="gate-landing__header">
            <div className="gate-landing__brand">
              <span className="brand-icon">S</span>
              <div>
                <h1>SAMS</h1>
                <p>Gate Access</p>
              </div>
            </div>
            <button type="button" className="btn-secondary gate-landing__signout" onClick={resetToUsername}>
              Change User
            </button>
          </header>

          <LoginSteps step={step} flow={flow} />

          <GateScopePicker
            scope={accessScope}
            displayName={displayName}
            canGateWrite={canGateWrite}
            onSelect={handleGateSelect}
            showWelcome
            welcomeHint="Select a gate or department below, then enter your password to continue."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <form
        className="login-card card"
        onSubmit={step === 'username' ? handleUsernameContinue : handlePasswordSubmit}
      >
        <div className="login-brand">
          <span className="brand-icon">S</span>
          <div>
            <h1>SAMS</h1>
            <p>System Login</p>
          </div>
        </div>

        <LoginSteps step={step} flow={flow} />

        {step === 'username' && (
          <>
            <p className="section-desc" style={{ marginBottom: '1.25rem' }}>
              Enter your username to continue
            </p>
            <div className="form-group">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </>
        )}

        {step === 'password' && (
          <>
            <p className="section-desc" style={{ marginBottom: '1.25rem' }}>
              {pendingGateSession ? (
                <>
                  Signing in as <strong>{displayName || username}</strong> for{' '}
                  <strong>{gateSelectionLabel(pendingGateSession)}</strong>
                </>
              ) : (
                <>
                  Enter password for <strong>{displayName || username}</strong>
                </>
              )}
            </p>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={() => {
                if (flow === 'gate') {
                  setPassword('');
                  setPendingGateSession(null);
                  setStep('gate-select');
                } else {
                  resetToUsername();
                }
              }}
            >
              {flow === 'gate' ? 'Back to gate selection' : 'Change username'}
            </button>
          </>
        )}

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn-primary login-submit" disabled={submitting}>
          {submitting
            ? 'Please wait...'
            : step === 'username'
              ? 'Continue'
              : 'Sign In'}
        </button>

        {step === 'username' && (
          <p className="login-hint">
            Super admin: <code>superadmin</code> / <code>superadmin123</code>
          </p>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="login-loading">Loading...</p>}>
      <LoginForm />
    </Suspense>
  );
}
