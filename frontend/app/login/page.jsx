'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getPostLoginRoute } from '@/lib/auth/routing';
import { getToken } from '@/lib/auth/session';

function LoginForm() {
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoComplete="current-password"
          required
        />
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
