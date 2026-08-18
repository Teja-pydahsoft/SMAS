'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PageShell from '@/components/PageShell';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { formatCurrency } from '@/lib/payFrequency';
import { formatShiftWindow, formatDurationHours } from '@/lib/shiftTiming';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import SearchableSelect from '@/components/SearchableSelect';

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function shiftOrTimeLabel(day) {
  const shiftWindow = formatShiftWindow(day?.shiftStartTime, day?.shiftEndTime);
  if (day?.shiftName && shiftWindow) return `${day.shiftName} · ${shiftWindow}`;
  if (day?.shiftName && day?.shiftTotalHours != null) {
    return `${day.shiftName} · ${formatDurationHours(day.shiftTotalHours)}h`;
  }
  if (day?.shiftName) return day.shiftName;
  if (shiftWindow) return shiftWindow;
  if (day?.shiftTotalHours != null) return `${formatDurationHours(day.shiftTotalHours)}h shift`;
  if (day?.checkIn || day?.lastActivityAt) {
    const lastLabel = day.lastActivityType === 'exit' ? 'Out' : 'Last';
    return `${formatTime(day.checkIn)} – ${formatTime(day.lastActivityAt)} (${lastLabel})`;
  }
  return '—';
}

function Avatar({ url, name, size = 44 }) {
  const src = resolvePhotoUrl(url);
  const initials = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Labour'}
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          objectFit: 'cover',
          border: '1px solid var(--border-color)',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: 'var(--surface-secondary)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export default function PaySlipsPage() {
  const { can } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [labourers, setLabourers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterLabourType, setFilterLabourType] = useState('');
  const [filterWorkCategory, setFilterWorkCategory] = useState('');
  
  // Dialog State
  const [selectedLabourer, setSelectedLabourer] = useState(null);
  const [selectedLabourerPaySlips, setSelectedLabourerPaySlips] = useState([]);
  const [selectedLabourerLoading, setSelectedLabourerLoading] = useState(false);
  const [slipDetails, setSlipDetails] = useState(null);
  const [slipDetailsLoading, setSlipDetailsLoading] = useState(false);
  const [slipDetailsError, setSlipDetailsError] = useState('');
  const [viewingSlip, setViewingSlip] = useState(null);

  const canRead = can('payroll_rate_master', 'read');

  const fetchLabourers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.payroll.getRateMasterLabourers();
      setLabourers(data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch labourers', err);
      setError('Failed to load pay slips and locks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (canRead) {
      fetchLabourers();
    }
  }, [canRead, fetchLabourers]);

  const loadLabourerPaySlips = useCallback(async (labourerId) => {
    const paySlips = await api.payroll.getPaySlips({ registrationId: labourerId });
    return Array.isArray(paySlips) ? paySlips : [];
  }, []);

  const handleViewDetails = useCallback(async (labourer) => {
    setSelectedLabourer(labourer);
    setSelectedLabourerLoading(true);
    setSlipDetails(null);
    setSlipDetailsError('');
    setViewingSlip(null);
    try {
      const paySlips = await loadLabourerPaySlips(labourer.id);
      setSelectedLabourerPaySlips(paySlips);
    } catch (err) {
      setSelectedLabourerPaySlips([]);
      setError(err.message || 'Failed to load pay slip history.');
    } finally {
      setSelectedLabourerLoading(false);
    }
  }, [loadLabourerPaySlips]);

  const handleViewSlipDetails = useCallback(async (slip) => {
    const slipId = slip?._id || slip?.id;
    if (!slipId) return;
    setViewingSlip(slip);
    setSlipDetails(null);
    setSlipDetailsError('');
    setSlipDetailsLoading(true);
    try {
      const details = await api.payroll.getPaySlipDetails(slipId);
      setSlipDetails(details);
    } catch (err) {
      setSlipDetailsError(err.message || 'Failed to load pay slip details.');
    } finally {
      setSlipDetailsLoading(false);
    }
  }, []);

  const closeLabourerDialog = useCallback(() => {
    setSelectedLabourer(null);
    setSlipDetails(null);
    setSlipDetailsError('');
    setSlipDetailsLoading(false);
    setViewingSlip(null);
  }, []);

  const closeSlipDetails = useCallback(() => {
    setSlipDetails(null);
    setSlipDetailsError('');
    setSlipDetailsLoading(false);
    setViewingSlip(null);
  }, []);

  const handleUnlock = async (paySlipId) => {
    if (!confirm('Are you sure you want to unlock this pay slip? Attendance modifications will be allowed.')) return;
    try {
      await api.payroll.unlockPaySlip(paySlipId);
      await fetchLabourers();
      
      if (selectedLabourer) {
        const paySlips = await loadLabourerPaySlips(selectedLabourer.id);
        setSelectedLabourerPaySlips(paySlips);
      }
    } catch (err) {
      setError(err.message || 'Failed to unlock pay slip');
    }
  };

  const filteredLabourers = labourers.filter(l => {
    const q = searchQuery.toLowerCase();
    if (q && !l.name.toLowerCase().includes(q) && !l.code.toLowerCase().includes(q)) return false;
    if (filterBatch && l.batchName !== filterBatch) return false;
    if (filterLabourType && l.labourType !== filterLabourType) return false;
    if (filterWorkCategory && l.workCategory !== filterWorkCategory) return false;
    return true;
  });

  const uniqueBatches = [...new Set(labourers.map(l => l.batchName))].filter(Boolean).sort();
  const uniqueTypes = [...new Set(labourers.map(l => l.labourType))].filter(Boolean).sort();
  const uniqueCategories = [...new Set(labourers.map(l => l.workCategory))].filter(Boolean).sort();
  const activeFilterCount = [searchQuery, filterBatch, filterLabourType, filterWorkCategory]
    .filter((value) => String(value || '').trim() !== '')
    .length;

  if (!canRead) {
    return (
      <PageShell title="Pay Slips & Locks" description="Manage generated pay slips and attendance locks">
        <p className="read-only-banner">You do not have access to this page.</p>
      </PageShell>
    );
  }

  return (
    <PageShell 
      title="Pay Slips & Locks" 
      description="View and manage generated pay slips and attendance locks"
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 200px)', minHeight: 0 }}>
        {error && <div className="error-msg" style={{ marginBottom: '1rem', padding: '1rem' }}>{error}</div>}
        
        {loading ? (
          <div style={{ padding: '2rem' }}>Loading pay slips...</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1rem', padding: '1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
              <input
                type="search"
                className="form-input"
                placeholder="Search labour name or code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <div style={{ minWidth: '170px' }}>
                <SearchableSelect
                  options={uniqueBatches}
                  value={filterBatch || ''}
                  onChange={(value) => setFilterBatch(value || '')}
                  placeholder="All Batches"
                  emptyValue=""
                  className="form-input"
                />
              </div>
              <select className="form-input" value={filterLabourType} onChange={e => setFilterLabourType(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                <option value="">All Types</option>
                {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="form-input" value={filterWorkCategory} onChange={e => setFilterWorkCategory(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                <option value="">All Categories</option>
                {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>
                Showing {filteredLabourers.length} of {labourers.length} people
              </span>
              {activeFilterCount > 0 && (
                <span className="badge badge-info">{activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}</span>
              )}
            </div>

            {filteredLabourers.length === 0 ? (
              <div style={{ padding: '2rem' }} className="hint-text">No active labourers match your filters.</div>
            ) : (
              <div className="table-responsive" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="rc-table" style={{ width: '100%', minWidth: '980px', margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                    <tr>
                      <th>Labourer</th>
                      <th>Code</th>
                      <th>Batch</th>
                      <th>Labour Type</th>
                      <th>Work Category</th>
                      <th>Current Rate</th>
                      <th>Locked Slips</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLabourers.map(labour => (
                      <tr
                        key={labour.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleViewDetails(labour)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleViewDetails(labour);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: '230px' }}>
                            <Avatar url={labour.photoPath} name={labour.name} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{labour.name}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>{labour.code}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{labour.batchName}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{labour.labourType}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{labour.workCategory}</div>
                        </td>
                        <td>
                          {labour.payAmount ? (
                            <div>
                              <div style={{ fontWeight: 700 }}>&#x20B9;{labour.payAmount}</div>
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                {labour.workingHours ? `${labour.workingHours}h shift` : 'Rate assigned'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Not Assigned</span>
                          )}
                        </td>
                        <td>
                          {labour.locks && labour.locks.length > 0 ? (
                            <span className="badge badge-warning">{labour.locks.length} Locked Slips</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>None</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(labour);
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {selectedLabourer && mounted && createPortal(
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="dialog-content card" style={{ width: '96vw', maxWidth: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
            <div className="dialog-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Pay Slips for {selectedLabourer.name}</h3>
              <button onClick={closeLabourerDialog} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div className="dialog-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <Avatar url={selectedLabourer.photoPath} name={selectedLabourer.name} size={56} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedLabourer.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <strong>{selectedLabourer.code}</strong> &bull; {selectedLabourer.batchName} &bull; {selectedLabourer.labourType}
                  </div>
                </div>
              </div>
              
              <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                Pay Slip History
                {selectedLabourerPaySlips.length > 0 && (
                  <span className="badge badge--secondary" style={{ marginLeft: '0.5rem' }}>{selectedLabourerPaySlips.length} Total</span>
                )}
              </h4>
              
              {selectedLabourerLoading ? (
                <p className="hint-text">Loading pay slip history...</p>
              ) : selectedLabourerPaySlips.length === 0 ? (
                <p className="hint-text">No pay slips generated for this labourer yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {selectedLabourerPaySlips.map((slip) => (
                    <div key={slip._id || slip.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={slip.status === 'Locked' ? 'var(--danger-color)' : 'var(--color-primary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="2" y1="10" x2="22" y2="10"></line>
                          </svg>
                          <strong style={{ color: slip.status === 'Locked' ? 'var(--danger-color)' : 'var(--color-primary)' }}>
                            {slip.status || 'Unknown'}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                          Period: <strong>{formatDate(slip.fromDate)}</strong> to <strong>{formatDate(slip.toDate)}</strong>
                        </div>
                        <div style={{ fontSize: '0.9rem', display: 'flex', gap: '1rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>Hours: <strong>{slip.totalHours || 0}</strong></span>
                          <span>Amount: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(slip.amount || 0)}</strong></span>
                          <span>Generated: <strong>{formatDateTime(slip.createdAt)}</strong></span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleViewSlipDetails(slip)}
                        >
                          View Details
                        </button>
                        {slip.status === 'Locked' && can('system_access', 'write') && (
                          <button 
                            className="btn-secondary btn-sm" 
                            onClick={() => handleUnlock(slip._id || slip.id)}
                          >
                            Unlock
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {(viewingSlip || slipDetailsLoading || slipDetailsError || slipDetails) && mounted && createPortal(
        <div
          className="dialog-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={closeSlipDetails}
        >
          <div
            className="dialog-content card"
            style={{ width: '96vw', maxWidth: '980px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Pay Slip Details</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {slipDetails?.labourer?.name || selectedLabourer?.name || 'Labourer'}
                  {(slipDetails?.paySlip || viewingSlip) && (
                    <>
                      {' · '}
                      {formatDate(slipDetails?.paySlip?.fromDate || viewingSlip?.fromDate)} to {formatDate(slipDetails?.paySlip?.toDate || viewingSlip?.toDate)}
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={closeSlipDetails}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}
                aria-label="Close pay slip details"
              >
                &times;
              </button>
            </div>

            <div className="dialog-body" style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
              {slipDetailsLoading ? (
                <p className="hint-text">Loading day-by-day pay slip details...</p>
              ) : slipDetailsError ? (
                <p className="error-msg">{slipDetailsError}</p>
              ) : slipDetails ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period</div>
                      <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{formatDate(slipDetails.paySlip.fromDate)} – {formatDate(slipDetails.paySlip.toDate)}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
                      <div style={{ marginTop: '0.25rem' }}>
                        <span className={`badge ${slipDetails.paySlip.status === 'Locked' ? 'badge-warning' : 'badge-info'}`}>
                          {slipDetails.paySlip.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Hours</div>
                      <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{slipDetails.paySlip.totalHours || 0}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pay Slip Amount</div>
                      <div style={{ fontWeight: 800, marginTop: '0.25rem' }}>{formatCurrency(slipDetails.paySlip.amount || 0)}</div>
                    </div>
                  </div>

                  {(!slipDetails.days || slipDetails.days.length === 0) ? (
                    <p className="hint-text">No attendance days found for this pay slip period.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="rc-table" style={{ width: '100%', margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Shift / Time</th>
                            <th>In</th>
                            <th>Out / Last</th>
                            <th>Hours</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slipDetails.days.map((day) => (
                            <tr key={day.date}>
                              <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatDate(day.date)}</td>
                              <td>{shiftOrTimeLabel(day)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatTime(day.checkIn)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatTime(day.lastActivityAt)}</td>
                              <td>{day.activityHours != null ? `${formatDurationHours(day.activityHours)}h` : '—'}</td>
                              <td>
                                <span className="badge badge--secondary" title={day.label || day.code}>
                                  {day.code || day.status || '—'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {day.amount != null ? formatCurrency(day.amount) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageShell>
  );
}
