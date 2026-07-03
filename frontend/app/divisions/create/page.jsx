'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import useRequireWrite from '@/hooks/useRequireWrite';

const emptyGate = () => ({ name: '', gateType: 'both', description: '' });

const GATE_TYPE_OPTIONS = [
  { value: 'entry', label: 'Entry only' },
  { value: 'exit', label: 'Exit only' },
  { value: 'both', label: 'Entry & Exit' },
];

export default function CreateDivisionPage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequireWrite('divisions', '/divisions/manage');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gates, setGates] = useState([emptyGate()]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    setSuccess('');

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

      setSuccess(`Division "${division.name}" created with ${division.gates?.length ?? validGates.length} gate(s).`);
      setName('');
      setDescription('');
      setGates([emptyGate()]);
      setTimeout(() => router.push('/divisions/manage'), 1500);
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
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title">1. Division Details</h3>
        <p className="section-desc">A division groups multiple physical gates (e.g. campus, building, zone)</p>

        <div className="form-group">
          <label>Division Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Campus, Block A, North Wing"
          />
        </div>
        <div className="form-group">
          <label>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="division-gates-header">
          <div>
            <h3 className="section-title">2. Gates for this Division</h3>
            <p className="section-desc">Add one or more gates and set whether each is for entry, exit, or both</p>
          </div>
          <button type="button" className="btn-secondary" onClick={addGateRow}>
            + Add Gate
          </button>
        </div>

        <div className="division-gates-list">
          {gates.map((gate, index) => (
            <div key={index} className="division-gate-row card" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Gate Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  value={gate.name}
                  onChange={(e) => updateGate(index, 'name', e.target.value)}
                  placeholder="e.g. Main Gate, Parking Exit"
                />
              </div>
              <div className="form-group">
                <label>Gate Type <span style={{ color: 'var(--danger)' }}>*</span></label>
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
                <button type="button" className="btn-danger" onClick={() => removeGateRow(index)}>
                  Remove Gate
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Creating Division...' : 'Create Division & Gates'}
      </button>
    </form>
  );
}
