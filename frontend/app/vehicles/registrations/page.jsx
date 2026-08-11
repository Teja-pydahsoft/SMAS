"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import PageShell from '@/components/PageShell';
import AdminIcon from '@/components/admin/AdminIcons';

export default function VehicleRegistrationsPage() {
  const router = useRouter();
  
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [filters, setFilters] = useState({
    plateNumber: '',
    equipmentName: '',
    vehicleType: '',
    status: 'All', // All, Pending, Approved, Rejected
    department: '',
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchRegistrations = () => {
    setLoading(true);
    setError(null);
    api.vehicles.registrations.list({}) // Fetch all, we'll filter on client
      .then(data => {
        setRegistrations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to fetch registrations');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  // Compute KPIs
  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    return registrations.reduce((acc, r) => {
      if (r.status === 'Pending') acc.pending++;
      
      const isToday = new Date(r.createdAt).toDateString() === today;
      if (isToday) {
        acc.todayRequests++;
        if (r.status === 'Approved') acc.approvedToday++;
        if (r.status === 'Rejected') acc.rejectedToday++;
      }
      return acc;
    }, { pending: 0, approvedToday: 0, rejectedToday: 0, todayRequests: 0 });
  }, [registrations]);

  // Client-side Filtering
  const filteredRegistrations = useMemo(() => {
    return registrations.filter(r => {
      const matchPlate = !filters.plateNumber || (r.plateNumber || '').toLowerCase().includes(filters.plateNumber.toLowerCase());
      const matchEquip = !filters.equipmentName || (r.data?.equipmentName || '').toLowerCase().includes(filters.equipmentName.toLowerCase());
      const matchType = !filters.vehicleType || (r.data?.vehicleType || '').toLowerCase().includes(filters.vehicleType.toLowerCase());
      const matchDept = !filters.department || (r.data?.departmentId || '').toLowerCase().includes(filters.department.toLowerCase());
      const matchStatus = filters.status === 'All' || r.status === filters.status;
      
      return matchPlate && matchEquip && matchType && matchDept && matchStatus;
    });
  }, [registrations, filters]);

  // Pagination
  const totalItems = filteredRegistrations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  // Reset current page if filters change and out of bounds
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const currentData = filteredRegistrations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetFilters = () => {
    setFilters({
      plateNumber: '',
      equipmentName: '',
      vehicleType: '',
      status: 'All',
      department: '',
    });
    setCurrentPage(1);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved': return 'success';
      case 'Pending': return 'warning';
      case 'Rejected': return 'danger';
      default: return 'secondary';
    }
  };

  const getOcrBadgeInfo = (conf, validationStatus) => {
    if (validationStatus === 'success' || validationStatus === 'Valid') return { color: 'success', text: 'Success' };
    if (conf >= 90) return { color: 'success', text: 'Success' };
    if (conf >= 70) return { color: 'warning', text: 'Low Confidence' };
    if (conf > 0) return { color: 'danger', text: 'OCR Failed' };
    return { color: 'secondary', text: 'Unknown' };
  };

  const handleAction = async (e, id, actionType) => {
    e.stopPropagation();
    if (actionType === 'view') {
      router.push(`/vehicles/registrations/${id}`);
    } else if (actionType === 'approve' || actionType === 'reject') {
       // Ideally we would trigger a quick approval/rejection modal here
       // For now, redirect to the details page to complete the workflow
       router.push(`/vehicles/registrations/${id}`);
    } else if (actionType === 'delete') {
       if (window.confirm('Are you sure you want to delete this registration? This cannot be undone.')) {
         try {
           await api.vehicles.registrations.delete(id);
           setRegistrations(prev => prev.filter(r => r._id !== id));
         } catch (err) {
           console.error('Failed to delete registration:', err);
           alert(err.message || 'Failed to delete registration');
         }
       }
    }
  };

  const exportCSV = () => {
    const headers = ['Plate Number', 'Equipment Name', 'Vehicle Type', 'Department', 'Status', 'Submitted Date', 'OCR Confidence'];
    const csvContent = [
      headers.join(','),
      ...filteredRegistrations.map(r => [
        `"${r.plateNumber || ''}"`,
        `"${r.data?.equipmentName || ''}"`,
        `"${r.data?.vehicleType || ''}"`,
        `"${r.data?.departmentId || ''}"`,
        `"${r.status || ''}"`,
        `"${new Date(r.createdAt).toLocaleString()}"`,
        `"${r.aiEnrollmentData?.confidence?.ocr || 0}%"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `registrations_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <PageShell 
      title="Vehicle Registrations" 
      description="Manage all equipment registrations and approvals."
      toolbar={
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="admin-btn admin-btn--ghost" onClick={fetchRegistrations}>
            <AdminIcon name="refresh" /> Refresh
          </button>
          <button className="admin-btn admin-btn--secondary" onClick={exportCSV}>
            <AdminIcon name="download" /> Export CSV
          </button>
          <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary">
            <AdminIcon name="plus" /> New Registration
          </Link>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }} className="admin-fade-in">
        
        {/* SUMMARY CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Pending Registrations</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning)' }}>{kpis.pending}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Approved Today</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{kpis.approvedToday}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Rejected Today</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>{kpis.rejectedToday}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Today's Requests</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{kpis.todayRequests}</span>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="admin-panel glass-panel" style={{ position: 'sticky', top: '1rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter Registrations</h3>
            <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={resetFilters}>Reset Filters</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="admin-form-group" style={{ margin: 0 }}>
              <input type="text" className="admin-input" placeholder="Search Plate Number..." value={filters.plateNumber} onChange={e => setFilters({...filters, plateNumber: e.target.value})} />
            </div>
            <div className="admin-form-group" style={{ margin: 0 }}>
              <input type="text" className="admin-input" placeholder="Search Equipment..." value={filters.equipmentName} onChange={e => setFilters({...filters, equipmentName: e.target.value})} />
            </div>
            <div className="admin-form-group" style={{ margin: 0 }}>
              <input type="text" className="admin-input" placeholder="Search Vehicle Type..." value={filters.vehicleType} onChange={e => setFilters({...filters, vehicleType: e.target.value})} />
            </div>
            <div className="admin-form-group" style={{ margin: 0 }}>
              <input type="text" className="admin-input" placeholder="Search Department..." value={filters.department} onChange={e => setFilters({...filters, department: e.target.value})} />
            </div>
            <div className="admin-form-group" style={{ margin: 0 }}>
              <select className="admin-input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* DATA GRID */}
        <div className="admin-panel glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
              <div className="dash-loading__spinner"></div>
            </div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
          ) : currentData.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--surface-sunken)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <AdminIcon name="document" size={32} />
                </div>
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No vehicle registrations found</h3>
              <p className="text-muted" style={{ marginBottom: '2rem' }}>Adjust your filters or create a new registration request.</p>
              <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary">
                <AdminIcon name="plus" /> New Registration
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Image</th>
                    <th>Plate Number</th>
                    <th>Vehicle Details</th>
                    <th>OCR Status</th>
                    <th>Submitted Date</th>
                    <th>Current Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map(r => {
                    const thumb = r.photos?.frontPlate || r.photos?.front;
                    const ocrBadge = getOcrBadgeInfo(r.aiEnrollmentData?.confidence?.ocr || 0, r.aiEnrollmentData?.validationStatus);
                    
                    return (
                      <tr key={r._id} onClick={() => router.push(`/vehicles/registrations/${r._id}`)} style={{ cursor: 'pointer' }}>
                        <td>
                          {thumb ? (
                            <div style={{ width: '48px', height: '36px', backgroundColor: 'var(--surface-sunken)', borderRadius: '4px', overflow: 'hidden' }}>
                              <img src={thumb.startsWith('http') ? resolvePhotoUrl(thumb) : resolvePhotoUrl(`/uploads/vehicles/${thumb}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Vehicle Thumbnail" onError={(e) => e.target.style.display='none'} />
                            </div>
                          ) : (
                            <div style={{ width: '48px', height: '36px', backgroundColor: 'var(--surface-sunken)', borderRadius: '4px' }}></div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1rem', textTransform: 'uppercase' }}>
                            {r.plateNumber || 'UNKNOWN'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{r.data?.equipmentName || 'N/A'}</div>
                          <div className="text-muted" style={{ fontSize: '0.875rem' }}>{r.data?.vehicleType || 'Unknown Type'}</div>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--${ocrBadge.color}`}>
                            {ocrBadge.text}
                          </span>
                        </td>
                        <td>
                          <div>{new Date(r.createdAt).toLocaleDateString()}</div>
                          <div className="text-muted" style={{ fontSize: '0.875rem' }}>{new Date(r.createdAt).toLocaleTimeString()}</div>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--${getStatusBadge(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={(e) => handleAction(e, r._id, 'view')}>
                              View
                            </button>
                            {r.status === 'Pending' && (
                              <>
                                <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={(e) => handleAction(e, r._id, 'approve')}>
                                  Approve
                                </button>
                                <button className="admin-btn admin-btn--sm admin-btn--danger" onClick={(e) => handleAction(e, r._id, 'reject')}>
                                  Reject
                                </button>
                              </>
                            )}
                            <button className="admin-btn admin-btn--sm admin-btn--danger admin-btn--ghost" onClick={(e) => handleAction(e, r._id, 'delete')}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINATION */}
          {currentData.length > 0 && (
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-base)' }}>
              <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> entries
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="text-muted" style={{ fontSize: '0.875rem' }}>Rows per page:</span>
                  <select 
                    className="admin-input" 
                    style={{ padding: '0.25rem 0.5rem', width: 'auto', minHeight: 'auto' }}
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button 
                    className="admin-btn admin-btn--sm admin-btn--ghost" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: 'bold' }}>
                    {currentPage} / {totalPages}
                  </div>
                  <button 
                    className="admin-btn admin-btn--sm admin-btn--ghost" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
