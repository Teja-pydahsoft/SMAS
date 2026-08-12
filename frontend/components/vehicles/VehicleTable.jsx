import React from 'react';
import VehicleStatusBadge from './VehicleStatusBadge';
import Link from 'next/link';
import AdminIcon from '@/components/admin/AdminIcons';
import { resolvePhotoUrl } from '@/lib/photoUrl';

export default function VehicleTable({ vehicles, onViewClick, onDeleteClick }) {
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
    <div className="admin-table-container" style={{ overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .vehicle-mobile-layout { display: none; }
        .vehicle-desktop-layout { display: block; }
        
        @media (max-width: 768px) {
          .vehicle-desktop-layout { display: none !important; }
          .vehicle-mobile-layout { display: flex !important; flex-direction: column !important; width: 100%; overflow-x: hidden; }
          .vehicle-mobile-row { display: flex !important; flex-direction: row !important; align-items: center !important; padding: 0.5rem 0.25rem !important; border-bottom: 1px solid var(--border-color) !important; width: 100% !important; box-sizing: border-box !important; gap: 6px; }
          .vehicle-mobile-header { display: flex !important; flex-direction: row !important; padding: 0.5rem 0.25rem !important; border-bottom: 1px solid var(--border-color) !important; color: var(--text-secondary) !important; font-weight: 700 !important; width: 100% !important; font-size: 9px !important; text-transform: uppercase; box-sizing: border-box !important; gap: 6px; }
          
          .v-col-1 { display: block !important; width: 40px !important; flex-shrink: 0 !important; text-align: center; }
          .v-col-2 { display: block !important; width: 75px !important; flex-shrink: 0 !important; font-size: 10px !important; word-break: break-all !important; line-height: 1.2; }
          .v-col-3 { display: block !important; width: 50px !important; flex-shrink: 0 !important; font-size: 10px !important; word-break: break-word !important; line-height: 1.2; }
          .v-col-4 { display: flex !important; flex: 1 !important; min-width: 0 !important; font-size: 10px !important; flex-direction: column; gap: 2px; overflow: hidden; line-height: 1.2; }
          
          .vehicle-mobile-img { width: 40px !important; height: 40px !important; border-radius: 6px; overflow: hidden; background: var(--surface-inset); display: flex; align-items: center; justify-content: center; }
        }
      `}} />
      
      {/* --- DESKTOP LAYOUT --- */}
      <div className="vehicle-desktop-layout">
        <table className="admin-table" style={{ tableLayout: 'fixed', width: '100%', whiteSpace: 'normal' }}>
          <thead>
            <tr>
              <th style={{ width: '20%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>VEHICLE NUMBER</th>
              <th style={{ width: '15%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>TYPE</th>
              <th style={{ width: '25%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>ACTIVITY</th>
              <th style={{ width: '10%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>STATUS</th>
              <th style={{ width: '15%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>REGISTRATION DATE</th>
              <th style={{ width: '15%', padding: '0.75rem 1rem', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v._id} className="admin-table-row">
                <td style={{ fontWeight: 600, fontFamily: 'monospace', padding: '1rem' }}>
                  {v.plateNumber}
                </td>
                <td className="text-muted" style={{ padding: '1rem' }}>
                  {v.typeId?.name || '-'}
                </td>
                <td style={{ padding: '1rem' }}>
                  {v.activeMovement ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', backgroundColor: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-muted)' }}></span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.activeMovement.status === 'Inside' ? 'Inside' : 'Outside'} {v.activeMovement.departmentId?.name}</span>
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        Entered by System
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted">No Activity Found</span>
                  )}
                </td>
                <td style={{ padding: '1rem' }}>
                  {v.status || 'Active'}
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button 
                      type="button"
                      className="admin-btn"
                      style={{ padding: '0.3rem 0.75rem', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '20px', background: 'transparent' }}
                      onClick={(e) => { e.stopPropagation(); onViewClick(v); }}
                    >
                      View Details
                    </button>
                    <button 
                      type="button"
                      className="admin-btn"
                      style={{ padding: '0.3rem 0.75rem', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '20px', background: 'transparent' }}
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

      {/* --- MOBILE LAYOUT --- */}
      <div className="vehicle-mobile-layout">
        <div className="vehicle-mobile-header">
          <div className="v-col-1">PHOTO</div>
          <div className="v-col-2">VEHICLE</div>
          <div className="v-col-3">TYPE</div>
          <div className="v-col-4">ACTIVITY</div>
        </div>
        
        {vehicles.map(v => (
          <div key={`mob-${v._id}`} className="vehicle-mobile-row admin-hover-lift" onClick={() => onViewClick(v)}>
            <div className="v-col-1">
              <div className="vehicle-mobile-img">
                {v.metadata?.photos?.front ? (
                  <img src={resolvePhotoUrl(v.metadata.photos.front)} alt="Vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <AdminIcon name="vehicles" style={{ width: '20px', height: '20px', color: 'var(--text-muted)' }} />
                )}
              </div>
            </div>
            
            <div className="v-col-2" style={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {v.plateNumber}
            </div>
            
            <div className="v-col-3" style={{ color: 'var(--text-muted)' }}>
              {v.typeId?.name || '-'}
            </div>

            <div className="v-col-4">
              {v.activeMovement ? (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', backgroundColor: v.activeMovement.status === 'Inside' ? 'var(--success)' : 'var(--text-muted)' }}></span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.activeMovement.status === 'Inside' ? 'IN:' : 'OUT:'} {v.activeMovement.departmentId?.name?.substring(0,8)}</span>
                  </span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {new Date(v.activeMovement.inTime || v.activeMovement.createdAt).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})} {new Date(v.activeMovement.inTime || v.activeMovement.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </>
              ) : (
                <span className="text-muted" style={{ fontSize: '10px' }}>No Activity</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
