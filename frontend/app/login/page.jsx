'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ensureBackendReady, warmBackend } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import GateScopePicker from '@/components/GateScopePicker';
import { getPostLoginRoute } from '@/lib/auth/routing';
import { getToken } from '@/lib/auth/session';
import { buildEntryExitUrl, eventActionLabel } from '@/lib/entryExit';
import { getGateSession, normalizeGateSession, setGateSession } from '@/lib/gateSession';
import BotLoader from '@/components/BotLoader';

/* ── Icons ──────────────────────────────────────────────────── */
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

/* ── Rocket illustration (inline SVG) ──────────────────────── */
function RocketIllustration() {
  return (
    <svg
      className="login-hero__illustration"
      viewBox="0 0 260 360"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Rocket body */}
      <ellipse cx="130" cy="180" rx="28" ry="65" fill="url(#rocketBody)" />
      {/* Nose */}
      <path d="M102 155 Q130 90 158 155Z" fill="#DCE9E2" />
      {/* Window */}
      <circle cx="130" cy="170" r="12" fill="#fff" opacity="0.9" />
      <circle cx="130" cy="170" r="8" fill="#7DAF94" />
      <circle cx="127" cy="167" r="3" fill="#fff" opacity="0.7" />
      {/* Left fin */}
      <path d="M102 215 Q88 240 100 245 L102 230Z" fill="#4E7D63" />
      {/* Right fin */}
      <path d="M158 215 Q172 240 160 245 L158 230Z" fill="#4E7D63" />
      {/* Exhaust outer */}
      <ellipse cx="130" cy="252" rx="18" ry="8" fill="rgba(251,191,36,0.5)" />
      {/* Exhaust flame */}
      <path d="M115 248 Q122 290 130 310 Q138 290 145 248Z" fill="url(#flame)" opacity="0.9" />
      {/* Exhaust inner */}
      <path d="M122 248 Q127 278 130 292 Q133 278 138 248Z" fill="url(#flameInner)" />

      {/* Small planet top right */}
      <circle cx="210" cy="80" r="28" fill="rgba(125,175,148,0.3)" />
      <circle cx="210" cy="80" r="20" fill="rgba(125,175,148,0.2)" />

      {/* Small planet bottom left */}
      <circle cx="48" cy="290" r="18" fill="rgba(78,125,99,0.25)" />

      {/* Stars */}
      <circle cx="60" cy="60" r="2" fill="white" opacity="0.7" />
      <circle cx="195" cy="150" r="1.5" fill="white" opacity="0.6" />
      <circle cx="80" cy="200" r="1.5" fill="white" opacity="0.5" />
      <circle cx="220" cy="220" r="2" fill="white" opacity="0.6" />
      <circle cx="40" cy="130" r="1" fill="white" opacity="0.5" />
      <circle cx="170" cy="50" r="1.5" fill="white" opacity="0.4" />

      <defs>
        <linearGradient id="rocketBody" x1="102" y1="115" x2="158" y2="245" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EFF4F0" />
          <stop offset="100%" stopColor="#C4D0C7" />
        </linearGradient>
        <linearGradient id="flame" x1="130" y1="248" x2="130" y2="310" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="flameInner" x1="130" y1="248" x2="130" y2="292" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Hero left panel ────────────────────────────────────────── */
function LoginHero() {
  return (
    <div className="login-hero" aria-hidden="true">
      <div className="login-hero__orb login-hero__orb--1" />
      <div className="login-hero__orb login-hero__orb--2" />
      <div className="login-hero__orb login-hero__orb--3" />
      <div className="login-hero__stars" />

      <div className="login-hero__content">
        <div className="login-hero__badge">
          <span className="login-hero__badge-dot" />
          Smart Management System
        </div>

        <h2 className="login-hero__title">
          Secure Access<br />
          <span>Made Simple.</span>
        </h2>

        <p className="login-hero__subtitle">
          Manage registrations, gate access, and attendance — all in one unified platform built for modern organizations.
        </p>

        <div className="login-hero__features">
          <div className="login-hero__feature">
            <span className="login-hero__feature-icon">🛡️</span>
            Face-verified access control
          </div>
          <div className="login-hero__feature">
            <span className="login-hero__feature-icon">📊</span>
            Real-time attendance reports
          </div>
          <div className="login-hero__feature">
            <span className="login-hero__feature-icon">🚀</span>
            Multi-gate & department support
          </div>
        </div>
      </div>

      <RocketIllustration />
    </div>
  );
}

/* ── Step indicator ─────────────────────────────────────────── */
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
            className={`login-steps__item${active ? ' login-steps__item--active' : ''}${done ? ' login-steps__item--done' : ''}`}
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

/* ── Spinner dots animation ─────────────────────────────────── */
function LoadingDots() {
  return (
    <span className="login-loading-dots" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/* ── Animated submit button state ───────────────────────────── */
function SubmitButton({ submitting, step }) {
  return (
    <button type="submit" className={`btn-primary login-submit${submitting ? ' login-submit--loading' : ''}`} disabled={submitting}>
      {submitting ? (
        <span className="login-submit__inner">
          <span className="login-spinner" aria-hidden>
            <span /><span /><span /><span />
          </span>
          <span>{step === 'username' ? 'Connecting…' : 'Signing in…'}</span>
        </span>
      ) : (
        <span className="login-submit__inner">
          <span>{step === 'username' ? 'Continue' : 'Sign In'}</span>
          <span className="login-submit__arrow">{step === 'username' ? '→' : '🔓'}</span>
        </span>
      )}
    </button>
  );
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
    warmBackend();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user && !getToken()) return;

    const gateSession = getGateSession();
    if (gateSession) {
      router.replace(buildEntryExitUrl(gateSession));
      return;
    }

    router.replace(getPostLoginRoute(user));
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
      await ensureBackendReady();
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
      await ensureBackendReady();
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

  /* Gate-select step keeps its own full-screen shell */
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
      {/* ── Left hero panel ── */}
      <LoginHero />

      {/* ── Right form panel ── */}
      <div className="login-form-panel">
        <div className={`login-card${submitting ? ' login-card--loading' : ''}`}>
          {submitting && (
            <div className="login-card__loader" role="status" aria-live="polite">
              <BotLoader
                compact
                message={step === 'username' ? 'Connecting…' : 'Signing in…'}
              />
            </div>
          )}

          {/* Brand */}
          <div className="login-brand">
            <span className="brand-icon">S</span>
            <div>
              <h1>SAMS</h1>
              <p>System Login</p>
            </div>
          </div>

          {/* Heading */}
          <div className="login-heading">
            <h2>{step === 'username' ? 'Welcome back' : `Hello, ${displayName || username}`}</h2>
            <p>
              {step === 'username'
                ? 'Enter your credentials to access your account'
                : pendingGateSession
                  ? `Signing in for ${gateSelectionLabel(pendingGateSession)}`
                  : 'Enter your password to continue'}
            </p>
          </div>

          {/* Steps */}
          <LoginSteps step={step} flow={flow} />

          {/* Form */}
          <form onSubmit={step === 'username' ? handleUsernameContinue : handlePasswordSubmit}>
            {step === 'username' && (
              <div className="form-group">
                <label htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            )}

            {step === 'password' && (
              <>
                <div className="form-group">
                  <label htmlFor="login-password">Password</label>
                  <div className="password-input-wrap">
                    <input
                      id="login-password"
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
                  {flow === 'gate' ? '← Back to gate selection' : '← Change username'}
                </button>
              </>
            )}

            {error && (
              <p className="login-error" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            )}

            <SubmitButton submitting={submitting} step={step} />
          </form>


        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<BotLoader message="Preparing login…" />}>
      <LoginForm />
    </Suspense>
  );
}
