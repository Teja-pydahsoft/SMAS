'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';

/* ─── Icons ──────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ─── Modal shell ─────────────────────────────────────────────── */
function Modal({ title, subtitle, onClose, maxWidth = 550, children }) {
  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="reg-details-modal"
        style={{ maxWidth, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">{title}</h3>
              {subtitle && <p className="reg-details-modal__sub">{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="reg-details-modal__body">{children}</div>
      </div>
    </div>
  );
}

/* ─── Divisions tab ───────────────────────────────────────────── */
const emptyGate = () => ({ name: '', gateType: 'both', description: '' });
const GATE_TYPE_OPTIONS = [
  { value: 'entry', label: 'Entry only' },
  { value: 'exit', label: 'Exit only' },
  { value: 'both', label: 'Entry & Exit' },
];

function DivisionFormModal({ division, onClose, onComplete }) {
  const isEdit = Boolean(division);
  const [name, setName] = useState(division?.name ?? '');
  const [description, setDescription] = useState(division?.description ?? '');
  const [gates, setGates] = useState([emptyGate()]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateGate(i, field, value) {
    setGates((prev) => prev.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Division name is required'); return; }
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        const updated = await api.divisions.update(division._id, {
          name: name.trim(),
          description: description.trim(),
        });
        onComplete(updated);
        return;
      }
      const validGates = gates.filter((g) => g.name.trim() && g.gateType);
      if (!validGates.length) { setError('Add at least one gate with a name and type'); return; }
      const created = await api.divisions.create({
        name: name.trim(),
        description: description.trim(),
        gates: validGates.map((g) => ({ name: g.name.trim(), gateType: g.gateType, description: g.description.trim() })),
      });
      onComplete(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Division' : 'New Division'}
      subtitle={isEdit ? 'Update division name and description' : 'Create a division and add its gates'}
      onClose={onClose}
      maxWidth={700}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: isEdit ? 0 : '1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Division Details</h4>
          <div className="form-group">
            <label htmlFor="div-name">Division Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input id="div-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Campus, Block A, North Wing" autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="div-desc">Description</label>
            <input id="div-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
        </div>

        {!isEdit && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Gates</h4>
              <button type="button" className="btn-secondary" onClick={() => setGates((p) => [...p, emptyGate()])} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>+ Add Gate</button>
            </div>
            {gates.map((gate, i) => (
              <div key={i} style={{ padding: '1rem', background: 'var(--bg-inset,#f9fafb)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', border: '1px solid var(--border,#e5e7eb)' }}>
                <div className="form-group">
                  <label>Gate Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input value={gate.name} onChange={(e) => updateGate(i, 'name', e.target.value)} placeholder="e.g. Main Gate" />
                </div>
                <div className="form-group">
                  <label>Gate Type <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select value={gate.gateType} onChange={(e) => updateGate(i, 'gateType', e.target.value)}>
                    {GATE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input value={gate.description} onChange={(e) => updateGate(i, 'description', e.target.value)} placeholder="Optional gate notes" />
                </div>
                {gates.length > 1 && (
                  <button type="button" className="btn-danger" onClick={() => setGates((p) => p.filter((_, idx) => idx !== i))} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>Remove Gate</button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Division & Gates')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function DivisionsTab({ canWrite }) {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null);

  useEffect(() => { loadDivisions(); }, []);

  async function loadDivisions() {
    setLoading(true);
    try { setDivisions(await api.divisions.list()); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete division "${name}" and all its gates and departments? This cannot be undone.`)) return;
    try { await api.divisions.delete(id); await loadDivisions(); }
    catch (e) { setError(e.message); }
  }

  async function handleToggleActive(division) {
    try { await api.divisions.update(division._id, { isActive: !division.isActive }); await loadDivisions(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading divisions...</p>;

  return (
    <div>
      {error && <p className="error-msg">{error}</p>}
      {!canWrite && <p className="read-only-banner">View only — division changes require write access.</p>}

      {divisions.length === 0 ? (
        <div className="empty-state card">
          <p>No divisions created yet.</p>
          {canWrite && <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>Create Your First Division</button>}
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3>All Divisions ({divisions.length})</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Manage divisions, gate counts, and activation status</p>
            </div>
            {canWrite && (
              <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => setShowModal(true)}>
                <PlusIcon /> New
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
                    <td>{division.activeGateCount ?? division.gateCount ?? 0} active / {division.gateCount ?? 0} total</td>
                    <td>{division.activeDepartmentCount ?? division.departmentCount ?? 0} active / {division.departmentCount ?? 0} total</td>
                    <td><span className={`badge ${division.isActive ? 'badge-success' : 'badge-danger'}`}>{division.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>{formatDate(division.createdAt)}</td>
                    <td className="actions-cell">
                      <Link href={`/divisions/${division._id}`}>
                        <button type="button" className="btn-secondary">{canWrite ? 'Manage Gates' : 'View Gates'}</button>
                      </Link>
                      {canWrite && (
                        <>
                          <button type="button" className="btn-secondary" onClick={() => setEditingDivision(division)}>Edit</button>
                          <button type="button" className="btn-secondary" onClick={() => handleToggleActive(division)}>{division.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button type="button" className="btn-danger" onClick={() => handleDelete(division._id, division.name)}>Delete</button>
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

      {showModal && <DivisionFormModal onClose={() => setShowModal(false)} onComplete={() => { setShowModal(false); loadDivisions(); }} />}
      {editingDivision && (
        <DivisionFormModal
          division={editingDivision}
          onClose={() => setEditingDivision(null)}
          onComplete={() => { setEditingDivision(null); loadDivisions(); }}
        />
      )}
    </div>
  );
}

/* ─── Departments tab ─────────────────────────────────────────── */
function DepartmentFormModal({ department, onClose, onComplete }) {
  const isEdit = Boolean(department);
  const [divisions, setDivisions] = useState([]);
  const [divisionIds, setDivisionIds] = useState(
    () => (department?.divisionIds || []).map((div) => (typeof div === 'string' ? div : div._id))
  );
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = isEdit ? {} : { isActive: 'true' };
    api.divisions.list(params).then(setDivisions).catch((e) => setError(e.message));
  }, [isEdit]);

  function toggleDivision(id) {
    setDivisionIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (divisionIds.length === 0) { setError('Please select at least one division'); return; }
    if (!name.trim()) { setError('Department name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = { divisionIds, name: name.trim(), description: description.trim() };
      const result = isEdit
        ? await api.departments.update(department._id, payload)
        : await api.departments.create(payload);
      onComplete(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Department' : 'New Department'}
      subtitle={isEdit ? 'Update department details and division links' : 'Create a department and link it to divisions'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="dept-name">Department Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HR, IT, Security, Finance" autoFocus />
        </div>
        <div className="form-group">
          <label htmlFor="dept-desc">Description</label>
          <input id="dept-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="form-group">
          <label>Divisions <span style={{ color: 'var(--danger)' }}>*</span></label>
          <p className="field-hint">Select all divisions this department belongs to</p>
          {divisions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No divisions available. Create a division first.</p>
          ) : (
            <div className="checkbox-group">
              {divisions.map((d) => (
                <label key={d._id} className="checkbox-option">
                  <input type="checkbox" checked={divisionIds.includes(d._id)} onChange={() => toggleDivision(d._id)} />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="submit" className="btn-primary" disabled={loading || divisions.length === 0}>
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Department')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentsTab({ canWrite }) {
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);

  useEffect(() => { api.divisions.list().then(setDivisions).catch(() => {}); }, []);
  useEffect(() => { loadDepartments(); }, [divisionFilter]);

  async function loadDepartments() {
    setLoading(true);
    try {
      const params = divisionFilter ? { divisionId: divisionFilter } : {};
      setDepartments(await api.departments.list(params));
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete department "${name}"?`)) return;
    try { await api.departments.delete(id); await loadDepartments(); }
    catch (e) { setError(e.message); }
  }

  async function handleToggleActive(dept) {
    try { await api.departments.update(dept._id, { isActive: !dept.isActive }); await loadDepartments(); }
    catch (e) { setError(e.message); }
  }

  if (loading && departments.length === 0) return <p style={{ color: 'var(--text-muted)' }}>Loading departments...</p>;

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Departments ({departments.length})</h3>
          <p className="section-desc">Departments linked to their divisions</p>
        </div>
        <div className="reports-section-actions">
          <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} aria-label="Filter by division">
            <option value="">All divisions</option>
            {divisions.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          {canWrite && (
            <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => setShowModal(true)}>
              <PlusIcon /> New
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {!canWrite && <p className="read-only-banner">View only — department changes require write access.</p>}

      {departments.length === 0 ? (
        <div className="empty-state card">
          <p>No departments yet.</p>
          {canWrite && <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>Create Department</button>}
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Divisions</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept._id} className={!dept.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{dept.name}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {(dept.divisionIds || []).length > 0
                          ? dept.divisionIds.map((div) => <span key={div._id} className="badge badge-info">{div.name}</span>)
                          : '—'}
                      </div>
                    </td>
                    <td>{dept.description || '—'}</td>
                    <td><span className={`badge ${dept.isActive ? 'badge-success' : 'badge-danger'}`}>{dept.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>{formatDate(dept.createdAt)}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button type="button" className="btn-secondary" onClick={() => setEditingDepartment(dept)}>Edit</button>
                        <button type="button" className="btn-secondary" onClick={() => handleToggleActive(dept)}>{dept.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" className="btn-danger" onClick={() => handleDelete(dept._id, dept.name)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && <DepartmentFormModal onClose={() => setShowModal(false)} onComplete={() => { setShowModal(false); loadDepartments(); }} />}
      {editingDepartment && (
        <DepartmentFormModal
          department={editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onComplete={() => { setEditingDepartment(null); loadDepartments(); }}
        />
      )}
    </div>
  );
}

/* ─── Shifts tab ──────────────────────────────────────────────── */
function ShiftFormModal({ shift, onClose, onComplete }) {
  const isEdit = Boolean(shift);
  const [name, setName] = useState(shift?.name ?? '');
  const [description, setDescription] = useState(shift?.description ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Shift name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = { name: name.trim(), description: description.trim() };
      const result = isEdit
        ? await api.shifts.update(shift._id, payload)
        : await api.shifts.create(payload);
      onComplete(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Shift' : 'New Shift'}
      subtitle={isEdit ? 'Update shift name and description' : 'Create a new shift for role-based scheduling'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="shift-name">Shift Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="shift-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning Shift, Afternoon Shift, Night Shift" autoFocus />
        </div>
        <div className="form-group">
          <label htmlFor="shift-desc">Description</label>
          <input id="shift-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 6:00 AM – 2:00 PM" />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Shift')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ShiftsTab({ canWrite }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

  useEffect(() => { loadShifts(); }, []);

  async function loadShifts() {
    setLoading(true);
    try { setShifts(await api.shifts.list()); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete shift "${name}"? This cannot be undone.`)) return;
    try { await api.shifts.delete(id); await loadShifts(); }
    catch (e) { setError(e.message); }
  }

  async function handleToggleActive(shift) {
    try { await api.shifts.update(shift._id, { isActive: !shift.isActive }); await loadShifts(); }
    catch (e) { setError(e.message); }
  }

  if (loading && shifts.length === 0) return <p style={{ color: 'var(--text-muted)' }}>Loading shifts...</p>;

  return (
    <div>
      <div className="reports-section-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h3 className="section-title">All Shifts ({shifts.length})</h3>
          <p className="section-desc">Shifts available for role-based scheduling</p>
        </div>
        <div className="reports-section-actions">
          {canWrite && (
            <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => setShowModal(true)}>
              <PlusIcon /> New
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {!canWrite && <p className="read-only-banner">View only — shift changes require write access.</p>}

      {shifts.length === 0 ? (
        <div className="empty-state card">
          <p>No shifts created yet.</p>
          {canWrite && <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>Create Your First Shift</button>}
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift._id} className={!shift.isActive ? 'row-inactive' : undefined}>
                    <td className="name-cell">{shift.name}</td>
                    <td>{shift.description || '—'}</td>
                    <td><span className={`badge ${shift.isActive ? 'badge-success' : 'badge-danger'}`}>{shift.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>{formatDate(shift.createdAt)}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button type="button" className="btn-secondary" onClick={() => setEditingShift(shift)}>Edit</button>
                        <button type="button" className="btn-secondary" onClick={() => handleToggleActive(shift)}>{shift.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" className="btn-danger" onClick={() => handleDelete(shift._id, shift.name)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && <ShiftFormModal onClose={() => setShowModal(false)} onComplete={() => { setShowModal(false); loadShifts(); }} />}
      {editingShift && (
        <ShiftFormModal
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onComplete={() => { setEditingShift(null); loadShifts(); }}
        />
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────── */
const TABS = [
  { key: 'divisions', label: 'Divisions', module: 'divisions' },
  { key: 'departments', label: 'Departments', module: 'departments' },
  { key: 'shifts', label: 'Shifts', module: 'shifts' },
];

function OrganizationContent() {
  const { can } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const visibleTabs = TABS.filter((t) => can(t.module, 'read'));

  // Use URL param if valid, else fall back to first visible tab
  const activeTab = visibleTabs.find((t) => t.key === tabParam)
    ? tabParam
    : (visibleTabs[0]?.key ?? 'divisions');

  const tabLabel = TABS.find((t) => t.key === activeTab)?.label ?? 'Organization';

  return (
    <PageShell
      title="Organization"
      description={`Manage your ${tabLabel.toLowerCase()}`}
    >
      {activeTab === 'divisions' && <DivisionsTab canWrite={can('divisions', 'write')} />}
      {activeTab === 'departments' && <DepartmentsTab canWrite={can('departments', 'write')} />}
      {activeTab === 'shifts' && <ShiftsTab canWrite={can('shifts', 'write')} />}
    </PageShell>
  );
}

export default function OrganizationPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationContent />
    </Suspense>
  );
}
