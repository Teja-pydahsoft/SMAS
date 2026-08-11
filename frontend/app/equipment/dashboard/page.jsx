"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api/client';

import PageShell from '@/components/PageShell';
import DashboardSummaryCard from '@/components/dashboard/DashboardSummaryCard';
import LiveActivityFeed from '@/components/dashboard/LiveActivityFeed';
import StatusChip from '@/components/dashboard/StatusChip';

export default function IdleDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchDashboard = () => {
    api.equipment.dashboard()
      .then(resData => {
        setData(resData);
        setLoading(false);
        setLastRefresh(new Date());
      })
      .catch(err => {
        console.error(err);
        setData({ error: err.message || 'Network error or backend unavailable' });
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
    
    // Auto refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDashboard();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    fetchDashboard();
  };

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', fontWeight: 500 }}>
        Refreshed: {lastRefresh.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
      </span>
      <button onClick={handleManualRefresh} className="admin-btn admin-btn--ghost">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-12.28l5.07 5.07"/></svg>
        Refresh
      </button>
      <Link href="/equipment/reports" className="admin-btn admin-btn--ghost">View Reports</Link>
      <Link href="/equipment/settings" className="admin-btn admin-btn--ghost">Settings</Link>
    </div>
  );

  if (loading && !data) {
    return (
      <PageShell title="Equipment Dashboard" toolbar={toolbar}>
        <div className="admin-dashboard admin-skeleton">
          <div className="admin-metrics-grid">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="admin-metric-card" style={{ height: '110px' }}>
                <div className="admin-skeleton__line admin-skeleton__line--sm"></div>
                <div className="admin-skeleton__line admin-skeleton__line--lg"></div>
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  if (!data || !data.buckets) return (
    <PageShell title="Equipment Dashboard" toolbar={toolbar}>
      <div className="admin-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-danger)', marginBottom: '8px' }}>Error Loading Dashboard</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{data?.error || 'Could not connect to the logistics engine or data is malformed. Please try again later.'}</p>
      </div>
    </PageShell>
  );

  const totalEquipment = (data.activeWorking || 0) + (data.activeIdle || 0);
  const criticalAlerts = (data.buckets['4h'] || 0) + (data.buckets['shift'] || 0);

  // SVG Icons
  const Icons = {
    Total: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
    Working: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    Idle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Hour: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
    Critical: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
  };

  return (
    <PageShell 
      title="Equipment Dashboard" 
      description={new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      toolbar={toolbar}
    >
      <div className="admin-dashboard">
        
        {/* ROW 1: Summary Cards */}
        <div className="admin-metrics-grid">
          <DashboardSummaryCard 
            label="Total Equipment" 
            value={totalEquipment} 
            icon={Icons.Total} 
            iconType="secondary"
          />
          <DashboardSummaryCard 
            label="Working" 
            value={data.activeWorking} 
            icon={Icons.Working} 
            iconType="success"
            trend={`${data.utilization}% Utilization`}
            trendDir="up"
          />
          <DashboardSummaryCard 
            label="Idle" 
            value={data.activeIdle} 
            icon={Icons.Idle} 
            iconType="warning"
          />
          <DashboardSummaryCard 
            label="Idle > 1 Hour" 
            value={data.buckets['1h']} 
            icon={Icons.Hour} 
            iconType="warning"
          />
          <DashboardSummaryCard 
            label="Critical Alerts" 
            value={criticalAlerts} 
            icon={Icons.Critical} 
            iconType="danger"
            trend={criticalAlerts > 0 ? "Requires Action" : ""}
            trendDir={criticalAlerts > 0 ? "down" : ""}
          />
        </div>

        {/* ROW 2: Current Equipment Status (70%) & Live Activity Feed (30%) */}
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '1.25rem' }}>
          
          {/* Left: Current Equipment Status */}
          <div className="admin-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
            <div className="admin-panel__head" style={{ padding: '1.15rem 1.35rem 0.75rem', margin: 0, borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h2 style={{ fontSize: '1rem' }}>Current Equipment Status</h2>
                <p className="admin-panel__meta" style={{ marginTop: '2px' }}>Showing top inactive assets across all departments</p>
              </div>
            </div>
            
            <div className="table-scroll" style={{ flex: 1, maxHeight: '420px', overflowY: 'auto' }}>
              <table className="reg-table" style={{ margin: 0 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-base)' }}>
                  <tr>
                    <th>Vehicle</th>
                    <th>Equipment Type</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Idle Since</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topIdle.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                        All equipment is currently active.
                      </td>
                    </tr>
                  ) : (
                    data.topIdle.map((item, idx) => {
                      const hours = Math.floor(item.minutes / 60);
                      const mins = item.minutes % 60;
                      return (
                        <tr key={item.session._id} style={{ cursor: 'pointer' }}>
                          <td style={{ fontWeight: 600 }}>{item.session.vehicleId?.plateNumber || 'Unknown'}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{item.session.vehicleId?.typeId || 'Unknown'}</td>
                          <td>{item.session.lastDepartmentId?.name || 'Unknown'}</td>
                          <td>
                            <StatusChip status="Idle" type="warning" />
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{new Date(item.session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                          <td style={{ fontWeight: 600, color: item.minutes >= 240 ? 'var(--color-danger)' : (item.minutes >= 60 ? 'var(--color-warning)' : 'var(--text-primary)') }}>
                            {hours > 0 ? `${hours}h ` : ''}{mins}m
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Live Activity Feed */}
          <div className="admin-panel" style={{ padding: '1.15rem 0.85rem' }}>
            <div className="admin-panel__head" style={{ padding: '0 0.5rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem' }}>Live Activity Feed</h2>
            </div>
            <LiveActivityFeed events={data.recentEvents} />
          </div>
        </div>

        {/* ROW 3: Idle Equipment Action Table */}
        {data.topIdle.length > 0 && (
          <div className="admin-panel" style={{ padding: '0' }}>
            <div className="admin-panel__head" style={{ padding: '1.15rem 1.35rem 0.75rem', margin: 0, borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1rem' }}>Idle Equipment Watchlist</h2>
            </div>
            <div className="table-scroll">
              <table className="reg-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Equipment</th>
                    <th>Last Department</th>
                    <th>Last Out Time</th>
                    <th>Idle Duration</th>
                    <th>Alert Level</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topIdle.map(item => {
                    const isCritical = item.minutes >= 240;
                    const isWarning = item.minutes >= 60 && item.minutes < 240;
                    
                    let highlightClass = '';
                    let alertText = 'Standard';
                    if (isCritical) {
                      highlightClass = 'row-inactive'; // Reuse existing class for red hue or define custom style
                      alertText = 'Critical';
                    } else if (isWarning) {
                      alertText = 'Warning';
                    }

                    return (
                      <tr key={`watchlist-${item.session._id}`} className={highlightClass}>
                        <td style={{ fontWeight: 600 }}>{item.session.vehicleId?.plateNumber || 'Unknown'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{item.session.vehicleId?.typeId || 'Unknown'}</td>
                        <td>{item.session.lastDepartmentId?.name || 'Unknown'}</td>
                        <td>{new Date(item.session.startTime).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>
                          {Math.floor(item.minutes / 60)}h {item.minutes % 60}m
                        </td>
                        <td>
                          <StatusChip 
                            status={alertText} 
                            type={isCritical ? 'danger' : (isWarning ? 'warning' : 'info')} 
                          />
                        </td>
                        <td>{item.session.status}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="admin-btn admin-btn--ghost" style={{ padding: '4px 10px', fontSize: 'var(--text-11)' }}>
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
