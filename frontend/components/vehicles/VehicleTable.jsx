import React from 'react';
import VehicleStatusBadge from './VehicleStatusBadge';
import Link from 'next/link';
import AdminIcon from '@/components/admin/AdminIcons';

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
    <div className="admin-table-container">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Vehicle Number</th>
            <th>Type</th>
            <th>Activity</th>
            <th>Status</th>
            <th>Registration Date</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map(v => (
            <tr key={v._id} className="admin-table-row" onClick={() => onViewClick(v)}>
              <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.plateNumber}</td>
              <td className="text-muted">{v.typeId?.name || '-'}</td>
              <td>
                {v.activeMovement ? (
                  v.activeMovement.status === 'Inside' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success)', fontWeight: 500, fontSize: '0.8125rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)' }}></span>
                        Inside {v.activeMovement.departmentId?.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Entered by {v.activeMovement.enteredBy?.name || 'System'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8125rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-muted)' }}></span>
                        Exited {v.activeMovement.departmentId?.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Exited by {v.activeMovement.exitedBy?.name || 'System'}
                      </span>
                    </div>
                  )
                ) : (
                  <span className="text-muted" style={{ fontSize: '0.8125rem' }}>No Activity Found</span>
                )}
              </td>
              <td><VehicleStatusBadge status={v.status} /></td>
              <td className="text-muted">{new Date(v.createdAt).toLocaleDateString()}</td>
              <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button 
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={(e) => { e.stopPropagation(); onViewClick(v); }}
                >
                  View Details
                </button>
                {onDeleteClick && (
                  <button 
                    className="admin-btn admin-btn--danger admin-btn--ghost admin-btn--sm"
                    onClick={(e) => { e.stopPropagation(); onDeleteClick(v); }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
