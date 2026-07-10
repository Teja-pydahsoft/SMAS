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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RegistrationFlowModal({ title, subtitle, onClose, children, ariaLabel }) {
  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
    >
      <div
        className="reg-details-modal reg-details-modal--flow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">{title}</h3>
              {subtitle && <p className="reg-details-modal__sub">{subtitle}</p>}
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

        <div className="reg-details-modal__body">{children}</div>
      </div>
    </div>
  );
}

function NewRegistrationModal({ roles, onClose, onComplete }) {
  const [flowKey, setFlowKey] = useState(0);

  function handleRegistrationComplete(reg) {
    onComplete?.(reg);
  }

  function handleRegisterAnother() {
    setFlowKey((k) => k + 1);
  }

  return (
    <RegistrationFlowModal
      title="New Registration"
      subtitle="Select a role and complete the registration"
      onClose={onClose}
      ariaLabel="New Registration"
    >
      <RegistrationFlow
        key={`new-modal-${flowKey}`}
        roles={roles}
        onComplete={handleRegistrationComplete}
        onCancel={onClose}
        onRegisterAnother={handleRegisterAnother}
        inModal
      />
    </RegistrationFlowModal>
  );
}

function EditRegistrationModal({ registration, registrationId, onClose, onComplete }) {
  const title = registration ? `${actionLabel(registration)} Details` : 'Edit Registration';
  const subtitle = registration
    ? `${registration.displayName || 'Unnamed'} · ${registration.roleId?.name || '—'}`
    : 'Update registration information';

  return (
    <RegistrationFlowModal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      ariaLabel="Edit registration"
    >
      <RegistrationFlow
        key={`edit-flow-${registrationId}`}
        roleId={registration?.roleId?._id || registration?.roleId}
        registrationId={registrationId}
        onComplete={() => {
          onComplete?.();
        }}
        onCancel={onClose}
        inModal
      />
    </RegistrationFlowModal>
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
  const [showNewRegistrationModal, setShowNewRegistrationModal] = useState(false);

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
  }

  function handleViewDetails(reg) {
    setDetailsRegistration(reg);
    api.registrations.get(reg._id)
      .then(setDetailsRegistration)
      .catch((e) => setError(e.message));
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
    setShowNewRegistrationModal(false);
    setEditingRegistrationId(null);
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
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3>All Registrations ({registrations.length})</h3>
            {verifiedCount > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {withPassCount} of {verifiedCount} verified users have registration passes
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>Filter by Role</label>
              <select value={filterRoleId} onChange={(e) => setFilterRoleId(e.target.value)}>
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role._id} value={role._id}>{role.name}</option>
                ))}
              </select>
            </div>

            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-end', marginBottom: '0' }}
                onClick={() => setShowNewRegistrationModal(true)}
                aria-label="New Registration"
              >
                <PlusIcon />
                New
              </button>
            )}
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
                          className="btn-secondary btn-sm"
                          onClick={() => handleViewDetails(reg)}
                        >
                          View Details
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
        <EditRegistrationModal
          key={`edit-modal-${flowKey}-${editingRegistrationId}`}
          registration={editingRegistration}
          registrationId={editingRegistrationId}
          onClose={handleCloseEdit}
          onComplete={handleRegistrationComplete}
        />
      )}

      {detailsRegistration && (
        <RegistrationDetailsModal
          registration={detailsRegistration}
          onClose={() => setDetailsRegistration(null)}
        />
      )}

      {showNewRegistrationModal && (
        <NewRegistrationModal
          roles={roles}
          onClose={() => setShowNewRegistrationModal(false)}
          onComplete={handleRegistrationComplete}
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
