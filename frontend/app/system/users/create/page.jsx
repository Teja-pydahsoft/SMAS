'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';
import GateAccessPicker from '@/components/GateAccessPicker';
import DepartmentPicker from '@/components/DepartmentPicker';

export default function CreateSystemUserPage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('system_users', '/system/users/manage');
  const [roles, setRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [gates, setGates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [systemRoleId, setSystemRoleId] = useState('');
  const [divisionIds, setDivisionIds] = useState([]);
  const [gateIds, setGateIds] = useState([]);
  const [gateAccessModes, setGateAccessModes] = useState({});
  const [departmentIds, setDepartmentIds] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.systemRoles.list(),
      api.divisions.list({ isActive: 'true' }),
      api.gates.list({ isActive: 'true' }),
      api.departments.list({ isActive: 'true' }),
    ])
      .then(([roleList, divisionList, gateList, departmentList]) => {
        const activeRoles = roleList.filter((r) => r.isActive);
        setRoles(activeRoles);
        setDivisions(divisionList);
        setGates(gateList);
        setDepartments(departmentList);
        if (activeRoles.length > 0) setSystemRoleId(activeRoles[0]._id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const scopedGates = useMemo(() => {
    if (divisionIds.length === 0) return gates;
    const selected = new Set(divisionIds);
    return gates.filter((gate) => selected.has(gate.divisionId?._id || gate.divisionId));
  }, [gates, divisionIds]);

  const scopedDepartments = useMemo(() => {
    if (divisionIds.length === 0) return departments;
    const selected = new Set(divisionIds);
    return departments.filter((dept) =>
      (dept.divisionIds || []).some((div) => selected.has(div._id))
    );
  }, [departments, divisionIds]);

  function toggleDivision(id) {
    setDivisionIds((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
      if (!next.includes(id)) {
        const allowedGateIds = new Set(
          gates
            .filter((gate) => next.includes(gate.divisionId?._id || gate.divisionId))
            .map((gate) => gate._id)
        );
        setGateIds((gatePrev) => gatePrev.filter((gateId) => allowedGateIds.has(gateId)));
        setGateAccessModes((prevModes) => {
          const cleaned = {};
          for (const [gid, mode] of Object.entries(prevModes)) {
            if (allowedGateIds.has(gid)) cleaned[gid] = mode;
          }
          return cleaned;
        });
        const allowedDeptIds = new Set(
          departments
            .filter((dept) => (dept.divisionIds || []).some((div) => next.includes(div._id)))
            .map((dept) => dept._id)
        );
        setDepartmentIds((deptPrev) => deptPrev.filter((deptId) => allowedDeptIds.has(deptId)));
      }
      return next;
    });
  }

  function toggleDepartment(id) {
    setDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) return setError('Display name is required');
    if (!username.trim()) return setError('Username is required');
    if (!password || password.length < 6) return setError('Password must be at least 6 characters');
    if (!systemRoleId) return setError('System role is required');

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const user = await api.systemUsers.create({
        displayName: displayName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        systemRoleId,
        divisionIds,
        gateIds,
        gateAccessModes,
        departmentIds,
      });
      setSuccess(`User "${user.displayName}" created successfully.`);
      setDisplayName('');
      setEmail('');
      setUsername('');
      setPassword('');
      setDivisionIds([]);
      setGateIds([]);
      setGateAccessModes({});
      setDepartmentIds([]);
      setTimeout(() => router.push('/system/users/manage'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (permLoading || !allowed) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="su-create-page">
      <div className="card">
        <h3 className="section-title">New System User</h3>
        <p className="section-desc">
          Create a system user, assign a role, then limit access by divisions, gates, and departments.
        </p>

        <div className="su-create-grid" style={{ marginTop: '1rem' }}>
          <section className="su-panel">
            <h4 className="su-panel__title">Account</h4>
            <div className="form-group">
              <label htmlFor="create-displayname">Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="create-displayname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>
            <div className="form-group">
              <label htmlFor="create-email">Email</label>
              <input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="create-username">Username <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="create-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Login username"
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="create-password">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="create-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="create-role">System Role <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select id="create-role" value={systemRoleId} onChange={(e) => setSystemRoleId(e.target.value)}>
                <option value="">Select role...</option>
                {roles.map((role) => (
                  <option key={role._id} value={role._id}>{role.name}</option>
                ))}
              </select>
              {roles.length === 0 && (
                <p className="field-hint">Create a system role first, then assign privileges.</p>
              )}
            </div>
          </section>

          <section className="su-panel">
            <h4 className="su-panel__title">Divisions &amp; Departments</h4>
            <div className="form-group">
              <label>Divisions</label>
              <p className="su-hint">Leave empty for no division restriction.</p>
              {divisions.length === 0 ? (
                <p className="scope-empty">No divisions available.</p>
              ) : (
                <div className="checkbox-group su-scroll-list">
                  {divisions.map((division) => (
                    <label key={division._id} className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={divisionIds.includes(division._id)}
                        onChange={() => toggleDivision(division._id)}
                      />
                      <span>{division.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Departments</label>
              <p className="su-hint">
                Search and select departments for check-in/check-out. Gate assignment is optional.
              </p>
              <DepartmentPicker
                departments={scopedDepartments}
                selectedIds={departmentIds}
                onToggle={toggleDepartment}
                emptyMessage={
                  divisionIds.length === 0
                    ? 'Select divisions first to filter departments.'
                    : 'No departments in the selected divisions.'
                }
              />
            </div>
          </section>

          <section className="su-panel">
            <h4 className="su-panel__title">Gates</h4>
            {divisionIds.length === 0 ? (
              <div className="su-empty-scope">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }} aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <p>Select divisions to see available gates.</p>
              </div>
            ) : (
              <>
                <p className="su-hint">Optional. Combined gates can be entry, exit, or both.</p>
                <GateAccessPicker
                  gates={scopedGates}
                  selectedIds={gateIds}
                  modes={gateAccessModes}
                  emptyMessage="No gates in the selected divisions."
                  onChange={({ gateIds: nextIds, gateAccessModes: nextModes }) => {
                    setGateIds(nextIds);
                    setGateAccessModes(nextModes);
                  }}
                />
              </>
            )}
          </section>
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="submit" className="btn-primary" disabled={loading || roles.length === 0}>
            {loading ? 'Creating...' : 'Create System User'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.push('/system/users/manage')}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
