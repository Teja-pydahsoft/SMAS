'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import DeviceStatusBadge from '@/components/devices/DeviceStatusBadge';

const ACTION_LABELS = {
  registered:       'Registered',
  approved:         'Approved',
  rejected:         'Rejected',
  blocked:          'Blocked',
  unblocked:        'Unblocked',
  deleted:          'Deleted',
  login_attempt:    'Login Attempt',
  validation_failed:'Validation Failed',
  settings_updated: 'Settings Updated',
};

const ACTION_DOT = {
  approved:         'success',
  unblocked:        'success',
  login_attempt:    'success',
  registered:       'info',
  settings_updated: 'info',
  rejected:         'danger',
  blocked:          'danger',
  deleted:          'danger',
  validation_failed:'warning',
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="dm-detail-row">
      <span className="dm-detail-row__label">{label}</span>
      <span className="dm-detail-row__value">{value ?? '—'}</span>
    </div>
  );
}

export default function DeviceDetailModal({ deviceId, canWrite, onClose, onRefresh }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [note,    setNote]    = useState('');
  const [acting,  setActing]  = useState(false);
  const [actErr,  setActErr]  = useState('');

  useEffect(() => {
    if (!deviceId) return;
    setLoading(true);
    api.devices.get(deviceId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  async function doAction(action) {
    setActing(true); setActErr('');
    try {
      if (action === 'approve') await api.devices.approve(deviceId);
      if (action === 'reject')  await api.devices.reject(deviceId, note);
      if (action === 'block')   await api.devices.block(deviceId, note);
      if (action === 'unblock') await api.devices.unblock(deviceId);
      if (action === 'delete') {
        if (!confirm('Permanently delete this device?')) { setActing(false); return; }
        await api.devices.delete(deviceId);
        onClose(); onRefresh?.(); return;
      }
      // Reload detail + parent list
      const fresh = await api.devices.get(deviceId);
      setData(fresh);
      onRefresh?.();
    } catch (e) { setActErr(e.message); }
    finally { setActing(false); }
  }

  const dev   = data?.device;
  const logs  = data?.auditLogs ?? [];

  return (
    <div className="pass-modal-overlay" onClick={onClose} role="dialog"
      aria-modal="true" aria-label="Device Details">
      <div className="dm-detail-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="dm-detail-modal__header">
          <div>
            <h3 className="dm-detail-modal__title">
              {loading ? 'Loading…' : dev?.deviceName ?? 'Device Details'}
            </h3>
            {dev && <p className="dm-detail-modal__sub">{dev.computerName}</p>}
          </div>
          <button className="dm-detail-modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="dm-detail-modal__body">
          {loading && (
            <div className="dm-skeleton-rows">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="admin-skeleton__line" style={{ height: 18, marginBottom: 10 }} />
              ))}
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}

          {dev && (
            <div className="dm-detail-grid">
              {/* ── Left: Device info ── */}
              <div>
                <p className="dm-detail-section-title">General Information</p>
                <InfoRow label="Device Name"     value={dev.deviceName} />
                <InfoRow label="Computer Name"   value={dev.computerName} />
                <InfoRow label="Operating System" value={dev.operatingSystem} />
                <InfoRow label="Organization"    value={dev.organizationId} />
                <InfoRow label="Status"          value={<DeviceStatusBadge status={dev.status} />} />

                <p className="dm-detail-section-title" style={{ marginTop: '1.25rem' }}>Hardware Summary</p>
                <InfoRow label="Fingerprint" value={
                  <code className="dm-fingerprint dm-fingerprint--full">{dev.fingerprint}</code>
                } />

                <p className="dm-detail-section-title" style={{ marginTop: '1.25rem' }}>Registration</p>
                <InfoRow label="Registered"    value={formatDateTime(dev.registeredAt)} />
                <InfoRow label="Registered IP" value={dev.registeredIp || '—'} />
                <InfoRow label="Approved By"   value={dev.approvedByName || dev.approvedBy?.displayName || '—'} />
                <InfoRow label="Approved At"   value={formatDateTime(dev.approvedAt)} />
                <InfoRow label="Last Login"    value={formatDateTime(dev.lastLoginAt)} />
                <InfoRow label="Login Count"   value={dev.loginCount ?? 0} />
                {dev.adminNote && (
                  <InfoRow label="Admin Note" value={dev.adminNote} />
                )}

                {/* ── Actions ── */}
                {canWrite && (
                  <div className="dm-detail-actions">
                    <p className="dm-detail-section-title">Actions</p>
                    {(dev.status === 'pending' || dev.status === 'rejected') && (
                      <button className="btn-primary btn-sm" disabled={acting}
                        onClick={() => doAction('approve')}>Approve</button>
                    )}
                    {dev.status === 'pending' && (
                      <button className="btn-secondary btn-sm" disabled={acting}
                        onClick={() => doAction('reject')}>Reject</button>
                    )}
                    {dev.status === 'approved' && (
                      <button className="btn-secondary btn-sm" disabled={acting}
                        onClick={() => doAction('block')}>Block</button>
                    )}
                    {dev.status === 'blocked' && (
                      <button className="btn-primary btn-sm" disabled={acting}
                        onClick={() => doAction('unblock')}>Unblock</button>
                    )}
                    <button className="btn-danger btn-sm" disabled={acting}
                      onClick={() => doAction('delete')}>Delete</button>

                    {(dev.status === 'pending' || dev.status === 'approved') && (
                      <div className="dm-detail-note-row">
                        <input
                          type="text"
                          className="dm-detail-note-input"
                          placeholder="Optional note (reject / block)"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </div>
                    )}
                    {actErr && <p className="error-msg" style={{ marginTop: 6 }}>{actErr}</p>}
                  </div>
                )}
              </div>

              {/* ── Right: Audit timeline ── */}
              <div>
                <p className="dm-detail-section-title">Audit Timeline</p>
                {logs.length === 0 ? (
                  <p className="admin-empty-note">No audit events yet.</p>
                ) : (
                  <ol className="dm-timeline">
                    {logs.map((log, i) => (
                      <li key={log.id} className={`dm-timeline__item${i === logs.length - 1 ? ' dm-timeline__item--last' : ''}`}>
                        <span className={`dm-timeline__dot dm-timeline__dot--${ACTION_DOT[log.action] ?? 'info'}`} aria-hidden />
                        <div className="dm-timeline__content">
                          <div className="dm-timeline__event">
                            <strong>{ACTION_LABELS[log.action] ?? log.action}</strong>
                            {log.performedByName && (
                              <span className="dm-timeline__actor"> by {log.performedByName}</span>
                            )}
                          </div>
                          {log.note && (
                            <p className="dm-timeline__note">{log.note}</p>
                          )}
                          <time className="dm-timeline__time">{formatDateTime(log.createdAt)}</time>
                          {log.ipAddress && (
                            <span className="dm-timeline__ip">IP: {log.ipAddress}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
