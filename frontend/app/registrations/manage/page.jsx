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

const PAGE_SIZE = 25;

/** Session-level guard so Strict Mode remounts don't re-sync / re-fetch. */
let registrationPassesSyncStarted = false;

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
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const requestSeqRef = useRef(0);

  const [roles, setRoles] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [filterRoleId, setFilterRoleId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRegistrationId, setEditingRegistrationId] = useState(preselectedEdit || null);
  const [flowKey, setFlowKey] = useState(0);
  const [error, setError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState({ verified: 0, withPass: 0 });
  const [detailsRegistration, setDetailsRegistration] = useState(null);
  const [showNewRegistrationModal, setShowNewRegistrationModal] = useState(false);

  const loadRegistrations = useCallback(async (
    roleId = filterRoleId,
    search = searchQuery,
    { page: nextPage = 1, append = false, silent = false } = {}
  ) => {
    const requestId = ++requestSeqRef.current;

    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (!silent) {
      setListLoading(true);
    }

    try {
      const params = {
        page: nextPage,
        limit: PAGE_SIZE,
        ...(roleId ? { roleId } : {}),
        ...(search ? { search } : {}),
      };
      const data = await api.registrations.list(params);

      // Ignore stale responses from an earlier filter / page request
      if (requestId !== requestSeqRef.current && !append) return;

      const items = Array.isArray(data) ? data : (data?.items || []);
      const nextTotal = Array.isArray(data) ? items.length : Number(data?.total || 0);
      const nextHasMore = Array.isArray(data) ? false : Boolean(data?.hasMore);
      const nextSummary = Array.isArray(data)
        ? {
            verified: items.filter((r) => r.status === 'verified').length,
            withPass: items.filter((r) => r.hasRegistrationPass).length,
          }
        : {
            verified: Number(data?.summary?.verified || 0),
            withPass: Number(data?.summary?.withPass || 0),
          };

      setRegistrations((prev) => (append ? [...prev, ...items] : items));
      setPage(nextPage);
      setTotal(nextTotal);
      setHasMore(nextHasMore);
      setSummary(nextSummary);
      setError('');
    } catch (e) {
      if (requestId === requestSeqRef.current || append) {
        setError(e.message);
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else if (!silent && requestId === requestSeqRef.current) {
        setListLoading(false);
      }
    }
  }, [filterRoleId, searchQuery]);

  useEffect(() => {
    api.roles.list().then(setRoles).catch((e) => setError(e.message));
  }, []);

  // Debounce search input so typing doesn't hammer the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setRegistrations([]);
    setPage(1);
    setHasMore(false);
    loadRegistrations(filterRoleId, searchQuery, { page: 1, append: false });
  }, [filterRoleId, searchQuery, loadRegistrations]);

  // Ensure missing registration passes exist once per session.
  // Only refresh the list when something was created — avoids the instant reload flash.
  useEffect(() => {
    if (registrationPassesSyncStarted) return;
    registrationPassesSyncStarted = true;
    api.passes.syncAllRegistrationPasses()
      .then((summary) => {
        if (Number(summary?.created) > 0) {
          return loadRegistrations(filterRoleId, searchQuery, { page: 1, append: false, silent: true });
        }
        return null;
      })
      .catch(() => {});
  }, [filterRoleId, searchQuery, loadRegistrations]);

  useEffect(() => {
    if (preselectedEdit) {
      setEditingRegistrationId(preselectedEdit);
    }
  }, [preselectedEdit]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || listLoading) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMoreRef.current) {
          loadRegistrations(filterRoleId, searchQuery, { page: page + 1, append: true });
        }
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filterRoleId, searchQuery, hasMore, listLoading, loadRegistrations, page]);

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
      await loadRegistrations(filterRoleId, searchQuery, { page: 1, append: false });
    } catch (e) {
      setError(e.message);
    }
  }

  function handleRegistrationComplete() {
    setShowNewRegistrationModal(false);
    setEditingRegistrationId(null);
    loadRegistrations(filterRoleId, searchQuery, { page: 1, append: false });
  }

  function handleCloseEdit() {
    setEditingRegistrationId(null);
  }

  const editingRegistration = editingRegistrationId
    ? registrations.find((r) => r._id === editingRegistrationId)
    : null;

  const verifiedCount = summary.verified;
  const withPassCount = summary.withPass;
  const showingFrom = registrations.length === 0 ? 0 : 1;
  const showingTo = registrations.length;

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3>All Registrations ({total})</h3>
            {verifiedCount > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {withPassCount} of {verifiedCount} verified users have registration passes
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label htmlFor="reg-search">Search</label>
              <div className="reg-search-wrap">
                <svg className="reg-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  id="reg-search"
                  type="search"
                  className="reg-search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name or code…"
                  autoComplete="off"
                />
              </div>
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
            {searchQuery
              ? `No registrations match “${searchQuery}”.`
              : filterRoleId
                ? 'No registrations for this role yet.'
                : 'No registrations yet.'}
          </p>
        ) : (
          <>
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

            <div className="reg-pagination">
              <p className="reg-pagination__meta">
                Showing {showingFrom}–{showingTo} of {total}
              </p>
              <div className="reg-pagination__actions">
                {hasMore ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => loadRegistrations(filterRoleId, searchQuery, { page: page + 1, append: true })}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                ) : (
                  <span className="reg-pagination__done">All registrations loaded</span>
                )}
              </div>
              <div ref={loadMoreRef} className="reg-pagination__sentinel" aria-hidden="true" />
            </div>
          </>
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
