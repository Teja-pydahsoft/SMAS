'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';

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

  function toggleGate(id) {
    setGateIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
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
        departmentIds,
      });
      setSuccess(`User "${user.displayName}" created successfully.`);
      setDisplayName('');
      setEmail('');
      setUsername('');
      setPassword('');
      setDivisionIds([]);
      setGateIds([]);
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
    <form onSubmit={handleSubmit}>
      <div className="card">
        <h3 className="section-title">System User Details</h3>
        <p className="section-desc">
          Create a system user, assign a role, then limit access by divisions, gates, and departments below.
        </p>

        <div className="form-group">
          <label>Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. John Smith"
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional email"
          />
        </div>

        <div className="form-group">
          <label>Username <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Login username"
            autoComplete="off"
          />
        </div>

        <div className="form-group">
          <label>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>

        <div className="form-group">
          <label>System Role <span style={{ color: 'var(--danger)' }}>*</span></label>
          <select value={systemRoleId} onChange={(e) => setSystemRoleId(e.target.value)}>
            <option value="">Select role...</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>{role.name}</option>
            ))}
          </select>
          {roles.length === 0 && (
            <p className="field-hint">Create a system role first, then assign privileges.</p>
          )}
        </div>

        <div className="form-group">
          <label>Access Scope — Divisions</label>
          <p className="field-hint">Select divisions this user can access. Leave empty for no division scope.</p>
          {divisions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No divisions available.</p>
          ) : (
            <div className="checkbox-group">
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
          <label>Access Scope — Gates</label>
          <p className="field-hint">
            Select division gates for gate entry/exit. Optional if this user only needs department check-in/check-out.
          </p>
          {scopedGates.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {divisionIds.length === 0
                ? 'Select divisions first to filter gates.'
                : 'No gates in the selected divisions.'}
            </p>
          ) : (
            <div className="checkbox-group">
              {scopedGates.map((gate) => (
                <label key={gate._id} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={gateIds.includes(gate._id)}
                    onChange={() => toggleGate(gate._id)}
                  />
                  <span>
                    {gate.name}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                      ({gate.divisionId?.name || 'Division'})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Access Scope — Departments</label>
          <p className="field-hint">
            Select departments for check-in/check-out on the Gate Access page. Gate assignment is not required when only departments are selected.
          </p>
          {scopedDepartments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {divisionIds.length === 0
                ? 'Select divisions first to filter departments, or leave empty for all departments in scope.'
                : 'No departments in the selected divisions.'}
            </p>
          ) : (
            <div className="checkbox-group">
              {scopedDepartments.map((dept) => (
                <label key={dept._id} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={departmentIds.includes(dept._id)}
                    onChange={() => toggleDepartment(dept._id)}
                  />
                  <span>{dept.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && <p className="success-msg">{success}</p>}

        <button type="submit" className="btn-primary" disabled={loading || roles.length === 0}>
          {loading ? 'Creating...' : 'Create System User'}
        </button>
      </div>
    </form>
  );
}
