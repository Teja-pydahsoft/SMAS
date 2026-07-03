'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getHomeRoute } from '@/lib/auth/routing';
import { getToken } from '@/lib/auth/session';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (user || getToken())) {
      router.replace(searchParams.get('next') || getHomeRoute());
    }
  }, [user, authLoading, router, searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
      router.replace(searchParams.get('next') || getHomeRoute());
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
