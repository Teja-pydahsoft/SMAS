import React, { useState } from 'react';
import VehicleStatusBadge from './VehicleStatusBadge';
import Link from 'next/link';
import AdminIcon from '@/components/admin/AdminIcons';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import VehicleQrModal from './VehicleQrModal';

export default function VehicleTable({ vehicles, onViewClick, onDeleteClick, onQrClick }) {
  const [internalQrVehicle, setInternalQrVehicle] = useState(null);

  const handleOpenQr = (v) => {
    if (onQrClick) {
      onQrClick(v);
    } else {
      setInternalQrVehicle(v);
    }
  };

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="empty-state" style={{ margin: '2rem' }}>
        <div style={{ display: 'inline-flex', padding: '1.25rem', background: 'var(--surface-inset)', borderRadius: '50%', marginBottom: '1.25rem', width: '80px', height: '80px', alignItems: 'center', justifyContent: 'center' }}>
          <AdminIcon name="vehicles" style={{ width: '100%', height: '100%', color: 'var(--text-muted)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          No approved vehicles available.
        </h3>
        <p>Vehicles appear here only after a registration has been approved.</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
          <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary">New Registration</Link>
          <Link href="/vehicles/registrations?status=Pending" className="admin-btn admin-btn--ghost">View Pending</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-table-container" style={{ overflowX: 'auto' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .vehicle-mobile-layout { display: none; }
        .vehicle-desktop-layout { display: block; }
        
        @media (max-width: 768px) {
          .vehicle-desktop-layout { display: none !important; }
          .vehicle-mobile-layout { 
            display: grid !important; 
            grid-template-columns: 1fr !important; 
            gap: 0.65rem !important; 
            padding: 0.65rem !important; 
            width: 100% !important; 
            box-sizing: border-box !important; 
          }
          
          .vehicle-card-sm {
            background: var(--surface-base);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
            transition: transform 0.15s ease;
          }
          .vehicle-card-sm:active {
            transform: scale(0.99);
          }
        }
      `}} />

      {/* Internal QR Modal if triggered locally */}
      {internalQrVehicle && (
        <VehicleQrModal vehicle={internalQrVehicle} onClose={() => setInternalQrVehicle(null)} />
      )}
      
      {/* --- DESKTOP TABLE LAYOUT --- */}
      <div className="vehicle-desktop-layout">
        <table className="admin-table" style={{ tableLayout: 'fixed', width: '100%', whiteSpace: 'normal', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              <th style={{ width: '22%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>VEHICLE NUMBER</th>
              <th style={{ width: '15%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>TYPE</th>
              <th style={{ width: '24%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>ACTIVITY</th>
              <th style={{ width: '12%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>STATUS</th>
              <th style={{ width: '13%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>REG DATE</th>
              <th style={{ width: '14%', padding: '0.75rem 0.6rem', textTransform: 'uppercase', fontSize: '13px', fontWeight: '700', textAlign: 'right', color: 'var(--text-primary)' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v._id} className="admin-table-row" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1.05rem', padding: '0.75rem 0.6rem', color: 'var(--text-primary)' }}>
                  {v.plateNumber}
                </td>
                <td style={{ fontWeight: 600, padding: '0.75rem 0.6rem', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {v.typeId?.name || '-'}
                </td>
                <td style={{ padding: '0.75rem 0.6rem', fontSize: '0.95rem' }}>
                  {v.activeMovement ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', backgroundColor: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-muted)' }}></span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.activeMovement.status === 'Inside' ? 'Inside' : 'Outside'} {v.activeMovement.departmentId?.name}</span>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Entered by System
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted" style={{ fontSize: '0.85rem' }}>No Activity Found</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 0.6rem' }}>
                  <VehicleStatusBadge status={v.status} />
                </td>
                <td style={{ padding: '0.75rem 0.6rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.9rem' }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                    <button 
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '11px', fontWeight: 600, borderRadius: '5px' }}
                      onClick={(e) => { e.stopPropagation(); onViewClick(v); }}
                    >
                      View
                    </button>
                    <button 
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '11px', fontWeight: 600, borderRadius: '5px' }}
                      onClick={(e) => { e.stopPropagation(); handleOpenQr(v); }}
                      title="Show QR Code"
                    >
                      QR
                    </button>
                    <button 
                      type="button"
                      className="admin-btn admin-btn--danger"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '11px', fontWeight: 600, borderRadius: '5px' }}
                      onClick={(e) => { e.stopPropagation(); onDeleteClick(v); }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MOBILE RESPONSIVE CARDS --- */}
      <div className="vehicle-mobile-layout">
        {vehicles.map(v => (
          <div key={`mob-${v._id}`} className="vehicle-card-sm" onClick={() => onViewClick(v)}>
            
            {/* Split Top Section: Left Half Image + Right Side Details (No, Type, Activity, Reg Date) */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
              
              {/* LEFT HALF: Image Thumbnail */}
              <div style={{ width: '82px', minHeight: '82px', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface-sunken)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {v.metadata?.photos?.front ? (
                  <img src={resolvePhotoUrl(v.metadata.photos.front)} alt="Vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <AdminIcon name="vehicles" style={{ width: '32px', height: '32px', color: 'var(--text-muted)' }} />
                )}
              </div>

              {/* RIGHT SIDE OF IMAGE: No., Type, Activity, Reg Date */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'center' }}>
                
                {/* 1. Vehicle No & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {v.plateNumber}
                  </div>
                  <VehicleStatusBadge status={v.status} />
                </div>

                {/* 2. Type */}
                <div style={{ fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Type:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.typeId?.name || 'Unclassified'}
                  </span>
                </div>

                {/* 3. Activity */}
                <div style={{ fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Activity:</span>
                  {v.activeMovement ? (
                    <span style={{ fontWeight: 600, color: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.activeMovement.status === 'Inside' ? 'Inside' : 'Outside'} {v.activeMovement.departmentId?.name}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No Activity</span>
                  )}
                </div>

                {/* 4. Reg Date */}
                <div style={{ fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Reg Date:</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>

              </div>
            </div>

            {/* BOTTOM SECTION: Action Buttons full width */}
            <div style={{ display: 'flex', gap: '0.4rem', width: '100%', paddingTop: '0.45rem', borderTop: '1px solid var(--border-color)' }}>
              <button 
                type="button" 
                className="admin-btn admin-btn--primary"
                style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '11px', fontWeight: 600, borderRadius: '6px', textAlign: 'center', justifyContent: 'center' }}
                onClick={(e) => { e.stopPropagation(); onViewClick(v); }}
              >
                View Details
              </button>
              <button 
                type="button" 
                className="admin-btn admin-btn--secondary"
                style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '11px', fontWeight: 600, borderRadius: '6px', textAlign: 'center', justifyContent: 'center' }}
                onClick={(e) => { e.stopPropagation(); handleOpenQr(v); }}
              >
                QR Pass
              </button>
              <button 
                type="button" 
                className="admin-btn admin-btn--danger"
                style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '11px', fontWeight: 600, borderRadius: '6px', textAlign: 'center', justifyContent: 'center' }}
                onClick={(e) => { e.stopPropagation(); onDeleteClick(v); }}
              >
                Delete
              </button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
