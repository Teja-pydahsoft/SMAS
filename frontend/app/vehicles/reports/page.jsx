"use client";

import React, { useState, useEffect, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import AdminIcon from '@/components/admin/AdminIcons';
import { resolvePhotoUrl } from '@/lib/photoUrl';

function exportToCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k];
        cell = cell instanceof Date ? cell.toLocaleString() : cell.toString().replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export default function VehicleReportsPage() {
  const [activeTab, setActiveTab] = useState('movements'); // 'movements' | 'registrations'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ total: 0, entries: 0, exits: 0, unique: 0 });
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [departments, setDepartments] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    plateNumber: '',
    direction: '',
    departmentId: '',
    status: '',
    from: '',
    to: ''
  });

  const fetchDropdowns = useCallback(async () => {
    try {
      const { api } = await import('@/lib/api/client');
      const [depts, types] = await Promise.all([
        api.departments.list().catch(() => []),
        api.vehicles.types.list().catch(() => [])
      ]);
      setDepartments(Array.isArray(depts) ? depts : []);
      setVehicleTypes(Array.isArray(types) ? types : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { api } = await import('@/lib/api/client');
      if (activeTab === 'movements') {
        const res = await api.vehicles.movements({ ...filters, page, limit: pagination.limit });
        setData(res.data || []);
        setPagination(p => ({ ...p, page: res.page, total: res.total }));
        
        // Calculate basic summary for current page
        const entries = (res.data || []).filter(d => d.status !== 'Exited').length;
        const exits = (res.data || []).filter(d => d.status === 'Exited').length;
        const unique = new Set((res.data || []).map(d => d.vehicleId?._id)).size;
        setSummary({ total: res.total, entries, exits, unique });

      } else {
        // Registrations
        const res = await api.vehicles.registrations.list({ ...filters, page, limit: pagination.limit });
        let rawData = Array.isArray(res) ? res : (res.data || []);
        
        // Backend GET / doesn't currently filter by plateNumber, so we filter on client
        if (filters.plateNumber) {
          const searchPlate = filters.plateNumber.toLowerCase().replace(/\s+/g, '');
          rawData = rawData.filter(r => (r.plateNumber || '').toLowerCase().replace(/\s+/g, '').includes(searchPlate));
        }

        setData(rawData);
        setPagination(p => ({ ...p, page: res.page || 1, total: res.total || rawData.length }));
        setSummary({ total: res.total || rawData.length, entries: 0, exits: 0, unique: res.total || rawData.length });
      }
    } catch (error) {
      console.error("Failed to fetch report data:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, pagination.limit]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchData(1);
  }, [activeTab, fetchData]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleApplyFilters = () => {
    fetchData(1);
  };

  const handleResetFilters = () => {
    setFilters({ plateNumber: '', direction: '', departmentId: '', status: '', from: '', to: '' });
    // setTimeout to allow state to settle before fetch
    setTimeout(() => fetchData(1), 0);
  };

  const handleExportCSV = () => {
    if (data.length === 0) return alert('No data to export');
    
    if (activeTab === 'movements') {
      const csvData = data.map(row => ({
        'Date': new Date(row.inTime).toLocaleDateString(),
        'Time': new Date(row.status === 'Exited' && row.outTime ? row.outTime : row.inTime).toLocaleTimeString(),
        'Plate Number': row.vehicleId?.plateNumber || 'Unknown',
        'Type': row.vehicleId?.typeId?.name || 'N/A',
        'Division': row.divisionId?.name || 'N/A',
        'Department': row.departmentId?.name || 'N/A',
        'Status': row.status
      }));
      exportToCSV(`vehicle_movements_${new Date().toISOString().slice(0,10)}.csv`, csvData);
    } else {
      const csvData = data.map(row => ({
        'Registration Date': new Date(row.createdAt).toLocaleDateString(),
        'Plate Number': row.plateNumber,
        'Owner/Vehicle Name': row.data?.equipmentName || row.ownerName || 'N/A',
        'Type': row.typeId?.name || 'Unknown',
        'Status': row.status,
      }));
      exportToCSV(`vehicle_registrations_${new Date().toISOString().slice(0,10)}.csv`, csvData);
    }
  };

  const headerActions = (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button className="admin-btn admin-btn--ghost" onClick={() => fetchData(1)} disabled={loading}>
        Refresh
      </button>
      <button className="admin-btn admin-btn--secondary" onClick={handleExportCSV} disabled={data.length === 0}>
        <AdminIcon name="reports" style={{ width: '16px', height: '16px', display: 'inline-block' }} /> Export CSV
      </button>
    </div>
  );

  return (
    <PageShell 
      title="Vehicle Reports" 
      description="Analyze vehicle registrations, movements and activity."
      headerActions={headerActions}
    >
      
      <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <nav style={{ display: 'flex', gap: '2rem', padding: '0 1.5rem' }}>
          <button 
            onClick={() => setActiveTab('movements')} 
            style={{
              padding: '0.75rem 0',
              borderBottom: activeTab === 'movements' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'movements' ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'movements' ? 600 : 500,
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            Movement Report
          </button>
          <button 
            onClick={() => setActiveTab('registrations')} 
            style={{
              padding: '0.75rem 0',
              borderBottom: activeTab === 'registrations' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'registrations' ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'registrations' ? 600 : 500,
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            Registration Report
          </button>
        </nav>
      </div>

      <div className="admin-dashboard">

        {/* SUMMARY CARDS */}
        <div className="admin-widgets-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-widget" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>TOTAL RECORDS</h3>
            <div className="admin-widget__value">{loading ? '-' : summary.total}</div>
            <div className="admin-widget__meta">Filtered results</div>
          </div>
          {activeTab === 'movements' && (
            <>
              <div className="admin-widget" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>ENTRIES (PAGE)</h3>
                <div className="admin-widget__value">{loading ? '-' : summary.entries}</div>
                <div className="admin-widget__meta">Vehicles entering</div>
              </div>
              <div className="admin-widget" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>EXITS (PAGE)</h3>
                <div className="admin-widget__value">{loading ? '-' : summary.exits}</div>
                <div className="admin-widget__meta">Vehicles exiting</div>
              </div>
              <div className="admin-widget" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>UNIQUE VEHICLES</h3>
                <div className="admin-widget__value">{loading ? '-' : summary.unique}</div>
                <div className="admin-widget__meta">Distinct plates</div>
              </div>
            </>
          )}
        </div>

        {/* FILTER BAR */}
        <div className="admin-panel" style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          
          {activeTab === 'movements' && (
            <>
              <div style={{ flex: '0 1 140px' }}>
                <input type="date" className="admin-input" name="from" value={filters.from} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }} title="From Date" />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <input type="date" className="admin-input" name="to" value={filters.to} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }} title="To Date" />
              </div>
            </>
          )}

          <div style={{ flex: '0 1 200px' }}>
            <input type="text" className="admin-input" placeholder="Plate Number" name="plateNumber" value={filters.plateNumber} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }} />
          </div>
          
          {activeTab === 'movements' && (
            <>
              <div style={{ flex: '0 1 160px' }}>
                <select className="admin-input" name="direction" value={filters.direction} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }}>
                  <option value="">All Directions</option>
                  <option value="Entry">Entry</option>
                  <option value="Exit">Exit</option>
                </select>
              </div>
              <div style={{ flex: '0 1 180px' }}>
                <select className="admin-input" name="departmentId" value={filters.departmentId} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }}>
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ flex: '0 1 160px' }}>
            <select className="admin-input" name="status" value={filters.status} onChange={handleFilterChange} style={{ width: '100%', height: '36px' }}>
              <option value="">All Statuses</option>
              {activeTab === 'movements' ? (
                <>
                  <option value="Inside">Inside</option>
                  <option value="Exited">Exited</option>
                </>
              ) : (
                <>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button className="admin-btn admin-btn--primary" onClick={handleApplyFilters} disabled={loading} style={{ height: '36px' }}>Apply</button>
            <button className="admin-btn admin-btn--ghost" onClick={handleResetFilters} disabled={loading} style={{ height: '36px' }}>Reset</button>
          </div>
        </div>

        {/* TABLE */}
        <div className="admin-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                {activeTab === 'movements' ? (
                  <tr>
                    <th>Date</th>
                    <th>Plate Number</th>
                    <th>Type</th>
                    <th>Division</th>
                    <th>Department</th>
                    <th>Entry Time</th>
                    <th>Exit Time</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Registration Date</th>
                    <th>Plate Number</th>
                    <th>Vehicle Name</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="admin-empty-note">Loading report data...</td></tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="admin-empty-note">
                        No vehicle {activeTab === 'movements' ? 'movements' : 'registrations'} found. <br />
                        <span style={{ fontSize: '0.8125rem' }}>Try changing your filters or date range.</span>
                      </div>
                    </td>
                  </tr>
                ) : activeTab === 'movements' ? (
                  data.map(row => (
                    <tr key={row._id} onClick={() => setSelectedMovement(row)} style={{ cursor: 'pointer' }} className="admin-table-row-hover">
                      <td>{new Date(row.inTime).toLocaleDateString()}</td>
                      <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{row.vehicleId?.plateNumber || 'Unknown'}</td>
                      <td>{row.vehicleId?.typeId?.name || 'N/A'}</td>
                      <td>{row.divisionId?.name || 'N/A'}</td>
                      <td>{row.departmentId?.name || 'N/A'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--success)', fontSize: '1.2rem', lineHeight: 1 }}>&rarr;</span>
                          {new Date(row.inTime).toLocaleTimeString()}
                        </div>
                      </td>
                      <td>
                        {row.outTime ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--danger)', fontSize: '1.2rem', lineHeight: 1 }}>&larr;</span>
                            {new Date(row.outTime).toLocaleTimeString()}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        {row.outTime ? (
                          <span style={{ fontSize: '0.875rem' }}>
                            {Math.round((new Date(row.outTime) - new Date(row.inTime)) / 60000)} mins
                          </span>
                        ) : (
                          <span className="text-muted">Active</span>
                        )}
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge--${row.status === 'Inside' ? 'success' : 'secondary'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  data.map(row => (
                    <tr key={row._id}>
                      <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{row.plateNumber}</td>
                      <td>{row.data?.equipmentName || row.ownerName || 'N/A'}</td>
                      <td>{row.typeId?.name || 'Unknown'}</td>
                      <td>
                        <span className={`admin-badge admin-badge--${row.status === 'Approved' ? 'success' : row.status === 'Pending' ? 'warning' : 'danger'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* PAGINATION */}
          {pagination.total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-secondary)' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="admin-btn admin-btn--ghost" 
                  disabled={pagination.page === 1 || loading}
                  onClick={() => fetchData(pagination.page - 1)}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  Previous
                </button>
                <button 
                  className="admin-btn admin-btn--ghost" 
                  disabled={pagination.page * pagination.limit >= pagination.total || loading}
                  onClick={() => fetchData(pagination.page + 1)}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MOVEMENT DETAILS MODAL */}
      {selectedMovement && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="admin-panel admin-fade-in" style={{ width: '100%', maxWidth: '700px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-secondary)' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Movement Details</h3>
              <button onClick={() => setSelectedMovement(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, color: 'var(--text-muted)' }}>&times;</button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Entry Snapshot</div>
                    {selectedMovement.snapshotUrl ? (
                       <img 
                         src={selectedMovement.snapshotUrl.startsWith('http') ? resolvePhotoUrl(selectedMovement.snapshotUrl) : resolvePhotoUrl(`/uploads/activity/${selectedMovement.snapshotUrl}`)} 
                         alt="Entry snapshot" 
                         style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', aspectRatio: '4/3', objectFit: 'cover' }} 
                       />
                    ) : (
                       <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--surface-sunken)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                         No Entry Photo
                       </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Exit Snapshot</div>
                    {selectedMovement.outSnapshotUrl ? (
                       <img 
                         src={selectedMovement.outSnapshotUrl.startsWith('http') ? resolvePhotoUrl(selectedMovement.outSnapshotUrl) : resolvePhotoUrl(`/uploads/activity/${selectedMovement.outSnapshotUrl}`)} 
                         alt="Exit snapshot" 
                         style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', aspectRatio: '4/3', objectFit: 'cover' }} 
                       />
                    ) : (
                       <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--surface-sunken)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-color)', textAlign: 'center', padding: '1rem' }}>
                         {selectedMovement.status === 'Inside' ? 'Still Inside' : 'No Exit Photo'}
                       </div>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>AI Extracted Plate</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{selectedMovement.metadata?.aiPlate || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Operator Confirmed Plate</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{selectedMovement.metadata?.confirmedPlate || 'N/A'}</div>
                  </div>
                </div>
              </div>
              
              <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Master Plate Number</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'monospace' }}>{selectedMovement.vehicleId?.plateNumber || 'Unknown'}</div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Vehicle Type</div>
                  <div>{selectedMovement.vehicleId?.typeId?.name || 'Unknown'}</div>
                </div>

                <div style={{ display: 'flex', gap: '2rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Session Status</div>
                    <span className={`admin-badge admin-badge--${selectedMovement.status === 'Exited' ? 'secondary' : 'info'}`}>
                      {selectedMovement.status === 'Exited' && selectedMovement.outTime ? 'Completed' : 'Active'}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Status</div>
                    <span className={`admin-badge admin-badge--${selectedMovement.status === 'Inside' ? 'success' : 'secondary'}`}>
                      {selectedMovement.status}
                    </span>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Department</div>
                  <div>{selectedMovement.departmentId?.name || 'N/A'}</div>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem', backgroundColor: 'var(--surface-sunken)', borderRadius: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Entry Time</div>
                    <div style={{ fontSize: '0.875rem' }}>{selectedMovement.inTime ? new Date(selectedMovement.inTime).toLocaleString() : 'N/A'}</div>
                  </div>
                  <div style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Exit Time</div>
                    <div style={{ fontSize: '0.875rem' }}>{selectedMovement.outTime ? new Date(selectedMovement.outTime).toLocaleString() : 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
