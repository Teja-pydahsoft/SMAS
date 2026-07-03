'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

const GATE_TYPE_OPTIONS = [
  { value: 'entry', label: 'Entry only' },
  { value: 'exit', label: 'Exit only' },
  { value: 'both', label: 'Entry & Exit' },
];

function gateTypeLabel(type) {
  const opt = GATE_TYPE_OPTIONS.find((o) => o.value === type);
  return opt?.label || type;
}

export default function DivisionGatesPage() {
  const params = useParams();
  const divisionId = params.divisionId;
  const { can } = useAuth();
  const canWrite = can('divisions', 'write');

  const [division, setDivision] = useState(null);
  const [gates, setGates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newGate, setNewGate] = useState({ name: '', gateType: 'both', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDivision();
  }, [divisionId]);

  async function loadDivision() {
    setLoading(true);
    try {
      const data = await api.divisions.get(divisionId);
      setDivision(data);
      setGates(data.gates || []);
      setDepartments(data.departments || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddGate(e) {
    e.preventDefault();
    if (!newGate.name.trim()) {
      setError('Gate name is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.gates.create({
        divisionId,
        name: newGate.name.trim(),
        gateType: newGate.gateType,
        description: newGate.description.trim(),
      });
      setNewGate({ name: '', gateType: 'both', description: '' });
      await loadDivision();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleGate(gate) {
    try {
      await api.gates.update(gate._id, { isActive: !gate.isActive });
      await loadDivision();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteGate(gate) {
    if (!confirm(`Delete gate "${gate.name}"?`)) return;
    try {
      await api.gates.delete(gate._id);
      await loadDivision();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading division gates...</p>;
  }

  if (!division) {
    return (
      <div className="card">
        <p className="error-msg">Division not found.</p>
        <Link href="/divisions/manage">
          <button type="button" className="btn-secondary" style={{ marginTop: '1rem' }}>Back to Divisions</button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <Link href="/divisions/manage" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          ← Back to all divisions
        </Link>
        <h3 className="section-title" style={{ marginTop: '0.75rem' }}>{division.name}</h3>
        <p className="section-desc">{division.description || 'No description'}</p>
        <span className={`badge ${division.isActive ? 'badge-success' : 'badge-danger'}`}>
          {division.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title">Gates ({gates.length})</h3>
        {!canWrite && (
          <p className="read-only-banner">View only — gate changes require write access.</p>
        )}
        {error && <p className="error-msg">{error}</p>}

        {gates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No gates yet. Add one below.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: '1.5rem' }}>
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Gate Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {gates.map((gate) => (
                  <tr key={gate._id} className={!gate.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{gate.name}</td>
                    <td>
                      <span className="badge badge-info">{gateTypeLabel(gate.gateType)}</span>
                    </td>
                    <td>
                      <span className={`badge ${gate.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {gate.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button type="button" className="btn-secondary" onClick={() => handleToggleGate(gate)}>
                          {gate.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="btn-danger" onClick={() => handleDeleteGate(gate)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <WriteAccess module="divisions">
          <form onSubmit={handleAddGate}>
            <h4 style={{ marginBottom: '0.75rem' }}>Add New Gate</h4>
            <div className="division-gate-row">
              <div className="form-group">
                <label>Gate Name</label>
                <input
                  value={newGate.name}
                  onChange={(e) => setNewGate({ ...newGate, name: e.target.value })}
                  placeholder="Gate name"
                />
              </div>
              <div className="form-group">
                <label>Gate Type</label>
                <select
                  value={newGate.gateType}
                  onChange={(e) => setNewGate({ ...newGate, gateType: e.target.value })}
                >
                  {GATE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  value={newGate.description}
                  onChange={(e) => setNewGate({ ...newGate, description: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Gate'}
            </button>
          </form>
        </WriteAccess>
      </div>

      <div className="card">
        <div className="division-gates-header">
          <h3 className="section-title">Departments ({departments.length})</h3>
          <WriteAccess module="departments">
            <Link href={`/departments/create?division=${divisionId}`}>
              <button type="button" className="btn-secondary">+ Add Department</button>
            </Link>
          </WriteAccess>
        </div>

        {departments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No departments assigned to this division yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept._id} className={!dept.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{dept.name}</td>
                    <td>{dept.description || '—'}</td>
                    <td>
                      <span className={`badge ${dept.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Link href="/departments/manage" style={{ display: 'inline-block', marginTop: '1rem' }}>
          <button type="button" className="btn-secondary">Manage All Departments</button>
        </Link>
      </div>
    </div>
  );
}
