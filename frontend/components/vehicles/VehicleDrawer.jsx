import React from 'react';
import VehicleStatusBadge from './VehicleStatusBadge';
import { resolvePhotoUrl } from '@/lib/photoUrl';

export default function VehicleDrawer({ vehicle, onClose, logs = [] }) {
  if (!vehicle) return null;

  const aiData = vehicle.aiMetadata || {};
  const photos = vehicle.metadata?.photos || {};

  return (
    <>
      <div 
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999
        }}
        onClick={onClose}
      />
      <div 
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px',
          backgroundColor: 'var(--surface-base)', zIndex: 1000,
          boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'var(--surface-base)', zIndex: 10 }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Vehicle Details</h2>
          <button onClick={onClose} className="admin-btn admin-btn--ghost" style={{ padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <section>
            <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Basic Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Vehicle Number</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem' }}>{vehicle.plateNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Equipment Type</div>
                <div>{vehicle.typeId?.name || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Category</div>
                <div>{vehicle.categoryId?.name || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Current Status</div>
                <div><VehicleStatusBadge status={vehicle.status} /></div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Current Department</div>
                <div>{vehicle.departmentId?.name || 'Unassigned'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Registration Date</div>
                <div>{new Date(vehicle.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>AI Enrollment Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Original OCR Result</div>
                <div style={{ fontFamily: 'monospace' }}>{aiData.frontPlateNumber || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Normalized Plate</div>
                <div style={{ fontFamily: 'monospace' }}>{aiData.normalizedPlateNumber || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>OCR Confidence</div>
                <div>{aiData.confidence?.ocr || 0}%</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>Validation Status</div>
                <div>{aiData.validationStatus || 'Pending'}</div>
              </div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Uploaded Images</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {['front', 'frontPlate'].map(key => {
                const filename = photos[key];
                return (
                  <div key={key} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ fontSize: '10px', padding: '4px 8px', backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-color)', textTransform: 'capitalize', fontWeight: 'bold' }}>
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div style={{ height: '140px', backgroundColor: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {filename ? (
                        <img src={resolvePhotoUrl(filename)} alt={key} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>N/A</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Activity Timeline</h3>
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No recent activity found.</p>
            ) : (
              <ul className="admin-live-list">
                {logs.map(log => (
                  <li key={log._id} className="admin-live-list__item" style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                      <strong>{log.metadata?.action || log.reason || 'Activity'}</strong>
                      <span style={{ display: 'block', fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {log.decision} {log.departmentId?.name && `• ${log.departmentId.name}`}
                      </span>
                    </div>
                    <time style={{ textAlign: 'right', flexShrink: 0, fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>
                      {new Date(log.timestamp || log.createdAt).toLocaleDateString()}<br/>
                      {new Date(log.timestamp || log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </>
  );
}
