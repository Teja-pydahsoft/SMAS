'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import DeviceDetailModal from '@/components/devices/DeviceDetailModal';

export default function DevicePendingQueue() {
  const { can }    = useAuth();
  const canWrite   = can('devices', 'write');

  const [devices,  setDevices]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [selected, setSelected] = useState(new Set());
  const [note,     setNote]     = useState('');
  const [acting,   setActing]   = useState(false);
  const [actErr,   setActErr]   = useState('');
  const [detail,   setDetail]   = useState(null);
  const [page,     setPage]     = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.devices.pending({ page, limit: 25 });
      setDevices(res.devices ?? []);
      setTotal(res.total ?? 0);
      setSelected(new Set());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

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

  async function doSingle(id, action) {
    setActing(true); setActErr('');
    try {
      if (action === 'approve') await api.devices.approve(id);
      if (action === 'reject')  await api.devices.reject(id, note);
      load();
    } catch (e) { setActErr(e.message); }
    finally { setActing(false); }
  }

  async function doBulk(action) {
    if (!selected.size) return;
    setActing(true); setActErr('');
    try {
      await Promise.all(Array.from(selected).map((id) =>
        action === 'approve' ? api.devices.approve(id) : api.devices.reject(id, note)
      ));
      setNote('');
      load();
    } catch (e) { setActErr(e.message); }
    finally { setActing(false); }
  }

  const allSelected = devices.length > 0 && selected.size === devices.length;

  return (
    <div className="dm-pending">
      {/* Header */}
      <div className="dm-pending__header">
        <div>
          <h3 className="section-title">Pending Approval ({total})</h3>
          <p className="section-desc">Devices awaiting administrator approval before users can sign in.</p>
        </div>
        {canWrite && (
          <button className="btn-secondary btn-sm" onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        )}
      </div>

      {error   && <p className="error-msg">{error}</p>}
      {actErr  && <p className="error-msg">{actErr}</p>}

      {/* Bulk bar */}
      {selected.size > 0 && canWrite && (
        <div className="dm-bulk-bar">
          <span className="dm-bulk-bar__count">{selected.size} selected</span>
          <input
            type="text"
            className="dm-bulk-bar__note"
            placeholder="Optional rejection note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-primary btn-sm"    disabled={acting} onClick={() => doBulk('approve')}>Approve All</button>
          <button className="btn-secondary btn-sm"  disabled={acting} onClick={() => doBulk('reject')}>Reject All</button>
          <button className="btn-secondary btn-sm"  onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      {loading && devices.length === 0 ? (
        <div className="card dm-skeleton-table">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="admin-skeleton__line" style={{ height: 48, marginBottom: 8 }} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-success)', marginBottom: 12 }} aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p>No devices pending approval.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="reg-table dm-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected}
                      onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Device Name</th>
                  <th>Computer</th>
                  <th>Operating System</th>
                  <th>Fingerprint</th>
                  <th>Registered IP</th>
                  <th>Registered At</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {devices.map((dev) => (
                  <tr key={dev.id} className={selected.has(dev.id) ? 'dm-row--selected' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(dev.id)}
                        onChange={() => toggleSelect(dev.id)}
                        aria-label={`Select ${dev.deviceName}`} />
                    </td>
                    <td className="name-cell">
                      <button type="button" className="dm-device-name-btn"
                        onClick={() => setDetail(dev)}>
                        {dev.deviceName || '—'}
                      </button>
                    </td>
                    <td>{dev.computerName || '—'}</td>
                    <td>{dev.operatingSystem || '—'}</td>
                    <td>
                      <code className="dm-fingerprint" title={dev.fingerprint}>
                        {dev.fingerprint ? dev.fingerprint.slice(0, 16) + '…' : '—'}
                      </code>
                    </td>
                    <td>{dev.registeredIp || '—'}</td>
                    <td>{formatDateTime(dev.registeredAt)}</td>
                    {canWrite && (
                      <td className="actions-cell">
                        <button className="btn-primary btn-sm" disabled={acting}
                          onClick={() => doSingle(dev.id, 'approve')}>Approve</button>
                        <button className="btn-secondary btn-sm" disabled={acting}
                          onClick={() => doSingle(dev.id, 'reject')}>Reject</button>
                        <button className="btn-secondary btn-sm"
                          onClick={() => setDetail(dev)}>Details</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Note input for single-row reject */}
          {canWrite && (
            <div className="dm-pending__note-row">
              <label className="dm-pending__note-label">
                Rejection / approval note (applies to single-row actions):
              </label>
              <input
                type="text"
                className="dm-pending__note-input"
                placeholder="Optional note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

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
