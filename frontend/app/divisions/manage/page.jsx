'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const emptyGate = () => ({ name: '', gateType: 'both', description: '' });

const GATE_TYPE_OPTIONS = [
  { value: 'entry', label: 'Entry only' },
  { value: 'exit', label: 'Exit only' },
  { value: 'both', label: 'Entry & Exit' },
];

function NewDivisionModal({ onClose, onComplete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gates, setGates] = useState([emptyGate()]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateGate(index, field, value) {
    setGates((prev) => prev.map((gate, i) => (i === index ? { ...gate, [field]: value } : gate)));
  }

  function addGateRow() {
    setGates((prev) => [...prev, emptyGate()]);
  }

  function removeGateRow(index) {
    setGates((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Division name is required');
      return;
    }

    const validGates = gates.filter((g) => g.name.trim() && g.gateType);
    if (!validGates.length) {
      setError('Add at least one gate with a name and type');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const division = await api.divisions.create({
        name: name.trim(),
        description: description.trim(),
        gates: validGates.map((g) => ({
          name: g.name.trim(),
          gateType: g.gateType,
          description: g.description.trim(),
        })),
      });
      onComplete(division);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New Division"
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth: 700, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">New Division</h3>
              <p className="reg-details-modal__sub">Create a division and add its gates</p>
            </div>
          </div>
          <button
            type="button"
            className="reg-details-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="reg-details-modal__body">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Division Details</h4>
              <div className="form-group">
                <label htmlFor="division-name">
                  Division Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="division-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Campus, Block A, North Wing"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="division-description">Description</label>
                <input
                  id="division-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Gates</h4>
                <button type="button" className="btn-secondary" onClick={addGateRow} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                  + Add Gate
                </button>
              </div>

              {gates.map((gate, index) => (
                <div key={index} style={{ padding: '1rem', background: 'var(--bg-inset, #f9fafb)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', border: '1px solid var(--border, #e5e7eb)' }}>
                  <div className="form-group">
                    <label>
                      Gate Name <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      value={gate.name}
                      onChange={(e) => updateGate(index, 'name', e.target.value)}
                      placeholder="e.g. Main Gate, Parking Exit"
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      Gate Type <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <select
                      value={gate.gateType}
                      onChange={(e) => updateGate(index, 'gateType', e.target.value)}
                    >
                      {GATE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      value={gate.description}
                      onChange={(e) => updateGate(index, 'description', e.target.value)}
                      placeholder="Optional gate notes"
                    />
                  </div>
                  {gates.length > 1 && (
                    <button type="button" className="btn-danger" onClick={() => removeGateRow(index)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                      Remove Gate
                    </button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="error-msg">{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Division & Gates'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ManageDivisionsPage() {
  const { can } = useAuth();
  const canWrite = can('divisions', 'write');
  const [divisions, setDivisions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewDivisionModal, setShowNewDivisionModal] = useState(false);

  useEffect(() => {
    loadDivisions();
  }, []);

  async function loadDivisions() {
    setLoading(true);
    try {
      setDivisions(await api.divisions.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete division "${name}" and all its gates and departments? This cannot be undone.`)) return;
    try {
      await api.divisions.delete(id);
      await loadDivisions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleActive(division) {
    try {
      await api.divisions.update(division._id, { isActive: !division.isActive });
      await loadDivisions();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleDivisionCreated() {
    setShowNewDivisionModal(false);
    loadDivisions();
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading divisions...</p>;
  }

  return (
    <div>
      {error && <p className="error-msg">{error}</p>}

      {!canWrite && (
        <p className="read-only-banner">View only — division changes require write access.</p>
      )}

      {divisions.length === 0 ? (
        <div className="empty-state card">
          <p>No divisions created yet.</p>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => setShowNewDivisionModal(true)}
            >
              Create Your First Division
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3>All Divisions ({divisions.length})</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Manage divisions, gate counts, and activation status
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => setShowNewDivisionModal(true)}
                aria-label="New Division"
              >
                <PlusIcon />
                New
              </button>
            )}
          </div>

          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Division</th>
                  <th>Description</th>
                  <th>Gates</th>
                  <th>Departments</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>{canWrite ? 'Actions' : 'View'}</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((division) => (
                  <tr key={division._id} className={!division.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{division.name}</td>
                    <td>{division.description || '—'}</td>
                    <td>
                      {division.activeGateCount ?? division.gateCount ?? 0} active
                      {' / '}
                      {division.gateCount ?? 0} total
                    </td>
                    <td>
                      {division.activeDepartmentCount ?? division.departmentCount ?? 0} active
                      {' / '}
                      {division.departmentCount ?? 0} total
                    </td>
                    <td>
                      <span className={`badge ${division.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {division.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(division.createdAt)}</td>
                    <td className="actions-cell">
                      <Link href={`/divisions/${division._id}`}>
                        <button type="button" className="btn-secondary">
                          {canWrite ? 'Manage Gates' : 'View Gates'}
                        </button>
                      </Link>
                      <WriteAccess module="departments">
                        <Link href={`/departments/create?division=${division._id}`}>
                          <button type="button" className="btn-secondary">Add Department</button>
                        </Link>
                      </WriteAccess>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleToggleActive(division)}
                          >
                            {division.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDelete(division._id, division.name)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewDivisionModal && (
        <NewDivisionModal
          onClose={() => setShowNewDivisionModal(false)}
          onComplete={handleDivisionCreated}
        />
      )}
    </div>
  );
}
