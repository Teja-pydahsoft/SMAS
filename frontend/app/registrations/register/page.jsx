'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import RegistrationFlow from '@/components/RegistrationFlow';

function RegisterContent() {
  const searchParams = useSearchParams();
  const preselectedRole = searchParams.get('role');
  const fromGate = searchParams.get('from') === 'gate';

  const [roles, setRoles] = useState([]);
  const [registerRoleId, setRegisterRoleId] = useState(preselectedRole || '');
  const [showRegisterFlow, setShowRegisterFlow] = useState(Boolean(preselectedRole));
  const [flowKey, setFlowKey] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api.roles.list().then(setRoles).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (preselectedRole) {
      setRegisterRoleId(preselectedRole);
      setShowRegisterFlow(true);
    }
  }, [preselectedRole]);

  function handleStartRegistration() {
    if (!registerRoleId) {
      setError('Please select a role to register');
      return;
    }
    setError('');
    setShowRegisterFlow(true);
  }

  function handleRegisterAnother() {
    setFlowKey((k) => k + 1);
  }

  function handleCancelRegistration() {
    setShowRegisterFlow(false);
    setRegisterRoleId('');
  }

  const activeRoles = roles.filter((r) => r.isActive);

  return (
    <div className="card">
      {fromGate && (
        <div className="gate-result gate-result--not-found" style={{ marginBottom: '1.25rem' }}>
          <p className="gate-not-found__title">New visitor from gate</p>
          <p className="gate-not-found__text">
            This person was not found during gate scanning. Select their role, fill in the details, and complete registration.
          </p>
        </div>
      )}

      <h3 className="section-title">New Registration</h3>
      <p className="section-desc">Select a role and complete the registration flow</p>

      <div className="form-group" style={{ maxWidth: 400 }}>
        <label>Select Role</label>
        <select
          value={registerRoleId}
          onChange={(e) => {
            setRegisterRoleId(e.target.value);
            setShowRegisterFlow(false);
            setError('');
          }}
        >
          <option value="">Choose a role...</option>
          {activeRoles.map((role) => (
            <option key={role._id} value={role._id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {!showRegisterFlow && (
        <button
          type="button"
          className="btn-primary"
          onClick={handleStartRegistration}
          disabled={!registerRoleId}
        >
          Start Registration
        </button>
      )}

      {showRegisterFlow && registerRoleId && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <RegistrationFlow
            key={`new-${flowKey}`}
            roleId={registerRoleId}
            fromGate={fromGate}
            onComplete={() => {}}
            onCancel={handleCancelRegistration}
            onRegisterAnother={handleRegisterAnother}
          />
        </div>
      )}

      {activeRoles.length === 0 && (
        <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          No active roles available. Create a role first.
        </p>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Loading...</p>}>
      <RegisterContent />
    </Suspense>
  );
}
