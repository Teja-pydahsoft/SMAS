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
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // QR Modal and Printing State
  const [selectedRegForQr, setSelectedRegForQr] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const openQrModal = async (registration) => {
    setSelectedRegForQr(registration);
    setQrDataUrl(null);
    setLoadingQr(true);
    try {
      const data = await api.vehicles.registrations.qr(registration._id);
      if (data && data.qrDataUrl) {
        setQrDataUrl(data.qrDataUrl);
      }
    } catch (err) {
      console.error('Failed to load QR code:', err);
      alert('Failed to load QR code');
    } finally {
      setLoadingQr(false);
    }
  };

  const closeQrModal = () => {
    setSelectedRegForQr(null);
    setQrDataUrl(null);
  };

  const handlePrintQr = (registration, qrUrl) => {
    if (!qrUrl) return;

    const printRootId = 'pass-print-root';
    let printRoot = document.getElementById(printRootId);
    if (printRoot) printRoot.remove();

    printRoot = document.createElement('div');
    printRoot.id = printRootId;
    printRoot.setAttribute('aria-hidden', 'true');

    printRoot.innerHTML = `
      <div class="vehicle-qr-print-page">
        <div class="vehicle-qr-print-top">
          <h1 class="vehicle-qr-print-header-text">SMAS VEHICLE PASS</h1>
          <div class="vehicle-qr-print-code-container">
            <img src="${qrUrl}" class="vehicle-qr-print-img" alt="QR Code" />
          </div>
          <p class="vehicle-qr-print-hint">SCAN AT GATE FOR ACCESS</p>
        </div>
        <div class="vehicle-qr-print-bottom">
          <div class="vehicle-qr-print-plate">${registration.plateNumber || 'UNKNOWN'}</div>
          <div class="vehicle-qr-print-grid">
            <div class="vehicle-qr-print-field">
              <span class="label">EQUIPMENT:</span>
              <span class="value">${registration.data?.equipmentName || 'N/A'}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">VEHICLE TYPE:</span>
              <span class="value">${registration.data?.vehicleType || 'Unknown'}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">DEPARTMENT:</span>
              <span class="value">${registration.data?.departmentId ? 'Assigned Department' : 'General'}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">STATUS:</span>
              <span class="value">${registration.status || 'Active'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(printRoot);

    const styleId = 'vehicle-qr-print-style';
    let styleTag = document.getElementById(styleId);
    if (styleTag) styleTag.remove();

    styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = `
      #pass-print-root {
        display: none;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body > *:not(#pass-print-root) {
          display: none !important;
        }
        #pass-print-root {
          display: block !important;
          width: 210mm;
          height: 297mm;
          box-sizing: border-box;
          padding: 10mm;
        }
        .vehicle-qr-print-page {
          width: 190mm;
          height: 277mm;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .vehicle-qr-print-top {
          flex: 3;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          border: 3pt solid #000;
          border-bottom: none;
          padding: 12mm;
          box-sizing: border-box;
        }
        .vehicle-qr-print-header-text {
          font-size: 28pt;
          font-weight: 850;
          letter-spacing: 2px;
          margin: 0 0 5mm 0;
          text-align: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .vehicle-qr-print-code-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
        }
        .vehicle-qr-print-img {
          width: 140mm;
          height: 140mm;
          object-fit: contain;
        }
        .vehicle-qr-print-hint {
          font-size: 14pt;
          font-weight: 700;
          letter-spacing: 1.5px;
          margin: 5mm 0 0 0;
          color: #475569;
          text-align: center;
        }
        .vehicle-qr-print-bottom {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 3pt solid #000;
          border-top: 3pt dashed #000;
          padding: 8mm;
          box-sizing: border-box;
          background: #fff;
        }
        .vehicle-qr-print-plate {
          font-size: 36pt;
          font-weight: 900;
          font-family: monospace;
          letter-spacing: 3px;
          text-transform: uppercase;
          border: 3.5pt solid #000;
          padding: 2mm 8mm;
          border-radius: 4mm;
          margin-bottom: 6mm;
          background: #f8fafc;
          text-align: center;
        }
        .vehicle-qr-print-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4mm 10mm;
          width: 100%;
          padding: 0 5mm;
          box-sizing: border-box;
        }
        .vehicle-qr-print-field {
          display: flex;
          flex-direction: column;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .vehicle-qr-print-field .label {
          font-size: 9pt;
          font-weight: 750;
          color: #475569;
          margin-bottom: 1mm;
          text-transform: uppercase;
        }
        .vehicle-qr-print-field .value {
          font-size: 14pt;
          font-weight: 800;
          color: #0f172a;
        }
      }
    `;

    document.head.appendChild(styleTag);
    document.body.classList.add('pass-printing');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('pass-printing');
      printRoot.remove();
      styleTag.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60_000);
    window.print();
  };

  // Filter state
  const [filters, setFilters] = useState({
    plateNumber: '',
    equipmentName: '',
    vehicleType: '',
    status: 'All', // All, Pending, Approved, Rejected
  });

  const [showFilters, setShowFilters] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchRegistrations = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.vehicles.registrations.list({}),
      api.vehicles.summary().catch(() => null),
    ])
      .then(([data, summaryData]) => {
        setRegistrations(Array.isArray(data) ? data : []);
        setSummary(summaryData);
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
    return registrations.reduce((acc, r) => {
      acc.totalRequests++;
      if (r.status === 'Pending') acc.pending++;
      if (r.status === 'Approved') acc.totalApproved++;
      if (r.status === 'Rejected') acc.totalRejected++;
      return acc;
    }, { pending: 0, totalApproved: 0, totalRejected: 0, totalRequests: 0 });
  }, [registrations]);

  // Client-side Filtering
  const filteredRegistrations = useMemo(() => {
    return registrations.filter(r => {
      const matchPlate = !filters.plateNumber || (r.plateNumber || '').toLowerCase().includes(filters.plateNumber.toLowerCase());
      const matchEquip = !filters.equipmentName || (r.data?.equipmentName || '').toLowerCase().includes(filters.equipmentName.toLowerCase());
      const matchType = !filters.vehicleType || (r.data?.vehicleType || '').toLowerCase().includes(filters.vehicleType.toLowerCase());
      const matchStatus = filters.status === 'All' || r.status === filters.status;
      
      return matchPlate && matchEquip && matchType && matchStatus;
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
      status: 'All'
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
       const reg = registrations.find((item) => item._id === id);
       const willRemoveFleet = reg?.status === 'Approved';
       const confirmMsg = willRemoveFleet
         ? 'Delete this approved registration? The vehicle will also be removed from Vehicle Master.'
         : 'Are you sure you want to delete this registration? This cannot be undone.';
       if (window.confirm(confirmMsg)) {
         try {
           await api.vehicles.registrations.delete(id);
           fetchRegistrations();
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
        <div className="reg-toolbar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className={`admin-btn admin-btn--sm ${showFilters ? 'admin-btn--primary' : 'admin-btn--ghost'}`} onClick={() => setShowFilters(!showFilters)}>
            <AdminIcon name="filter" /> Filters
          </button>
          <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={fetchRegistrations}>
            <AdminIcon name="refresh" /> Refresh
          </button>
          <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={exportCSV}>
            <AdminIcon name="download" /> Export
          </button>
          <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--sm admin-btn--primary">
            <AdminIcon name="plus" /> New
          </Link>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }} className="admin-fade-in">
        
        <style dangerouslySetInnerHTML={{__html: `
          .registration-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; }
          .reg-desktop-table { display: block; }
          .reg-mobile-grid { display: none; }
          @media (max-width: 768px) {
            .reg-toolbar { flex-wrap: nowrap !important; overflow-x: auto !important; padding-bottom: 4px; scrollbar-width: none; }
            .reg-toolbar::-webkit-scrollbar { display: none; }
            
            .registration-stats-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
            .registration-stats-grid .admin-panel { padding: 0.75rem !important; }
            .registration-stats-grid .admin-panel span:first-child { font-size: 0.65rem !important; }
            .registration-stats-grid .admin-panel span:last-child { font-size: 1.5rem !important; }
            
            .reg-filter-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
            
            .reg-desktop-table { display: none !important; }
            .reg-mobile-grid { display: flex !important; flex-direction: column; gap: 8px; }
            .reg-mobile-card {
              background: var(--surface-base);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              padding: 8px;
              display: flex;
              flex-direction: row;
              gap: 12px;
              position: relative;
              align-items: center;
            }
            .reg-mobile-thumb-container {
              width: 80px; height: 80px; flex-shrink: 0; position: relative;
            }
            .reg-mobile-thumb { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: var(--surface-sunken); }
            .reg-mobile-plate { font-weight: bold; font-family: monospace; font-size: 1rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
            .reg-mobile-type { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            
            .reg-pagination { flex-direction: row !important; justify-content: center !important; padding: 12px !important; }
            .reg-pagination .hide-on-mobile { display: none !important; }
          }
        `}} />
        
        {/* SUMMARY CARDS */}
        {summary && !summary.isSynced && (
          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#92400e' }}>
            Vehicle Master has <strong>{summary.fleetCount}</strong> vehicles but this page shows <strong>{summary.registrationTotal}</strong> registration records.
            {summary.fleetWithoutRegistration > 0 && (
              <> {summary.fleetWithoutRegistration} vehicle(s) in master have no registration record{summary.orphanFleetPlates?.length ? `: ${summary.orphanFleetPlates.join(', ')}` : ''}.</>
            )}
            {summary.registrationNotInFleet > 0 && (
              <> {summary.registrationNotInFleet} registration(s) are not currently in Vehicle Master.</>
            )}
          </div>
        )}

        <div className="registration-stats-grid">
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>In Vehicle Master</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{summary?.fleetCount ?? '—'}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Pending Registrations</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning)' }}>{kpis.pending}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Total Approved</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{kpis.totalApproved}</span>
          </div>
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <span className="text-muted" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>Total Requests</span>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{kpis.totalRequests}</span>
          </div>
        </div>

        {/* FILTER BAR (Toggled on Mobile, Always on Desktop) */}
        <div className={`admin-panel glass-panel ${!showFilters ? 'hide-on-mobile' : ''}`} style={{ position: 'sticky', top: '1rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter Registrations</h3>
            <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={resetFilters}>Reset Filters</button>
          </div>
          <div className="reg-filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
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
            <>
            <div className="reg-desktop-table" style={{ overflowX: 'auto' }}>
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
                            <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={(e) => { e.stopPropagation(); openQrModal(r); }}>
                              QR Code
                            </button>
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
            
            {/* MOBILE CARD GRID */}
            <div className="reg-mobile-grid">
              {currentData.map(r => {
                const thumb = r.photos?.frontPlate || r.photos?.front;
                const ocrBadge = getOcrBadgeInfo(r.aiEnrollmentData?.confidence?.ocr || 0, r.aiEnrollmentData?.validationStatus);
                return (
                  <div key={r._id} className="reg-mobile-card" onClick={() => router.push(`/vehicles/registrations/${r._id}`)}>
                    <div className="reg-mobile-thumb-container">
                      {thumb ? (
                        <img src={thumb.startsWith('http') ? resolvePhotoUrl(thumb) : resolvePhotoUrl(`/uploads/vehicles/${thumb}`)} className="reg-mobile-thumb" alt="Vehicle" onError={(e) => e.target.style.display='none'} />
                      ) : (
                        <div className="reg-mobile-thumb" />
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                        <div className="reg-mobile-plate">{r.plateNumber || 'UNKNOWN'}</div>
                        <span className={`admin-badge admin-badge--${getStatusBadge(r.status)}`} style={{ fontSize: '0.65rem', padding: '2px 4px' }}>
                          {r.status}
                        </span>
                      </div>
                      <div className="reg-mobile-type">{r.data?.equipmentName || 'N/A'}</div>
                      <div className="reg-mobile-type" style={{ marginBottom: '4px' }}>{r.data?.vehicleType || 'Unknown Type'}</div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span className={`admin-badge admin-badge--${ocrBadge.color}`} style={{ fontSize: '0.65rem', padding: '2px 4px' }}>{ocrBadge.text}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button 
                            className="admin-btn admin-btn--sm admin-btn--secondary" 
                            style={{ padding: '2px 6px', fontSize: '10px', height: 'auto', minHeight: 'auto' }}
                            onClick={(e) => { e.stopPropagation(); openQrModal(r); }}
                          >
                            QR
                          </button>
                          <span className="text-muted" style={{ fontSize: '0.65rem' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}

          {/* PAGINATION */}
          {totalItems > pageSize && (
            <div className="reg-pagination" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-base)' }}>
              <div className="text-muted hide-on-mobile" style={{ fontSize: '0.875rem' }}>
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> entries
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

      {/* QR Code Modal */}
      {selectedRegForQr && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="admin-panel glass-panel admin-fade-in" style={{ width: '100%', maxWidth: '450px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <button 
              onClick={closeQrModal}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              aria-label="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', textAlign: 'center', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Vehicle Pass QR Code
            </h3>

            {loadingQr ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '240px' }}>
                <div className="dash-loading__spinner"></div>
              </div>
            ) : qrDataUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{ border: '2px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#fff', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <img src={qrDataUrl} alt="Vehicle QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
                </div>
                
                <div style={{ width: '100%', backgroundColor: 'var(--surface-sunken)', borderRadius: '8px', padding: '1rem', marginBottom: '2rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600' }}>Plate Number</span>
                    <strong style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{selectedRegForQr.plateNumber}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600' }}>Equipment</span>
                    <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>{selectedRegForQr.data?.equipmentName || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '600' }}>Vehicle Type</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>{selectedRegForQr.data?.vehicleType || 'Unknown'}</span>
                  </div>
                </div>

                <button 
                  className="admin-btn admin-btn--primary" 
                  onClick={() => handlePrintQr(selectedRegForQr, qrDataUrl)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '42px' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                  Print QR Code Pass (A4)
                </button>
              </div>
            ) : (
              <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center' }}>
                Failed to generate QR Code.
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
