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

const REMEMBER_KEY = 'sams_login_remember_username';

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

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* ── Rocket illustration ─────────────────────────────────────── */
function RocketIllustration() {
  return (
    <svg
      className="login-hero__illustration"
      viewBox="0 0 260 360"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse cx="130" cy="180" rx="28" ry="65" fill="url(#rocketBody)" />
      <path d="M102 155 Q130 90 158 155Z" fill="#DBEAFE" />
      <circle cx="130" cy="170" r="12" fill="#fff" opacity="0.9" />
      <circle cx="130" cy="170" r="8" fill="#4D8FFF" />
      <circle cx="127" cy="167" r="3" fill="#fff" opacity="0.7" />
      <path d="M102 215 Q88 240 100 245 L102 230Z" fill="#1A56FF" />
      <path d="M158 215 Q172 240 160 245 L158 230Z" fill="#1A56FF" />
      <ellipse cx="130" cy="252" rx="18" ry="8" fill="rgba(251,191,36,0.5)" />
      <path d="M115 248 Q122 290 130 310 Q138 290 145 248Z" fill="url(#flame)" opacity="0.9" />
      <path d="M122 248 Q127 278 130 292 Q133 278 138 248Z" fill="url(#flameInner)" />
      <circle cx="210" cy="80" r="28" fill="rgba(77,143,255,0.3)" />
      <circle cx="210" cy="80" r="20" fill="rgba(77,143,255,0.2)" />
      <circle cx="48" cy="290" r="18" fill="rgba(26,86,255,0.25)" />
      <circle cx="60" cy="60" r="2" fill="white" opacity="0.7" />
      <circle cx="195" cy="150" r="1.5" fill="white" opacity="0.6" />
      <circle cx="80" cy="200" r="1.5" fill="white" opacity="0.5" />
      <circle cx="220" cy="220" r="2" fill="white" opacity="0.6" />
      <circle cx="40" cy="130" r="1" fill="white" opacity="0.5" />
      <circle cx="170" cy="50" r="1.5" fill="white" opacity="0.4" />
      <defs>
        <linearGradient id="rocketBody" x1="102" y1="115" x2="158" y2="245" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EFF4FF" />
          <stop offset="100%" stopColor="#BFDBFE" />
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

function FeatureIcon({ children }) {
  return <span className="login-hero__feature-icon">{children}</span>;
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function LoginHero() {
  return (
    <div className="login-hero" aria-hidden="true">
      <div className="login-hero__wave login-hero__wave--1" />
      <div className="login-hero__wave login-hero__wave--2" />
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
            <FeatureIcon><ShieldIcon /></FeatureIcon>
            Face-verified access control
          </div>
          <div className="login-hero__feature">
            <FeatureIcon><ChartIcon /></FeatureIcon>
            Real-time attendance reports
          </div>
          <div className="login-hero__feature">
            <FeatureIcon><RocketIcon /></FeatureIcon>
            Multi-gate & department support
          </div>
        </div>
      </div>

      <div className="login-hero__rocket-glow" />
      <RocketIllustration />
    </div>
  );
}

function LoginSteps({ step, flow, onStepClick }) {
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

  const currentIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="login-steps" role="tablist" aria-label="Login steps">
      {steps.map((item, index) => {
        const active = item.id === step;
        const done = currentIndex > index;
        const clickable = done && onStepClick;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!clickable && !active}
            className={`login-steps__item${active ? ' login-steps__item--active' : ''}${done ? ' login-steps__item--done' : ''}`}
            onClick={() => clickable && onStepClick(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function LoginBrand() {
  return (
    <div className="login-brand">
      <span className="brand-icon">S</span>
      <div>
        <h1>SAMS</h1>
        <p>System Login</p>
      </div>
    </div>
  );
}

function LoginFooter() {
  return (
    <>
      <div className="login-divider"><span>or</span></div>
      <p className="login-footer">
        Need help?{' '}
        <a href="mailto:admin@example.com" className="login-footer__link">
          Contact your administrator
        </a>
      </p>
    </>
  );
}

function LoginField({ id, label, type = 'text', value, onChange, placeholder, autoComplete, autoFocus, required, icon, trailing }) {
  return (
    <div className="form-group login-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-field__control">
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
        />
        {icon && <span className="login-field__icon" aria-hidden>{icon}</span>}
        {trailing}
      </div>
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

function SubmitButton({ submitting, step }) {
  const isUsername = step === 'username';
  return (
    <button type="submit" className={`btn-primary login-submit${submitting ? ' login-submit--loading' : ''}`} disabled={submitting}>
      {submitting ? (
        <span className="login-submit__inner">
          <span className="login-spinner" aria-hidden>
            <span /><span /><span /><span />
          </span>
          <span>{isUsername ? 'Connecting…' : 'Signing in…'}</span>
        </span>
      ) : (
        <span className="login-submit__inner">
          <span>{isUsername ? 'Continue' : 'Sign In'}</span>
          <span className="login-submit__arrow" aria-hidden>{isUsername ? '→' : '🔓'}</span>
        </span>
      )}
    </button>
  );
}

function LoginCard({ wide, submitting, loaderMessage, title, subtitle, step, flow, onStepClick, children, showFooter = true }) {
  return (
    <div className="login-form-panel">
      <div className="login-form-panel__curve login-form-panel__curve--top" aria-hidden />
      <div className="login-form-panel__curve login-form-panel__curve--middle" aria-hidden />
      <div className="login-form-panel__curve login-form-panel__curve--bottom" aria-hidden />
      <div className={`login-card${wide ? ' login-card--wide' : ''}${submitting ? ' login-card--loading' : ''}`}>
        {submitting && (
          <div className="login-card__loader" role="status" aria-live="polite">
            <BotLoader compact message={loaderMessage} />
          </div>
        )}

        <LoginBrand />

        <div className="login-heading">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <LoginSteps step={step} flow={flow} onStepClick={onStepClick} />

        {children}

        {showFooter && <LoginFooter />}
      </div>
    </div>
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
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    warmBackend();
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {
      /* ignore */
    }
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

  function handleStepClick(targetStep) {
    if (targetStep === 'username') {
      resetToUsername();
      return;
    }
    if (targetStep === 'gate-select' && flow === 'gate') {
      setPassword('');
      setPendingGateSession(null);
      setStep('gate-select');
      setError('');
    }
  }

  async function handleUsernameContinue(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await ensureBackendReady();
      const trimmed = username.trim();
      const result = await api.auth.precheck(trimmed);
      setDisplayName(result.displayName || trimmed);

      try {
        if (rememberMe) localStorage.setItem(REMEMBER_KEY, trimmed);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ignore */
      }

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

  if (step === 'gate-select') {
    return (
      <div className="login-shell">
        <LoginHero />
        <LoginCard
          wide
          submitting={false}
          title={`Hello, ${displayName || username}`}
          subtitle="Select your gate or department, then enter your password to continue."
          step={step}
          flow={flow}
          onStepClick={handleStepClick}
        >
          <div className="login-gate-picker">
            <GateScopePicker
              scope={accessScope}
              displayName={displayName}
              canGateWrite={canGateWrite}
              onSelect={handleGateSelect}
              showWelcome={false}
              compact
            />
          </div>
          <button type="button" className="login-back-link" onClick={resetToUsername}>
            ← Change username
          </button>
        </LoginCard>
      </div>
    );
  }

  const headingTitle = step === 'username'
    ? 'Welcome back'
    : `Hello, ${displayName || username}`;

  const headingSubtitle = step === 'username'
    ? 'Enter your credentials to access your account'
    : pendingGateSession
      ? `Signing in for ${gateSelectionLabel(pendingGateSession)}`
      : 'Enter your password to continue';

  return (
    <div className="login-shell">
      <LoginHero />

      <LoginCard
        submitting={submitting}
        loaderMessage={step === 'username' ? 'Connecting…' : 'Signing in…'}
        title={headingTitle}
        subtitle={headingSubtitle}
        step={step}
        flow={flow}
        onStepClick={handleStepClick}
      >
        <form className="login-form" onSubmit={step === 'username' ? handleUsernameContinue : handlePasswordSubmit}>
          {step === 'username' && (
            <LoginField
              id="login-username"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              required
              icon={<UserIcon />}
            />
          )}

          {step === 'password' && (
            <LoginField
              id="login-password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              autoFocus
              required
              icon={<LockIcon />}
              trailing={(
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              )}
            />
          )}

          {step === 'username' && (
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          )}

          {step === 'password' && (
            <div className="login-form__actions">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-forgot" onClick={() => setError('Please contact your administrator to reset your password.')}>
                Forgot password?
              </button>
            </div>
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

          {step === 'password' && (
            <button
              type="button"
              className="login-back-link"
              onClick={() => {
                if (flow === 'gate') {
                  setPassword('');
                  setPendingGateSession(null);
                  setStep('gate-select');
                  setError('');
                } else {
                  resetToUsername();
                }
              }}
            >
              {flow === 'gate' ? '← Back to gate selection' : '← Change username'}
            </button>
          )}
        </form>
      </LoginCard>
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
