'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getPostLoginRoute } from '@/lib/auth/routing';
import { getToken } from '@/lib/auth/session';

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

function LoginForm() {
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (user || getToken())) {
      router.replace(getPostLoginRoute(user));
    }
  }, [user, authLoading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const loggedInUser = await login(username.trim(), password);
      router.replace(getPostLoginRoute(loggedInUser));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-card card" onSubmit={handleSubmit}>
      <div className="login-brand">
        <span className="brand-icon">S</span>
        <div>
          <h1>SMAS</h1>
          <p>System Login</p>
        </div>
      </div>

      <p className="section-desc" style={{ marginBottom: '1.25rem' }}>
        Sign in with your system username and password
      </p>

      <div className="form-group">
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          autoComplete="username"
          required
        />
      </div>

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

      {error && <p className="error-msg">{error}</p>}

      <button type="submit" className="btn-primary login-submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="login-hint">
        Default super admin: <code>superadmin</code> / <code>superadmin123</code>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="login-loading">Loading...</p>}>
      <LoginForm />
    </Suspense>
  );
}
