'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/formatDate';

const Icons = {
  checkShield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  xShield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  ),
  laptop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  slash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

function getDeviceUsers(device) {
  if (Array.isArray(device.activeUsers) && device.activeUsers.length > 0) {
    return device.activeUsers;
  }
  if (device.adminNote && /active users:\s*/i.test(device.adminNote)) {
    const raw = device.adminNote.replace(/^.*active users:\s*/i, '').trim();
    return raw.split(',').map((u) => u.trim()).filter(Boolean);
  }
  if (device.adminNote && !/denied|blocked|rejected/i.test(device.adminNote) && device.adminNote !== 'General Workstation') {
    return device.adminNote.split(',').map((u) => u.trim()).filter(Boolean);
  }
  return [];
}

export default function GeoDeviceAccessManager({ canWrite = true }) {
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState({ total: 0, granted: 0, denied: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  
  // Filtering & Pagination
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'granted', 'denied', 'pending'
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [processingId, setProcessingId] = useState(null);
  const [denyPromptDevice, setDenyPromptDevice] = useState(null);
  const [denyReason, setDenyReason] = useState('');
  const [copiedFp, setCopiedFp] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.devices.stats();
      if (s) {
        const approved = s.approved ?? s.byStatus?.approved ?? 0;
        const blocked = s.blocked ?? s.byStatus?.blocked ?? 0;
        const rejected = s.rejected ?? s.byStatus?.rejected ?? 0;
        const pending = s.pending ?? s.byStatus?.pending ?? 0;
        const total = s.total ?? (approved + blocked + rejected + pending);

        setStats({
          total,
          granted: approved,
          denied: blocked + rejected,
          pending,
        });
      }
    } catch {
      // stats fallback non-critical
    }
  }, []);

  const fetchDevices = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const queryStatus =
        activeTab === 'granted'
          ? 'approved'
          : activeTab === 'denied'
          ? 'denied'
          : activeTab === 'pending'
          ? 'pending'
          : undefined;

      const res = await api.devices.list({
        page,
        limit,
        search: search.trim() || undefined,
        status: queryStatus,
        sortBy: 'lastLoginAt',
        sortDir: 'desc',
      });

      setDevices(res.devices || []);
      setTotalPages(res.pages || 1);
      setTotalCount(res.total || 0);

      // Also refresh summary counters
      fetchStats();
    } catch (err) {
      setError(err.message || 'Failed to load system list');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, page, limit, search, fetchStats]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Reset page to 1 when changing tabs or search
  function handleTabChange(tab) {
    setActiveTab(tab);
    setPage(1);
  }

  function handleSearchChange(val) {
    setSearch(val);
    setPage(1);
  }

  const showNotification = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback({ type: '', message: '' });
    }, 4500);
  };

  // Sync systems from Geo Login Activity
  async function handleSyncFromGeoActivity() {
    setSyncing(true);
    setError('');
    try {
      const res = await api.devices.syncGeo();
      showNotification('success', `Synced ${res.synced || 0} unique desktop workstations from Geo Login Activity.`);
      await fetchDevices(true);
    } catch (err) {
      showNotification('error', err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  // Grant permission action
  async function handleGrantPermission(device) {
    if (!canWrite) return;
    setProcessingId(device.id);
    try {
      if (device.status === 'blocked') {
        await api.devices.unblock(device.id);
      } else {
        await api.devices.approve(device.id);
      }
      showNotification('success', `Permission granted for workstation: ${device.deviceName || device.computerName}`);
      await fetchDevices(true);
    } catch (err) {
      showNotification('error', err.message || 'Failed to grant permission');
    } finally {
      setProcessingId(null);
    }
  }

  // Deny / Revoke permission action
  async function handleConfirmDeny() {
    if (!denyPromptDevice || !canWrite) return;
    const device = denyPromptDevice;
    setProcessingId(device.id);
    try {
      await api.devices.block(device.id, denyReason || 'Denied via Geo Access Settings');
      showNotification('success', `Access denied for workstation: ${device.deviceName || device.computerName}`);
      setDenyPromptDevice(null);
      setDenyReason('');
      await fetchDevices(true);
    } catch (err) {
      showNotification('error', err.message || 'Failed to revoke access');
    } finally {
      setProcessingId(null);
    }
  }

  function copyFingerprint(fp) {
    if (!fp) return;
    navigator.clipboard.writeText(fp);
    setCopiedFp(fp);
    setTimeout(() => setCopiedFp(null), 2000);
  }

  return (
    <div className="device-access-manager">
      {/* HEADER SECTION */}
      <div className="dam-header">
        <div className="dam-header__title-area">
          <div className="dam-badge-icon">
            <span className="icon-wrapper">{Icons.laptop}</span>
          </div>
          <div>
            <h3 className="dam-title">Desktop Workstation Access Control</h3>
            <p className="dam-subtitle">
              Manage authorized and denied desktop & laptop workstations. Each workstation is uniquely identified by its IP address (mobile phones and tablets are strictly excluded). Grant or deny login permission directly for each workstation.
            </p>
          </div>
        </div>
        <div className="dam-header__actions">
          <button
            type="button"
            className="btn-sync-geo"
            onClick={handleSyncFromGeoActivity}
            disabled={loading || syncing}
            title="Scan Geo Login Activity for unique desktop workstations"
          >
            <span className={`sync-icon ${syncing ? 'spinning' : ''}`}>{Icons.sync}</span>
            <span>{syncing ? 'Syncing...' : 'Sync Desktop Workstations'}</span>
          </button>
          <button
            type="button"
            className="btn-refresh"
            onClick={() => fetchDevices(true)}
            disabled={loading || refreshing}
            title="Refresh workstations list"
          >
            <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>{Icons.refresh}</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC TILES */}
      <div className="dam-metrics">
        <div
          className={`metric-tile ${activeTab === 'all' ? 'metric-tile--active' : ''}`}
          onClick={() => handleTabChange('all')}
        >
          <span className="metric-label">All Workstations</span>
          <span className="metric-value">{stats.total}</span>
          <span className="metric-indicator indicator--neutral" />
        </div>
        <div
          className={`metric-tile ${activeTab === 'granted' ? 'metric-tile--active' : ''}`}
          onClick={() => handleTabChange('granted')}
        >
          <span className="metric-label">Given Access</span>
          <span className="metric-value text-green">{stats.granted}</span>
          <span className="metric-indicator indicator--green" />
        </div>
        <div
          className={`metric-tile ${activeTab === 'denied' ? 'metric-tile--active' : ''}`}
          onClick={() => handleTabChange('denied')}
        >
          <span className="metric-label">Denied Systems</span>
          <span className="metric-value text-red">{stats.denied}</span>
          <span className="metric-indicator indicator--red" />
        </div>
        <div
          className={`metric-tile ${activeTab === 'pending' ? 'metric-tile--active' : ''}`}
          onClick={() => handleTabChange('pending')}
        >
          <span className="metric-label">Pending Approval</span>
          <span className="metric-value text-amber">{stats.pending}</span>
          <span className="metric-indicator indicator--amber" />
        </div>
      </div>

      {/* FEEDBACK TOAST / ALERT */}
      {feedback.message && (
        <div className={`dam-alert dam-alert--${feedback.type}`}>
          <span className="dam-alert__icon">
            {feedback.type === 'success' ? Icons.check : Icons.xShield}
          </span>
          <span className="dam-alert__text">{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="dam-alert dam-alert--error">
          <span className="dam-alert__icon">{Icons.xShield}</span>
          <span className="dam-alert__text">{error}</span>
        </div>
      )}

      {/* CONTROLS BAR: SEARCH & TABS */}
      <div className="dam-toolbar">
        <div className="dam-tabs">
          <button
            type="button"
            className={`dam-tab-btn ${activeTab === 'all' ? 'dam-tab-btn--active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            All Workstations ({stats.total})
          </button>
          <button
            type="button"
            className={`dam-tab-btn ${activeTab === 'granted' ? 'dam-tab-btn--active' : ''}`}
            onClick={() => handleTabChange('granted')}
          >
            <span className="status-dot dot--green"></span> Given Access ({stats.granted})
          </button>
          <button
            type="button"
            className={`dam-tab-btn ${activeTab === 'denied' ? 'dam-tab-btn--active' : ''}`}
            onClick={() => handleTabChange('denied')}
          >
            <span className="status-dot dot--red"></span> Denied Systems ({stats.denied})
          </button>
          <button
            type="button"
            className={`dam-tab-btn ${activeTab === 'pending' ? 'dam-tab-btn--active' : ''}`}
            onClick={() => handleTabChange('pending')}
          >
            <span className="status-dot dot--amber"></span> Pending ({stats.pending})
          </button>
        </div>

        <div className="dam-search">
          <span className="search-icon">{Icons.search}</span>
          <input
            type="text"
            placeholder="Search by workstation IP, OS, hostname, user, or fingerprint..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button type="button" className="btn-clear-search" onClick={() => handleSearchChange('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* SYSTEMS TABLE / LIST */}
      <div className="dam-table-container">
        {loading ? (
          <div className="dam-empty-state">
            <div className="spinner"></div>
            <p>Loading registered workstations & permissions...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="dam-empty-state">
            <div className="empty-icon">{Icons.laptop}</div>
            <h4>
              {activeTab === 'denied'
                ? 'No Denied Workstations'
                : activeTab === 'granted'
                ? 'No Authorized Workstations'
                : activeTab === 'pending'
                ? 'No Pending Workstations'
                : 'No Desktop Workstations Found'}
            </h4>
            <p>
              {search
                ? `No workstations match "${search}". Try clearing your search.`
                : activeTab === 'denied'
                ? 'All desktop workstations currently have granted access or are pending approval.'
                : 'No desktop workstations found for this filter.'}
            </p>
          </div>
        ) : (
          <div className="dam-table-wrapper">
            <table className="dam-table">
              <thead>
                <tr>
                  <th>Workstation / System</th>
                  <th>User Name</th>
                  <th>Operating System</th>
                  <th>Workstation IP</th>
                  <th>Hardware Fingerprint</th>
                  <th>Activity & Logins</th>
                  <th>Access Status</th>
                  <th style={{ textAlign: 'right' }}>Permission Action</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const isApproved = device.status === 'approved';
                  const isDenied = device.status === 'blocked' || device.status === 'rejected';
                  const isPending = device.status === 'pending';
                  const isBusy = processingId === device.id;
                  const users = getDeviceUsers(device);

                  return (
                    <tr key={device.id} className={`dam-row ${isDenied ? 'dam-row--denied' : isApproved ? 'dam-row--approved' : ''}`}>
                      <td>
                        <div className="system-identity">
                          <div className={`system-avatar ${isApproved ? 'avatar--granted' : isDenied ? 'avatar--denied' : 'avatar--pending'}`}>
                            {Icons.laptop}
                          </div>
                          <div className="system-info">
                            <span className="system-name">{device.deviceName || device.computerName || 'Unnamed Device'}</span>
                            <span className="computer-name">Host: {device.computerName || '—'}</span>
                            {device.isPrimaryAdminDevice && (
                              <span className="badge-primary-admin">Primary Admin Workstation</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="user-column">
                          {users.length === 0 ? (
                            <span className="user-empty">—</span>
                          ) : (
                            <div className="user-badges-wrap">
                              {users.slice(0, 2).map((u, i) => (
                                <div key={i} className="user-pill" title={`Active user account: ${u}`}>
                                  <span className="user-pill__icon">{Icons.user}</span>
                                  <span className="user-pill__name">{u}</span>
                                </div>
                              ))}
                              {users.length > 2 && (
                                <span
                                  className="user-pill-more"
                                  title={`All users: ${users.join(', ')}`}
                                >
                                  +{users.length - 2} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="os-badge-wrapper">
                          <span className="os-tag">{device.operatingSystem || 'Unknown OS'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ip-cell-wrapper">
                          <span className="ip-text font-mono font-bold text-slate-800 dark:text-slate-200">
                            {device.registeredIp || '—'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="fingerprint-wrapper">
                          <code className="fp-code" title={device.fingerprint}>
                            {device.fingerprint ? `${device.fingerprint.slice(0, 10)}…${device.fingerprint.slice(-8)}` : '—'}
                          </code>
                          {device.fingerprint && (
                            <button
                              type="button"
                              className="btn-copy-fp"
                              onClick={() => copyFingerprint(device.fingerprint)}
                              title="Copy SHA-256 Fingerprint"
                            >
                              {copiedFp === device.fingerprint ? (
                                <span className="text-green">{Icons.check}</span>
                              ) : (
                                Icons.copy
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="meta-stack">
                          <span className="date-text">
                            {device.lastLoginAt
                              ? `Last: ${formatDateTime(device.lastLoginAt)}`
                              : `Reg: ${formatDateTime(device.registeredAt || device.createdAt)}`}
                          </span>
                          {device.loginCount > 0 && (
                            <span className="login-count-tag">{device.loginCount} login{device.loginCount === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {isApproved && (
                          <span className="status-pill status-pill--granted">
                            <span className="pill-dot"></span> Given Access
                          </span>
                        )}
                        {isDenied && (
                          <div className="status-pill-stack">
                            <span className="status-pill status-pill--denied">
                              <span className="pill-dot"></span> Denied System
                            </span>
                          </div>
                        )}
                        {isPending && (
                          <span className="status-pill status-pill--pending">
                            <span className="pill-dot"></span> Pending Approval
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="actions-cell">
                          {/* If Denied or Pending: Show Grant Permission Button */}
                          {(isDenied || isPending) && (
                            <button
                              type="button"
                              className="btn-action-grant"
                              onClick={() => handleGrantPermission(device)}
                              disabled={!canWrite || isBusy}
                              title="Grant permission for this system only"
                            >
                              {isBusy ? (
                                <span className="action-spinner"></span>
                              ) : (
                                <span className="btn-icon">{Icons.checkShield}</span>
                              )}
                              <span>Grant Permission</span>
                            </button>
                          )}

                          {/* If Given Access: Show Deny / Revoke Button */}
                          {isApproved && (
                            <button
                              type="button"
                              className="btn-action-deny"
                              onClick={() => {
                                setDenyPromptDevice(device);
                                setDenyReason('');
                              }}
                              disabled={!canWrite || isBusy}
                              title="Revoke permission / deny this system"
                            >
                              {isBusy ? (
                                <span className="action-spinner"></span>
                              ) : (
                                <span className="btn-icon">{Icons.slash}</span>
                              )}
                              <span>Deny Access</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION CONTROLS */}
        {totalPages > 1 && (
          <div className="dam-pagination">
            <span className="pagination-info">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalCount)} of {totalCount} systems
            </span>
            <div className="pagination-buttons">
              <button
                type="button"
                className="btn-page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span className="page-indicator">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: REASON FOR DENYING ACCESS */}
      {denyPromptDevice && (
        <div className="modal-backdrop" onClick={() => setDenyPromptDevice(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <span className="modal-icon text-red">{Icons.xShield}</span>
                <h4>Deny System Permission</h4>
              </div>
              <button type="button" className="btn-modal-close" onClick={() => setDenyPromptDevice(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to deny access to <strong>{denyPromptDevice.deviceName || denyPromptDevice.computerName}</strong>?
                This system will be immediately blocked from logging in.
              </p>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="denyReason">Reason for Denial (Optional)</label>
                <input
                  id="denyReason"
                  type="text"
                  placeholder="e.g., Unrecognized personal workstation, security policy..."
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDenyPromptDevice(null)}
                disabled={processingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDeny}
                disabled={processingId !== null}
              >
                {processingId ? 'Denying...' : 'Confirm Deny Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .device-access-manager {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          margin-top: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .dam-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .dam-header__title-area {
          display: flex;
          gap: 14px;
          align-items: center;
        }

        .dam-badge-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: #eff6ff;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-wrapper {
          width: 24px;
          height: 24px;
        }

        .dam-title {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }

        .dam-subtitle {
          margin: 0;
          font-size: 13px;
          color: #64748b;
          max-width: 680px;
          line-height: 1.4;
        }

        .dam-header__actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .btn-sync-geo {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-sync-geo:hover:not(:disabled) {
          background: #dbeafe;
          border-color: #93c5fd;
        }

        .btn-refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-refresh:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #1e293b;
        }

        .refresh-icon, .sync-icon {
          width: 14px;
          height: 14px;
          display: flex;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* METRICS */
        .dam-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .metric-tile {
          position: relative;
          padding: 14px 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          overflow: hidden;
        }

        .metric-tile:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }

        .metric-tile--active {
          background: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb, 0 2px 4px rgba(37, 99, 235, 0.08);
        }

        .metric-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 4px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
        }

        .text-green { color: #16a34a !important; }
        .text-red { color: #dc2626 !important; }
        .text-amber { color: #d97706 !important; }

        .metric-indicator {
          position: absolute;
          top: 0;
          right: 0;
          width: 4px;
          height: 100%;
        }

        .indicator--neutral { background: #94a3b8; }
        .indicator--green { background: #16a34a; }
        .indicator--red { background: #dc2626; }
        .indicator--amber { background: #f59e0b; }

        /* ALERTS */
        .dam-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 13px;
        }

        .dam-alert--success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .dam-alert--error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .dam-alert__icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        /* TOOLBAR */
        .dam-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .dam-tabs {
          display: flex;
          gap: 6px;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
        }

        .dam-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .dam-tab-btn--active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }

        .dot--green { background: #16a34a; }
        .dot--red { background: #dc2626; }
        .dot--amber { background: #f59e0b; }

        .dam-search {
          position: relative;
          min-width: 300px;
          max-width: 420px;
          flex: 1;
        }

        .dam-search input {
          width: 100%;
          padding: 8px 28px 8px 34px;
          font-size: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .dam-search input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: #94a3b8;
        }

        .btn-clear-search {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 16px;
          color: #94a3b8;
          cursor: pointer;
          padding: 0 4px;
        }

        /* TABLE */
        .dam-table-container {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .dam-table-wrapper {
          overflow-x: auto;
        }

        .dam-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
        }

        .dam-table th {
          background: #f8fafc;
          padding: 11px 16px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #475569;
          border-bottom: 1px solid #e2e8f0;
        }

        .dam-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }

        .dam-row:last-child td {
          border-bottom: none;
        }

        .dam-row:hover {
          background: #f8fafc;
        }

        .dam-row--denied {
          background: rgba(254, 242, 242, 0.45);
        }

        .system-identity {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .system-avatar {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .system-avatar :global(svg) {
          width: 18px;
          height: 18px;
        }

        .avatar--granted {
          background: #ecfdf5;
          color: #059669;
        }

        .avatar--denied {
          background: #fef2f2;
          color: #dc2626;
        }

        .avatar--pending {
          background: #fffbeb;
          color: #d97706;
        }

        .system-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .system-name {
          font-weight: 600;
          color: #0f172a;
          font-size: 13px;
        }

        .computer-name {
          font-size: 11px;
          color: #64748b;
          font-family: monospace;
        }

        .user-column {
          display: flex;
          align-items: center;
        }

        .user-badges-wrap {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          max-width: 220px;
        }

        .user-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
          white-space: nowrap;
          transition: background-color 0.15s ease;
        }

        .user-pill:hover {
          background: #e2e8f0;
        }

        .user-pill__icon {
          width: 13px;
          height: 13px;
          color: #64748b;
          display: flex;
          align-items: center;
        }

        .user-pill__icon :global(svg) {
          width: 13px;
          height: 13px;
        }

        .user-pill__name {
          color: #0f172a;
          font-weight: 600;
          font-size: 12px;
        }

        .user-pill-more {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 4px;
          background: #e2e8f0;
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
        }

        .user-empty {
          color: #94a3b8;
          font-size: 13px;
        }

        .badge-primary-admin {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          color: #2563eb;
          background: #dbeafe;
          padding: 1px 6px;
          border-radius: 4px;
          margin-top: 3px;
          width: fit-content;
        }

        .os-tag {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          background: #f1f5f9;
          color: #334155;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }

        .fingerprint-wrapper {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .fp-code {
          font-family: monospace;
          font-size: 11px;
          background: #f8fafc;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
          color: #475569;
        }

        .btn-copy-fp {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          color: #94a3b8;
          display: flex;
          align-items: center;
        }

        .btn-copy-fp :global(svg) {
          width: 14px;
          height: 14px;
        }

        .btn-copy-fp:hover {
          color: #334155;
        }

        .meta-stack {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ip-text {
          font-size: 12px;
          font-family: monospace;
          font-weight: 600;
          color: #1e293b;
        }

        .date-text {
          font-size: 11px;
          color: #94a3b8;
        }

        .login-count-tag {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
        }

        /* STATUS PILLS */
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
        }

        .status-pill-stack {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 3px;
        }

        .pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .status-pill--granted {
          background: #dcfce7;
          color: #15803d;
        }
        .status-pill--granted .pill-dot { background: #16a34a; }

        .status-pill--denied {
          background: #fee2e2;
          color: #b91c1c;
        }
        .status-pill--denied .pill-dot { background: #dc2626; }

        .status-pill--pending {
          background: #fef3c7;
          color: #b45309;
        }
        .status-pill--pending .pill-dot { background: #f59e0b; }

        /* ACTIONS */
        .actions-cell {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .btn-action-grant {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #16a34a;
          background: #16a34a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-action-grant:hover:not(:disabled) {
          background: #15803d;
          border-color: #15803d;
          box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);
        }

        .btn-action-grant:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-action-deny {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #fca5a5;
          background: #ffffff;
          color: #dc2626;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-action-deny:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #ef4444;
        }

        .btn-action-deny:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-icon {
          width: 14px;
          height: 14px;
          display: flex;
        }

        .btn-icon :global(svg) {
          width: 100%;
          height: 100%;
        }

        .action-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* PAGINATION */
        .dam-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 12px;
          color: #64748b;
        }

        .pagination-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-page {
          padding: 5px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #334155;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-page:hover:not(:disabled) {
          background: #f1f5f9;
        }

        .btn-page:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-indicator {
          font-weight: 600;
          color: #334155;
        }

        .dam-empty-state {
          padding: 48px 20px;
          text-align: center;
          color: #64748b;
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          color: #cbd5e1;
        }

        .dam-empty-state h4 {
          margin: 0 0 6px 0;
          font-size: 15px;
          color: #334155;
        }

        .dam-empty-state p {
          margin: 0;
          font-size: 13px;
        }

        /* MODAL */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(2px);
        }

        .modal-box {
          background: #ffffff;
          border-radius: 12px;
          width: 100%;
          max-width: 460px;
          padding: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .modal-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .modal-icon {
          width: 22px;
          height: 22px;
        }

        .modal-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }

        .btn-modal-close {
          background: none;
          border: none;
          font-size: 22px;
          line-height: 1;
          color: #94a3b8;
          cursor: pointer;
        }

        .modal-body p {
          font-size: 13px;
          color: #475569;
          line-height: 1.5;
          margin: 0;
        }

        .modal-body input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          margin-top: 6px;
          outline: none;
        }

        .modal-body input:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 24px;
        }

        .btn-secondary {
          padding: 8px 14px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }

        .btn-danger {
          padding: 8px 14px;
          border-radius: 6px;
          border: 1px solid #dc2626;
          background: #dc2626;
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          cursor: pointer;
        }

        .btn-danger:hover {
          background: #b91c1c;
        }

        @media (max-width: 768px) {
          .dam-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
          .dam-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .dam-search {
            max-width: 100%;
          }
          .dam-pagination {
            flex-direction: column;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}
