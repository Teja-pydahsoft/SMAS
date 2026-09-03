import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VehicleStatusBadge from './VehicleStatusBadge';
import { resolvePhotoUrl } from '@/lib/photoUrl';

export default function VehicleDetailsModal({ vehicle, onClose, visits = [], initialView = 'details' }) {
  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState(initialView); // 'details' | 'history'

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!vehicle || !mounted) return null;

  const aiData = vehicle.aiMetadata || {};
  const ocrConfidence = Number(aiData.confidence?.ocr || 0);
  const photos = vehicle.metadata?.photos || {};

  // Safe date parser
  const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDateStr = (d) => {
    if (!d) return '-';
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTimeStr = (d) => {
    if (!d) return '-';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group visits by local date
  const groupVisitsByDate = (visitsList) => {
    if (!visitsList || visitsList.length === 0) return [];

    const dateMap = {};

    visitsList.forEach(v => {
      const dateObj = parseDate(v.inTime) || parseDate(v.createdAt) || parseDate(v.outTime);
      if (!dateObj) return;

      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      const dateHeader = formatDateStr(dateObj);

      if (!dateMap[dateKey]) {
        dateMap[dateKey] = {
          dateKey,
          dateHeader,
          items: []
        };
      }
      dateMap[dateKey].items.push(v);
    });

    // Sort dates descending (newest first)
    return Object.values(dateMap).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  };

  const groupedHistory = groupVisitsByDate(visits);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)'
        }}
        onClick={onClose}
      />

      <style dangerouslySetInnerHTML={{__html: `
        .vehicle-modal-container {
          position: relative; z-index: 1051;
          width: 94%; max-width: 880px; max-height: 90vh;
          background-color: var(--surface-base); border-radius: 16px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.35); overflow: hidden;
          display: flex; flex-direction: column; animation: modalPop 0.2s ease-out;
        }
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .vehicle-popup-btn-tab {
          padding: 6px 14px; font-size: 0.85rem; font-weight: 600; border-radius: 8px;
          border: 1px solid var(--border-color); background: var(--surface-sunken);
          color: var(--text-secondary); cursor: pointer; transition: all 0.2s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .vehicle-popup-btn-tab.active {
          background: var(--primary); color: #ffffff; border-color: var(--primary);
        }
        .vehicle-popup-btn-tab:hover:not(.active) {
          background: var(--surface-inset); color: var(--text-primary);
        }
        .history-date-card {
          border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden;
          margin-bottom: 1.25rem; background: var(--surface-base);
        }
        .history-date-header {
          background: var(--surface-sunken); padding: 10px 16px; font-size: 0.85rem;
          font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--border-color);
          display: flex; align-items: center; justify-content: space-between;
        }
        .history-table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* --- MOBILE RESPONSIVE --- */
        @media (max-width: 768px) {
          .vehicle-modal-container {
            width: 92% !important;
            max-height: 70vh !important;
            border-radius: 12px !important;
          }
          .vehicle-modal-header {
            padding: 0.85rem 1rem !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.5rem !important;
            position: relative !important;
          }
          .vehicle-modal-close-btn {
            position: absolute !important;
            top: 0.65rem !important;
            right: 0.65rem !important;
          }
          .vehicle-modal-body {
            padding: 0.85rem 1rem !important;
            gap: 1rem !important;
          }
          .vehicle-info-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 0.65rem !important;
          }
          .vehicle-photos-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 0.65rem !important;
          }
          .vehicle-photo-box {
            height: 100px !important;
          }
          .history-table-wrapper table {
            min-width: 500px !important;
          }
        }
      `}} />

      <div className="vehicle-modal-container">
        {/* Header */}
        <div className="vehicle-modal-header" style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-elevated)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Vehicle Details</h2>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, backgroundColor: 'var(--surface-sunken)', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.95rem', color: 'var(--primary)' }}>
                {vehicle.plateNumber}
              </span>
              <VehicleStatusBadge status={vehicle.status} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {vehicle.typeId?.name ? `${vehicle.typeId.name} • ` : ''}Registered {formatDateStr(parseDate(vehicle.createdAt))}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* View Switcher Buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={`vehicle-popup-btn-tab ${activeView === 'details' ? 'active' : ''}`}
                onClick={() => setActiveView('details')}
              >
                Overview
              </button>
              <button 
                className={`vehicle-popup-btn-tab ${activeView === 'history' ? 'active' : ''}`}
                onClick={() => setActiveView('history')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                History ({visits.length})
              </button>
            </div>

            <button 
              onClick={onClose} 
              className="admin-btn admin-btn--ghost vehicle-modal-close-btn" 
              style={{ padding: '4px 8px', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="vehicle-modal-body" style={{ padding: '1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {activeView === 'details' ? (
            <>
              {/* Basic Information */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Basic Information
                  </h3>
                  <button 
                    onClick={() => setActiveView('history')}
                    className="admin-btn admin-btn--secondary"
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    History ({visits.length})
                  </button>
                </div>
                <div className="vehicle-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Plate Number</div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1.1rem', marginTop: '2px' }}>{vehicle.plateNumber}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Equipment Type</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{vehicle.typeId?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Category</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{vehicle.categoryId?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Current Status</div>
                    <div style={{ marginTop: '2px' }}><VehicleStatusBadge status={vehicle.status} /></div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Current Department</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{vehicle.departmentId?.name || 'Unassigned'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Registration Date</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{formatDateStr(parseDate(vehicle.createdAt))}</div>
                  </div>
                </div>
              </section>

              {/* AI Enrollment Information */}
              <section>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                  AI Enrollment Information
                </h3>
                <div className="vehicle-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Original OCR Result</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>{aiData.frontPlateNumber || aiData.combinedPlate || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Normalized Plate</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>{aiData.normalizedPlateNumber || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>OCR Confidence</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{aiData.confidence ? `${Math.round(ocrConfidence)}%` : 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Overall Confidence</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{aiData.confidence ? `${Math.round(Number(aiData.confidence.overall || ocrConfidence))}%` : 'N/A'}</div>
                  </div>
                </div>
              </section>

              {/* Uploaded Photos */}
              <section>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                  Uploaded Photos
                </h3>
                <div className="vehicle-photos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
                  {['front', 'frontPlate'].map(key => {
                    const filename = photos[key];
                    return (
                      <div key={key} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', padding: '6px 12px', backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-color)', textTransform: 'capitalize', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="vehicle-photo-box" style={{ height: '160px', backgroundColor: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {filename ? (
                            <img src={resolvePhotoUrl(filename)} alt={key} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No image uploaded</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            /* History View: Complete Date-Wise Movement Logs for All Dates */
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Entry & Exit History (All Dates)
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {visits.length} Total {visits.length === 1 ? 'Record' : 'Records'}
                  </span>
                  <button 
                    onClick={() => setActiveView('details')}
                    className="admin-btn admin-btn--ghost"
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}
                  >
                    ← Back to Overview
                  </button>
                </div>
              </div>

              {groupedHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--surface-sunken)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>No Movement History Recorded</p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>This vehicle has no entry or exit movement logs on record.</p>
                </div>
              ) : (
                groupedHistory.map(group => (
                  <div key={group.dateKey} className="history-date-card">
                    <div className="history-date-header">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {group.dateHeader}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{group.items.length} movement{group.items.length > 1 ? 's' : ''}</span>
                    </div>

                    <div className="history-table-wrapper">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left', fontSize: '11px', background: 'var(--surface-sunken)' }}>
                            <th style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>DEPARTMENT</th>
                            <th style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>ENTRY DATE & TIME</th>
                            <th style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>EXIT DATE & TIME</th>
                            <th style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>DURATION</th>
                            <th style={{ padding: '0.6rem 1rem', fontWeight: 700, textAlign: 'right' }}>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map(visit => {
                            const inDateObj = parseDate(visit.inTime) || parseDate(visit.createdAt);
                            const outDateObj = parseDate(visit.outTime);

                            let duration = '-';
                            if (inDateObj && outDateObj) {
                              const ms = outDateObj - inDateObj;
                              const mins = Math.floor(ms / 60000);
                              if (mins < 60) duration = `${mins} mins`;
                              else {
                                const hrs = Math.floor(mins / 60);
                                const rem = mins % 60;
                                duration = `${hrs}h ${rem}m`;
                              }
                            } else if (visit.status === 'Inside') {
                              duration = 'Inside Now';
                            }

                            return (
                              <tr key={visit._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                                  <div>{visit.departmentId?.name || 'Unassigned'}</div>
                                  {visit.divisionId?.name && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{visit.divisionId.name}</div>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>📥 {formatTimeStr(inDateObj)}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatDateStr(inDateObj)}</div>
                                  {visit.enteredBy?.name && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>By: {visit.enteredBy.name}</div>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  {outDateObj ? (
                                    <>
                                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>📤 {formatTimeStr(outDateObj)}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatDateStr(outDateObj)}</div>
                                      {visit.exitedBy?.name && (
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>By: {visit.exitedBy.name}</div>
                                      )}
                                    </>
                                  ) : (
                                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>Active Inside</span>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: visit.status === 'Inside' ? 'var(--success)' : 'var(--text-secondary)' }}>
                                  {duration}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                  <span className={`admin-badge admin-badge--${visit.status === 'Inside' ? 'success' : 'secondary'}`}>
                                    {visit.status === 'Inside' ? 'Inside' : 'Exited'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-elevated)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Vehicle ID: {vehicle._id}
          </div>
          <button className="admin-btn admin-btn--secondary" onClick={onClose} style={{ padding: '0.4rem 1.25rem', fontWeight: 600 }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
