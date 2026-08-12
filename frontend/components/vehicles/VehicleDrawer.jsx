import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VehicleStatusBadge from './VehicleStatusBadge';
import { resolvePhotoUrl } from '@/lib/photoUrl';

export default function VehicleDrawer({ vehicle, onClose, visits = [] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent background scrolling when open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!vehicle || !mounted) return null;

  const aiData = vehicle.aiMetadata || {};
  const photos = vehicle.metadata?.photos || {};

  return createPortal(
    <>
      <div 
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999
        }}
        onClick={onClose}
      />
      <style dangerouslySetInnerHTML={{__html: `
        .vehicle-drawer-container {
          position: fixed; top: 0; right: 0; height: 100dvh; width: 100%; max-width: 480px;
          background-color: var(--surface-base); z-index: 1000;
          box-shadow: -4px 0 15px rgba(0,0,0,0.1); overflow-y: auto;
        }
        @media (max-width: 768px) {
          .vehicle-drawer-container {
            top: 50%; left: 50%; right: auto; transform: translate(-50%, -50%);
            height: auto; max-height: 90vh; width: 90%; max-width: 400px;
            border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            display: flex; flex-direction: column;
          }
          .vehicle-drawer-content {
            padding-bottom: 24px !important;
          }
        }
      `}} />
      <div 
        className="vehicle-drawer-container"
      >
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'var(--surface-base)', zIndex: 10, borderRadius: '12px 12px 0 0' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Vehicle Details</h2>
          <button onClick={onClose} className="admin-btn admin-btn--ghost" style={{ padding: '4px 8px' }}>✕</button>
        </div>

        <div className="vehicle-drawer-content" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '120px' }}>
          
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
            <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Movement History</h3>
            {visits.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No recent movements found.</p>
            ) : (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-12)', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0', fontWeight: 500, width: '28%' }}>Dept</th>
                      <th style={{ padding: '0.5rem 0', fontWeight: 500, width: '28%' }}>In</th>
                      <th style={{ padding: '0.5rem 0', fontWeight: 500, width: '28%' }}>Out</th>
                      <th style={{ padding: '0.5rem 0', fontWeight: 500, width: '16%', textAlign: 'right' }}>Dur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map(visit => {
                      let duration = '-';
                      if (visit.inTime && visit.outTime) {
                        const ms = new Date(visit.outTime) - new Date(visit.inTime);
                        const mins = Math.floor(ms / 60000);
                        if (mins < 60) duration = `${mins}m`;
                        else {
                          const hrs = Math.floor(mins / 60);
                          const rem = mins % 60;
                          duration = `${hrs}h ${rem}m`;
                        }
                      } else if (visit.status === 'Inside') {
                        duration = 'Inside';
                      }

                      const inDateStr = visit.inTime ? new Date(visit.inTime).toLocaleDateString() : '';
                      const inTimeStr = visit.inTime ? new Date(visit.inTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
                      const outTimeStr = visit.outTime ? new Date(visit.outTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : (visit.status === 'Inside' ? 'Now' : '-');

                      return (
                        <tr key={visit._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0', paddingRight: '0.25rem' }}>
                            <div style={{ fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '11px' }}>
                              {visit.departmentId?.name || '-'}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '10px' }}>
                            {inDateStr && <div style={{ marginBottom: '2px' }}>{inDateStr}</div>}
                            <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>{inTimeStr}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '10px' }}>
                            {visit.outTime ? (
                              <>
                                <div style={{ marginBottom: '2px' }}>{new Date(visit.outTime).toLocaleDateString()}</div>
                                <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>{outTimeStr}</div>
                              </>
                            ) : (visit.status === 'Inside' ? <span style={{color: 'var(--status-active)'}}>Now</span> : '-')}
                          </td>
                          <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600, color: visit.status === 'Inside' ? 'var(--status-active)' : 'inherit', fontSize: '11px' }}>
                            {duration}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>
    </>,
    document.body
  );
}
