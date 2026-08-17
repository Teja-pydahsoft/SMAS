'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import AdminIcon from '@/components/admin/AdminIcons';
import { api } from '@/lib/api/client';

// Import our new components
const LiveDetailsPanel = dynamic(() => import('./LiveDetailsPanel'), { ssr: false });
const AuditTimelineMap = dynamic(() => import('./AuditTimelineMap'), { ssr: false });

const Icons = {
  shieldAlert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
};

function getInitials(name) {
  if (!name) return '?';
  return name.substring(0, 2).toUpperCase();
}

export default function GeoLoginActivityPage() {
  const [logs, setLogs] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'map'
  const [selectedLog, setSelectedLog] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedDecision, setSelectedDecision] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRoles();
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [selectedRole, selectedDecision, selectedLocation]);

  async function fetchLocations() {
    try {
      const data = await api.geoLocations.list();
      setLocations(Array.isArray(data) ? data : data.locations || []);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  }

  async function fetchRoles() {
    try {
      const data = await api.systemRoles.list();
      setRoles(Array.isArray(data) ? data : data.roles || []);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  }

  async function fetchLogs(isRefresh = false) {
    if (isRefresh) {
      setSelectedRole('');
      setSelectedDecision('');
      setSelectedLocation('');
      setSearchQuery('');
    }
    setLoading(true);
    setError('');
    setSelectedLog(null);
    try {
      const params = {};
      if (selectedRole) params.role = selectedRole;
      if (selectedDecision) params.decision = selectedDecision;
      if (selectedLocation) params.locationName = selectedLocation;
      if (searchQuery) params.username = searchQuery;

      const data = await api.admin.geoLoginAudit(100, params);
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    return {
      total: logs.length,
      granted: logs.filter(l => l.decision === 'granted' || l.decision === 'allowed').length,
      denied: logs.filter(l => l.decision === 'denied').length,
      outsideRadius: logs.filter(l => l.insideRadius === false).length,
    };
  }, [logs]);

  return (
    <div className="soc-container">
      
      {/* HEADER */}
      <header className="soc-header">
        <div className="header-titles">
          <h1>Geo Login Activity</h1>
          <p>Monitor every geo-location verification, login decision, device validation and security event across the organization.</p>
        </div>
        <div className="header-actions">
          <div className="btn-group">
            <button className="soc-btn">Today</button>
            <button className="soc-btn">7D</button>
            <button className="soc-btn">30D</button>
          </div>
          <button className="soc-btn" onClick={() => fetchLogs(true)}>
            <span className="icon-sm">{Icons.refresh}</span> Refresh
          </button>
          <button className="soc-btn primary">
            <span className="icon-sm">{Icons.download}</span> Export
          </button>
        </div>
      </header>

      {/* KPI CARDS (Only 4) */}
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">Total Attempts</span>
          <span className="kpi-value">{loading ? '-' : summary.total}</span>
        </div>
        <div className="kpi-card border-green">
          <span className="kpi-label text-green">Granted</span>
          <span className="kpi-value">{loading ? '-' : summary.granted}</span>
        </div>
        <div className="kpi-card border-red">
          <span className="kpi-label text-red">Denied</span>
          <span className="kpi-value">{loading ? '-' : summary.denied}</span>
        </div>
        <div className="kpi-card border-orange">
          <span className="kpi-label text-orange">Outside Radius</span>
          <span className="kpi-value">{loading ? '-' : summary.outsideRadius}</span>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="soc-toolbar">
        <div className="toolbar-left">
          <div className="view-switcher">
            <button className={`view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>Table</button>
            <button className={`view-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>Map</button>
          </div>
          
          <div className="soc-search">
            <input 
              type="text" 
              placeholder="Search users, IPs, locations..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
            />
          </div>

          <select 
            className="soc-select" 
            value={selectedDecision} 
            onChange={(e) => setSelectedDecision(e.target.value)}
          >
            <option value="">All Decisions</option>
            <option value="granted">Granted</option>
            <option value="allowed">Allowed</option>
            <option value="denied">Denied</option>
            <option value="bypassed">Bypassed</option>
          </select>
          
          <select 
            className="soc-select" 
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="">All Roles</option>
            {roles.map(r => (
              <option key={r._id} value={r.name}>{r.name}</option>
            ))}
          </select>
          
          <select 
            className="soc-select" 
            value={selectedLocation} 
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map(loc => (
              <option key={loc._id} value={loc.name}>{loc.name}</option>
            ))}
          </select>
          
          <button 
            className={`soc-btn ${showAdvancedFilters ? 'active' : ''}`} 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            Advanced <span className="icon-xs">{Icons.chevronDown}</span>
          </button>
        </div>
      </div>

      {showAdvancedFilters && (
        <div className="advanced-filters">
          <select className="soc-select"><option>Browser</option></select>
          <select className="soc-select"><option>Operating System</option></select>
          <select className="soc-select"><option>Device Status</option></select>
          <select className="soc-select"><option>Department</option></select>
          <select className="soc-select"><option>Division</option></select>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="soc-content-area">
        {error ? (
          <div className="error-state">{error}</div>
        ) : loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <span>Loading audit events...</span>
          </div>
        ) : viewMode === 'table' ? (
          <div className="soc-split-layout">
            <div className="split-left">
              <div className="table-wrapper">
                <table className="soc-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Decision</th>
                      <th>Location</th>
                      <th>Distance</th>
                      <th>Device</th>
                      <th>Browser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const decision = log.decision || log.result || 'unknown';
                      const isSelected = selectedLog?._id === log._id;
                      const hasLocation = log.matchedLatitude != null || log.matchedLocationName != null;
                      const locationName = log.matchedLocationName || (hasLocation ? 'Permitted Boundary' : '-');
                      
                      let distanceDisplay = <span className="text-muted">-</span>;
                      if (log.calculatedDistance !== null) {
                        const dist = log.calculatedDistance;
                        const formattedDist = dist > 1000 ? (dist / 1000).toFixed(1) : dist;
                        const unit = dist > 1000 ? 'km' : 'm';
                        distanceDisplay = (
                          <div className="distance-cell">
                            <span className={`dist-val ${log.insideRadius ? 'dist-ok' : 'dist-bad'}`}>
                              {formattedDist}
                            </span>
                            <span className="dist-unit">{unit}</span>
                          </div>
                        );
                      }

                      return (
                        <tr 
                          key={log._id} 
                          className={`soc-row row-${decision} ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedLog(log)}
                        >
                          <td>
                            <div className="cell-stack">
                              <span className="text-strong">{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                              <span className="text-muted">{new Date(log.createdAt).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar">{getInitials(log.userDisplayName || log.userUsername)}</div>
                              <div className="cell-stack">
                                <span className="text-strong">{log.userDisplayName || log.userUsername}</span>
                                <span className="text-muted">@{log.userUsername}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge badge-${decision}`}>
                              {decision.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <span className="text-strong">{locationName}</span>
                            </div>
                          </td>
                          <td>{distanceDisplay}</td>
                          <td>
                            <div className="cell-stack">
                              <span className="text-strong">{log.deviceName || log.operatingSystem || '-'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <span className="text-strong">{log.browser || '-'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan="7" className="empty-table">No audit logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="split-right">
              <LiveDetailsPanel log={selectedLog} />
            </div>
          </div>
        ) : (
          <AuditTimelineMap 
            logs={logs} 
            selectedLog={selectedLog} 
            onSelectLog={setSelectedLog} 
            locations={locations}
          />
        )}
      </div>

      <style jsx>{`
        .soc-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: calc(100vh - 180px);
          padding: 16px;
          background: #f1f5f9;
          overflow: hidden;
        }

        /* Header */
        .soc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-shrink: 0;
        }
        .header-titles h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: #0f172a; }
        .header-titles p { margin: 0; font-size: 13px; color: #64748b; }
        
        .header-actions { display: flex; gap: 8px; align-items: center; }
        .btn-group { display: flex; background: #e2e8f0; border-radius: 6px; padding: 2px; }
        .btn-group .soc-btn { border: none; background: transparent; }
        .btn-group .soc-btn:hover { background: #ffffff; }

        .soc-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s;
        }
        .soc-btn:hover { background: #f8fafc; }
        .soc-btn.primary { background: #0f172a; color: #ffffff; border-color: #0f172a; }
        .soc-btn.primary:hover { background: #1e293b; }
        .soc-btn.active { background: #e2e8f0; border-color: #cbd5e1; }
        .icon-sm { width: 14px; height: 14px; display: flex; }
        .icon-xs { width: 12px; height: 12px; display: flex; }

        /* KPIs */
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          flex-shrink: 0;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .border-green { border-left: 3px solid #10b981; }
        .border-red { border-left: 3px solid #ef4444; }
        .border-orange { border-left: 3px solid #f97316; }
        
        .kpi-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .kpi-value { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1; }
        .text-green { color: #10b981; }
        .text-red { color: #ef4444; }
        .text-orange { color: #f97316; }

        /* Toolbar */
        .soc-toolbar {
          display: flex;
          justify-content: space-between;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px;
          flex-shrink: 0;
        }
        .toolbar-left { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        
        .view-switcher {
          display: flex;
          background: #f1f5f9;
          border-radius: 4px;
          padding: 2px;
        }
        .view-btn {
          border: none;
          background: transparent;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-radius: 4px;
          cursor: pointer;
        }
        .view-btn.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

        .soc-search input {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 12px;
          width: 200px;
          outline: none;
        }
        .soc-search input:focus { border-color: #3b82f6; }

        .soc-select {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 24px 4px 10px;
          font-size: 12px;
          color: #334155;
          outline: none;
          background: #ffffff;
          appearance: auto;
          width: auto;
          min-width: 120px;
          max-width: 200px;
          display: inline-block;
        }

        .advanced-filters {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          flex-shrink: 0;
        }

        /* Content Area & Split Layout */
        .soc-content-area {
          flex: 1;
          min-height: 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }
        .soc-split-layout {
          display: flex;
          width: 100%;
          height: 100%;
        }
        .split-left {
          flex: 7;
          min-width: 0;
          height: 100%;
          overflow-y: auto;
        }
        .split-right {
          flex: 3;
          min-width: 320px;
          height: 100%;
        }

        /* DENSE TABLE */
        .table-wrapper { width: 100%; }
        .soc-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .soc-table th {
          position: sticky;
          top: 0;
          background: #f8fafc;
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
          z-index: 10;
        }
        .soc-table td {
          padding: 6px 12px;
          vertical-align: middle;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .soc-row {
          cursor: pointer;
          border-left: 3px solid transparent;
          transition: background 0.1s;
        }
        .soc-row:hover { background: #f8fafc; }
        .soc-row.selected { background: #eff6ff; }
        
        .row-allowed, .row-granted { border-left-color: #10b981; }
        .row-denied { border-left-color: #ef4444; }
        .row-bypassed { border-left-color: #3b82f6; }
        .row-unknown { border-left-color: #94a3b8; }
        
        .soc-row:hover.row-allowed { border-left-color: #059669; }
        
        .cell-stack { display: flex; flex-direction: column; }
        .text-strong { font-size: 12px; font-weight: 600; color: #0f172a; white-space: nowrap; }
        .text-muted { font-size: 11px; color: #64748b; white-space: nowrap; }

        .user-cell { display: flex; align-items: center; gap: 8px; }
        .user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          background: #e2e8f0;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 10px;
        }

        .status-badge {
          display: inline-flex;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .badge-allowed, .badge-granted { background: #dcfce7; color: #166534; }
        .badge-denied { background: #fee2e2; color: #991b1b; }
        .badge-bypassed { background: #eff6ff; color: #1d4ed8; }
        .badge-unknown, .badge-error { background: #f1f5f9; color: #475569; }

        .distance-cell { display: flex; align-items: baseline; gap: 2px; }
        .dist-val { font-size: 13px; font-weight: 700; }
        .dist-ok { color: #10b981; }
        .dist-bad { color: #f97316; }
        .dist-unit { font-size: 10px; color: #64748b; font-weight: 600; }

        .empty-table { padding: 40px !important; text-align: center; color: #64748b; font-size: 13px; }
        
        .loading-state, .error-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 12px;
          font-size: 13px;
          color: #64748b;
        }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid #cbd5e1;
          border-top-color: #0f172a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
