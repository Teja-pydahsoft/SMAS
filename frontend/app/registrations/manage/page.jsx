'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import RegistrationFlow from '@/components/RegistrationFlow';
import RegistrationDetailsModal from '@/components/RegistrationDetailsModal';
import { formatDate } from '@/lib/formatDate';
import { STATUS_BADGE, actionLabel, photoUrlFromPath } from '../shared';
import { useAuth } from '@/components/AuthProvider';
import WriteAccess from '@/components/WriteAccess';

function DetailsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function ManageRegistrationsContent() {
  const { can } = useAuth();
  const canWrite = can('registrations', 'write');
  const searchParams = useSearchParams();
  const preselectedEdit = searchParams.get('edit');
  const passesSynced = useRef(false);

  const [roles, setRoles] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [filterRoleId, setFilterRoleId] = useState('');
  const [editingRegistrationId, setEditingRegistrationId] = useState(preselectedEdit || null);
  const [flowKey, setFlowKey] = useState(0);
  const [error, setError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detailsRegistration, setDetailsRegistration] = useState(null);

  const loadRegistrations = useCallback(async (roleId = filterRoleId) => {
    setListLoading(true);
    try {
      const params = roleId ? { roleId } : {};
      setRegistrations(await api.registrations.list(params));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setListLoading(false);
    }
  }, [filterRoleId]);

  useEffect(() => {
    api.roles.list().then(setRoles).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadRegistrations(filterRoleId);
  }, [filterRoleId, loadRegistrations]);

  useEffect(() => {
    if (passesSynced.current) return;
    passesSynced.current = true;
    api.passes.syncAllRegistrationPasses().then(() => {
      loadRegistrations(filterRoleId);
    }).catch(() => {});
  }, [filterRoleId, loadRegistrations]);

  useEffect(() => {
    if (preselectedEdit) {
      setEditingRegistrationId(preselectedEdit);
    }
  }, [preselectedEdit]);

  function handleEditRegistration(reg) {
    setError('');
    setDetailsRegistration(null);
    setEditingRegistrationId(reg._id);
    setFlowKey((k) => k + 1);
    setTimeout(() => {
      document.getElementById('registration-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleViewDetails(reg) {
    setDetailsRegistration(reg);
  }

  async function handleDeleteRegistration(reg) {
    const name = reg.displayName || reg.registrationCode || 'this registration';
    if (!confirm(`Delete registration for "${name}"? This cannot be undone.`)) return;

    try {
      await api.registrations.delete(reg._id);
      if (editingRegistrationId === reg._id) setEditingRegistrationId(null);
      if (detailsRegistration?._id === reg._id) setDetailsRegistration(null);
      await loadRegistrations(filterRoleId);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleRegistrationComplete() {
    loadRegistrations(filterRoleId);
  }

  function handleCloseEdit() {
    setEditingRegistrationId(null);
  }

  const editingRegistration = editingRegistrationId
    ? registrations.find((r) => r._id === editingRegistrationId)
    : null;

  const verifiedCount = registrations.filter((r) => r.status === 'verified').length;
  const withPassCount = registrations.filter((r) => r.hasRegistrationPass).length;

  return (
    <>
      <div className="card" style={{ marginBottom: editingRegistrationId ? '1.5rem' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3>All Registrations ({registrations.length})</h3>
            {verifiedCount > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {withPassCount} of {verifiedCount} verified users have registration passes
              </p>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Filter by Role</label>
            <select value={filterRoleId} onChange={(e) => setFilterRoleId(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role._id} value={role._id}>{role.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && !editingRegistrationId && <p className="error-msg">{error}</p>}
        {!canWrite && (
          <p className="read-only-banner">View only — registration edits require write access.</p>
        )}

        {listLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading registrations...</p>
        ) : registrations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            {filterRoleId ? 'No registrations for this role yet.' : 'No registrations yet.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Code</th>
                  <th>Pass</th>
                  <th>Date</th>
                  <th>{canWrite ? 'Actions' : 'Details'}</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => {
                  const photoUrl = reg.photoUrl || photoUrlFromPath(reg.photoPath);
                  return (
                    <tr key={reg._id}>
                      <td>
                        {photoUrl ? (
                          <img src={photoUrl} alt="" className="reg-thumb" />
                        ) : (
                          <div className="reg-thumb-placeholder">N/A</div>
                        )}
                      </td>
                      <td className="name-cell">
                        {reg.displayName || '—'}
                        {reg.formDetails?.length > 1 && (
                          <div className="sub-text">
                            {reg.formDetails.slice(1, 3).map((d) => d.value).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td>{reg.roleId?.name || '—'}</td>
                      <td>{reg.displayPhone || '—'}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[reg.status] || 'badge-info'}`}>
                          {reg.status.replace(/_/g, ' ')}
                        </span>
                        <div className="sub-text">{reg.currentStage}</div>
                      </td>
                      <td>{reg.registrationCode || '—'}</td>
                      <td>
                        {reg.status === 'verified' ? (
                          <span className={`pass-status-badge ${reg.hasRegistrationPass ? 'has-pass' : 'no-pass'}`}>
                            {reg.hasRegistrationPass ? 'Issued' : 'Pending'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        {formatDate(reg.createdAt)}
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="icon-btn details"
                          onClick={() => handleViewDetails(reg)}
                          title="View details & registration pass"
                          aria-label="View details and registration pass"
                        >
                          <DetailsIcon />
                        </button>
                        <WriteAccess module="registrations">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleEditRegistration(reg)}
                          >
                            {actionLabel(reg)}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDeleteRegistration(reg)}
                          >
                            Delete
                          </button>
                        </WriteAccess>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canWrite && editingRegistrationId && (
        <div id="registration-edit-panel" className="card" style={{ marginTop: '1.5rem' }}>
          <RegistrationFlow
            key={`edit-${flowKey}-${editingRegistrationId}`}
            roleId={editingRegistration?.roleId?._id || editingRegistration?.roleId}
            registrationId={editingRegistrationId}
            onComplete={handleRegistrationComplete}
            onCancel={handleCloseEdit}
          />
        </div>
      )}

      {detailsRegistration && (
        <RegistrationDetailsModal
          registration={detailsRegistration}
          onClose={() => setDetailsRegistration(null)}
        />
      )}
    </>
  );
}

export default function ManageRegistrationsPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Loading...</p>}>
      <ManageRegistrationsContent />
    </Suspense>
  );
}
