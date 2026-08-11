"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { api } from '@/lib/api/client';

import PageShell from '@/components/PageShell';
import PageTabs from '@/components/PageTabs';

function ReportsContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'idle';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    api.equipment.reports()
      .then(data => {
        setReports(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setReports({ error: err.message || 'Network error or backend unavailable' });
        setLoading(false);
      });
  }, []);

  const handleExportCSV = () => {
    if (filteredReports.length === 0) return alert('No data to export');
    const headers = ['Vehicle Number', 'Status', 'Last Department', 'Out Time', 'Duration (Mins)', 'Cleared At'];
    const rows = filteredReports.map(r => [
      r.vehicleNumber,
      r.status,
      r.lastDepartment,
      new Date(r.outTime).toLocaleString(),
      r.durationMinutes,
      r.clearedAt ? new Date(r.clearedAt).toLocaleString() : 'N/A'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `idle_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toolbar = (
    <button 
      onClick={handleExportCSV}
      className="btn-primary"
      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
      Export CSV
    </button>
  );

  const tabs = [
    { label: 'Idle Report', path: '/equipment/reports?tab=idle' },
    { label: 'Activity Report', path: '/equipment/reports?tab=activity' }
  ];

  if (reports && reports.error) {
    return (
      <PageShell title="Equipment Reports" toolbar={toolbar}>
        <PageTabs tabs={tabs} />
        <div className="card text-center text-red-500">
          <h2 className="text-xl font-bold">Error Loading Reports</h2>
          <p>{reports.error}</p>
        </div>
      </PageShell>
    );
  }

  const safeReports = Array.isArray(reports) ? reports : [];

  const filteredReports = safeReports.filter(r => 
    (r.vehicleNumber || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.lastDepartment || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.status || '').toLowerCase().includes(filter.toLowerCase())
  );

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const currentData = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <PageShell 
      title="Equipment Reports"  
      description="Search and view historical operational data across the enterprise."
      toolbar={toolbar}
    >
      <PageTabs tabs={tabs} />
      
      <div className="card">
        {tab === 'activity' ? (
          <div className="text-center py-12 text-gray-500">
            Activity Report is currently being constructed.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="form-group" style={{ margin: 0, width: '100%', maxWidth: '400px' }}>
                <input 
                  type="text" 
                  placeholder="Search by vehicle, department, status..."
                  value={filter}
                  onChange={e => {
                    setFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="text-sm text-gray-500">
                Showing {currentData.length} of {filteredReports.length} records
              </div>
            </div>

            {loading ? (
              <div className="animate-pulse space-y-4 mt-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded w-full"></div>
                ))}
              </div>
            ) : (
              <>
                <div className="table-scroll mt-4">
                  <table className="reg-table">
                    <thead>
                      <tr>
                        <th>Vehicle Number</th>
                        <th>Status</th>
                        <th>Last Department</th>
                        <th>Out Time</th>
                        <th>Duration (Mins)</th>
                        <th>Cleared At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map(r => (
                        <tr key={r._id} className={r.status === 'Active' ? 'row-inactive' : ''}>
                          <td className="name-cell font-mono">{r.vehicleNumber}</td>
                          <td>
                            <span className={`badge ${r.status === 'Active' ? 'badge-danger' : 'badge-success'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td>{r.lastDepartment}</td>
                          <td>{new Date(r.outTime).toLocaleString()}</td>
                          <td className="font-medium">
                            {Math.floor(r.durationMinutes / 60) > 0 ? `${Math.floor(r.durationMinutes / 60)}h ` : ''}
                            {r.durationMinutes % 60}m
                          </td>
                          <td>{r.clearedAt ? new Date(r.clearedAt).toLocaleString() : '—'}</td>
                          <td className="actions-cell">
                            <Link href={`/vehicles/${r._id}`}>
                              <button type="button" className="btn-secondary">Timeline</button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {currentData.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center text-gray-500 py-6">No report records match your search.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-6">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="btn-secondary"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="btn-secondary"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
