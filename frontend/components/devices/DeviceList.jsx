'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import DeviceDetailModal from '@/components/devices/DeviceDetailModal';
import DeviceStatusBadge, { deviceStatusOptions } from '@/components/devices/DeviceStatusBadge';

const PAGE_SIZES = [10, 25, 50, 100];
const SORT_FIELDS = [
  { value: 'createdAt',    label: 'Registered Date' },
  { value: 'lastLoginAt',  label: 'Last Seen' },
  { value: 'deviceName',   label: 'Device Name' },
  { value: 'computerName', label: 'Computer Name' },
  { value: 'status',       label: 'Status' },
];

function truncate(str, n) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export default function DeviceList() {
  const { can } = useAuth();
  const canWrite = can('devices', 'write');

  const [devices,   setDevices]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [limit,     setLimit]     = useState(25);
  const [pages,     setPages]     = useState(1);
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState('');
  const [sortBy,    setSortBy]    = useState('createdAt');
  const [sortDir,   setSortDir]   = useState('desc');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [selected,  setSelected]  = useState(new Set());
  const [detail,    setDetail]    = useState(null);
  const [actionErr, setActionErr] = useState('');
  const [bulkNote,  setBulkNote]  = useState('');

  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.devices.list({
        page, limit, search, status, sortBy, sortDir, ...params,
      });
      setDevices(res.devices ?? []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
      setSelected(new Set());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, limit, search, status, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  function handleSearchChange(e) {
    const v = e.target.value;
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load({ search: v, page: 1 }); }, 350);
  }

  function handleSort(field) {
    if (sortBy === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field); setSortDir('asc');
    }
    setPage(1);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === devices.length) setSelected(new Set());
    else setSelected(new Set(devices.map((d) => d.id)));
  }

  async function handleAction(deviceId, action, note = '') {
    setActionErr('');
    try {
      if (action === 'approve') await api.devices.approve(deviceId);
      else if (action === 'reject')  await api.devices.reject(deviceId, note);
      else if (action === 'block')   await api.devices.block(deviceId, note);
      else if (action === 'unblock') await api.devices.unblock(deviceId);
      else if (action === 'delete') {
        if (!confirm('Permanently delete this device?')) return;
        await api.devices.delete(deviceId);
      }
      load();
    } catch (e) { setActionErr(e.message); }
  }

  async function handleBulkAction(action) {
    if (!selected.size) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} device(s)?`)) return;
    setActionErr('');
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map((id) => {
        if (action === 'approve') return api.devices.approve(id);
        if (action === 'reject')  return api.devices.reject(id, bulkNote);
        if (action === 'block')   return api.devices.block(id, bulkNote);
        if (action === 'delete')  return api.devices.delete(id);
        return Promise.resolve();
      }));
      setBulkNote('');
      load();
    } catch (e) { setActionErr(e.message); }
  }

  function SortIcon({ field }) {
    if (sortBy !== field) return <span className="dm-sort-icon" aria-hidden>↕</span>;
    return <span className="dm-sort-icon dm-sort-icon--active" aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const allSelected = devices.length > 0 && selected.size === devices.length;

  return (
    <div className="dm-list">
      {/* ── Toolbar ── */}
      <div className="dm-toolbar">
        <div className="dm-toolbar__search">
          <svg className="dm-toolbar__search-icon" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={searchRef}
            type="search"
            className="dm-toolbar__search-input"
            placeholder="Search devices…"
            value={search}
            onChange={handleSearchChange}
            aria-label="Search devices"
          />
        </div>
        <div className="dm-toolbar__filters">
          <select
            className="dm-toolbar__select"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {deviceStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="dm-toolbar__select"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split(':');
              setSortBy(f); setSortDir(d); setPage(1);
            }}
            aria-label="Sort by"
          >
            {SORT_FIELDS.map((f) => (
              <option key={f.value + ':desc'} value={`${f.value}:desc`}>{f.label} ↓</option>
            ))}
            {SORT_FIELDS.map((f) => (
              <option key={f.value + ':asc'}  value={`${f.value}:asc`}>{f.label} ↑</option>
            ))}
          </select>
          <select
            className="dm-toolbar__select"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* ── Bulk action bar (visible when selection > 0) ── */}
      {selected.size > 0 && canWrite && (
        <div className="dm-bulk-bar">
          <span className="dm-bulk-bar__count">{selected.size} selected</span>
          <input
            type="text"
            className="dm-bulk-bar__note"
            placeholder="Optional note (for reject / block)"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            aria-label="Bulk action note"
          />
          <button className="btn-primary btn-sm" onClick={() => handleBulkAction('approve')}>Approve All</button>
          <button className="btn-secondary btn-sm" onClick={() => handleBulkAction('reject')}>Reject All</button>
          <button className="btn-secondary btn-sm" onClick={() => handleBulkAction('block')}>Block All</button>
          <button className="btn-danger btn-sm"    onClick={() => handleBulkAction('delete')}>Delete All</button>
          <button className="btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {error    && <p className="error-msg">{error}</p>}
      {actionErr && <p className="error-msg">{actionErr}</p>}

      {/* ── Table ── */}
      <div className="card">
        {loading && devices.length === 0 ? (
          <div className="dm-skeleton-table">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="admin-skeleton__line" style={{ height: 42, marginBottom: 6 }} />
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="empty-state">
            <p>No devices found{search || status ? ' matching your filters' : ''}.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="reg-table dm-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="dm-table__sortable" onClick={() => handleSort('deviceName')}>
                    Device Name <SortIcon field="deviceName" />
                  </th>
                  <th className="dm-table__sortable" onClick={() => handleSort('computerName')}>
                    Computer <SortIcon field="computerName" />
                  </th>
                  <th>Fingerprint</th>
                  <th>OS</th>
                  <th className="dm-table__sortable" onClick={() => handleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className="dm-table__sortable" onClick={() => handleSort('lastLoginAt')}>
                    Last Seen <SortIcon field="lastLoginAt" />
                  </th>
                  <th className="dm-table__sortable" onClick={() => handleSort('createdAt')}>
                    Registered <SortIcon field="createdAt" />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((dev) => (
                  <tr key={dev.id} className={selected.has(dev.id) ? 'dm-row--selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(dev.id)}
                        onChange={() => toggleSelect(dev.id)}
                        aria-label={`Select ${dev.deviceName}`}
                      />
                    </td>
                    <td className="name-cell">
                      <button
                        type="button"
                        className="dm-device-name-btn"
                        onClick={() => setDetail(dev)}
                      >
                        {dev.deviceName || '—'}
                      </button>
                    </td>
                    <td>{dev.computerName || '—'}</td>
                    <td>
                      <code
                        className="dm-fingerprint"
                        title={dev.fingerprint}
                      >
                        {dev.fingerprint ? dev.fingerprint.slice(0, 16) + '…' : '—'}
                      </code>
                    </td>
                    <td>{truncate(dev.operatingSystem, 22)}</td>
                    <td><DeviceStatusBadge status={dev.status} /></td>
                    <td>{formatDate(dev.lastLoginAt)}</td>
                    <td>{formatDate(dev.registeredAt)}</td>
                    <td className="actions-cell">
                      <button className="btn-secondary btn-sm" onClick={() => setDetail(dev)}>
                        Details
                      </button>
                      {canWrite && dev.status === 'pending' && (
                        <>
                          <button className="btn-primary btn-sm" onClick={() => handleAction(dev.id, 'approve')}>Approve</button>
                          <button className="btn-secondary btn-sm" onClick={() => handleAction(dev.id, 'reject')}>Reject</button>
                        </>
                      )}
                      {canWrite && dev.status === 'approved' && (
                        <button className="btn-secondary btn-sm" onClick={() => handleAction(dev.id, 'block')}>Block</button>
                      )}
                      {canWrite && dev.status === 'blocked' && (
                        <button className="btn-primary btn-sm" onClick={() => handleAction(dev.id, 'unblock')}>Unblock</button>
                      )}
                      {canWrite && (
                        <button className="btn-danger btn-sm" onClick={() => handleAction(dev.id, 'delete')}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div className="dm-pagination">
            <span className="dm-pagination__info">
              {total} device{total !== 1 ? 's' : ''} — page {page} of {pages}
            </span>
            <div className="dm-pagination__btns">
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const n = Math.max(1, Math.min(page - 3, pages - 6)) + i;
                return (
                  <button
                    key={n}
                    className={`btn-secondary btn-sm${n === page ? ' dm-pagination__btn--active' : ''}`}
                    onClick={() => setPage(n)}
                  >{n}</button>
                );
              })}
              <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
              <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(pages)}>»</button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <DeviceDetailModal
          deviceId={detail.id}
          canWrite={canWrite}
          onClose={() => setDetail(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
