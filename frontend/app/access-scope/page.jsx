'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import GateScopePicker from '@/components/GateScopePicker';
import GatePasswordConfirm from '@/components/GatePasswordConfirm';
import { buildEntryExitUrl } from '@/lib/entryExit';
import {
  gateSessionsEqual,
  getGateSession,
  normalizeGateSession,
  setGateSession,
} from '@/lib/gateSession';
import { getDashboardRoute, hasAssignedEntryExitScope } from '@/lib/auth/routing';

export default function AccessScopePage() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();
  const [scope, setScope] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('select');
  const [pendingGateSession, setPendingGateSession] = useState(null);
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.isSuperAdmin) {
      router.replace('/entry-exit');
      return;
    }
    if (!hasAssignedEntryExitScope(user)) {
      router.replace(getDashboardRoute());
      return;
    }
    api.auth
      .accessScope()
      .then(setScope)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  function handleGateSelect(params) {
    const nextSession = normalizeGateSession(params);
    const currentSession = getGateSession();

    if (currentSession && gateSessionsEqual(currentSession, nextSession)) {
      router.push(buildEntryExitUrl(nextSession));
      return;
    }

    setPendingGateSession(nextSession);
    setPasswordError('');
    setStep('password');
  }

  async function handlePasswordConfirm(password) {
    setVerifying(true);
    setPasswordError('');
    try {
      await api.auth.verifyPassword(password);
      setGateSession(pendingGateSession);
      router.push(buildEntryExitUrl(pendingGateSession));
    } catch (err) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setVerifying(false);
    }
  }

  function handleBackToSelection() {
    setPendingGateSession(null);
    setPasswordError('');
    setStep('select');
  }

  if (authLoading || !user) {
    return (
      <div className="gate-landing-shell">
        <p className="gate-landing-loading">Loading your gates...</p>
      </div>
    );
  }

  if (step === 'password' && pendingGateSession) {
    return (
      <GatePasswordConfirm
        displayName={user.displayName}
        gateSession={pendingGateSession}
        onConfirm={handlePasswordConfirm}
        onBack={handleBackToSelection}
        submitting={verifying}
        error={passwordError}
      />
    );
  }

  return (
    <div className="gate-landing-shell">
      <div className="gate-landing">
        <header className="gate-landing__header">
          <div className="gate-landing__brand">
            <span className="brand-icon">S</span>
            <div>
              <h1>SAMS</h1>
              <p>Gate Access</p>
            </div>
          </div>
          <button type="button" className="btn-secondary gate-landing__signout" onClick={logout}>
            Sign Out
          </button>
        </header>

        <GateScopePicker
          scope={scope}
          displayName={user.displayName}
          canGateWrite
          onSelect={handleGateSelect}
          loading={loading}
          error={error}
          showWelcome
          welcomeHint="Select a gate or department. Combined entry & exit gates apply entry or exit automatically from each person's status."
        />
      </div>
    </div>
  );
}
