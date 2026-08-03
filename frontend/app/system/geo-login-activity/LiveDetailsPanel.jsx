'use client';

import dynamic from 'next/dynamic';

const AuditMiniMap = dynamic(() => import('./AuditMiniMap'), { ssr: false });

const Icons = {
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  externalLink: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  shieldAlert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

export default function LiveDetailsPanel({ log }) {
  if (!log) {
    return (
      <div className="soc-panel-empty">
        <div className="empty-icon">{Icons.shieldAlert}</div>
        <h4>No Event Selected</h4>
        <p>Select an audit log from the table to view incident details.</p>
        <style jsx>{`
          .soc-panel-empty {
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            color: #64748b;
          }
          .empty-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
          }
          h4 { margin: 0 0 8px 0; font-size: 15px; color: #334155; }
          p { margin: 0; font-size: 13px; max-width: 250px; }
        `}</style>
      </div>
    );
  }

  const decision = log.decision || log.result || 'unknown';
  const hasLocation = log.matchedLatitude != null || log.matchedLocationName != null;
  const locationName = log.matchedLocationName || (hasLocation ? 'Permitted Boundary' : '-');

  const mapLink = log.latitude && log.longitude 
    ? `https://www.google.com/maps?q=${log.latitude},${log.longitude}` 
    : null;

  return (
    <div className="soc-panel">
      <div className="panel-header">
        <h3>Incident Details</h3>
        <span className={`status-badge badge-${decision}`}>{decision.toUpperCase()}</span>
      </div>
      
      <div className="panel-content">
        
        <div className="soc-section">
          <h4 className="section-title">Login Summary</h4>
          <div className="soc-grid">
            <div className="soc-data">
              <span className="soc-label">Time</span>
              <span className="soc-value">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Decision</span>
              <span className="soc-value capitalize">{decision}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Reason</span>
              <span className="soc-value capitalize">{log.reason ? log.reason.replace(/_/g, ' ') : '-'}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Verif. Duration</span>
              <span className="soc-value">{log.geoVerificationDurationMs !== null ? `${log.geoVerificationDurationMs}ms` : '-'}</span>
            </div>
          </div>
        </div>

        <div className="soc-section">
          <h4 className="section-title">Employee</h4>
          <div className="employee-card">
            <div className="emp-avatar">
              {(log.userDisplayName || log.userUsername || '?').charAt(0).toUpperCase()}
            </div>
            <div className="emp-info">
              <span className="emp-name">{log.userDisplayName || log.userUsername}</span>
              <span className="emp-user">@{log.userUsername}</span>
              <div className="emp-meta">
                {log.role && <span>{log.role}</span>}
                {log.department && <span> • {log.department}</span>}
                {log.division && <span> • {log.division}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="soc-section">
          <h4 className="section-title">Device</h4>
          <div className="soc-grid">
            <div className="soc-data col-span-2">
              <span className="soc-label">Device Name</span>
              <span className="soc-value">{log.deviceName || '-'}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Agent Version</span>
              <span className="soc-value">{log.agentVersion || '-'}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Status</span>
              <span className="soc-value">{log.deviceStatus || '-'}</span>
            </div>
            <div className="soc-data col-span-2">
              <span className="soc-label">Fingerprint</span>
              <span className="soc-value font-mono text-xs">{log.deviceFingerprint || '-'}</span>
            </div>
          </div>
        </div>

        <div className="soc-section">
          <h4 className="section-title">Browser</h4>
          <div className="soc-grid">
            <div className="soc-data">
              <span className="soc-label">Browser</span>
              <span className="soc-value">{log.browser || '-'}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">OS</span>
              <span className="soc-value">{log.operatingSystem || '-'}</span>
            </div>
            <div className="soc-data col-span-2">
              <span className="soc-label">IP Address</span>
              <span className="soc-value font-mono">{log.ipAddress || '-'}</span>
            </div>
            <div className="soc-data col-span-2">
              <span className="soc-label">User Agent</span>
              <span className="soc-value font-mono text-xs line-clamp">{log.userAgent || '-'}</span>
            </div>
          </div>
        </div>

        <div className="soc-section">
          <h4 className="section-title">Geo Verification</h4>
          <div className="soc-grid">
            <div className="soc-data">
              <span className="soc-label">Current Lat, Lng</span>
              <span className="soc-value font-mono text-xs">
                {log.latitude?.toFixed(6) || '-'}, {log.longitude?.toFixed(6) || '-'}
              </span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Accuracy</span>
              <span className="soc-value">{log.accuracy ? `${Math.round(log.accuracy)}m` : '-'}</span>
            </div>
            <div className="soc-data col-span-2">
              <span className="soc-label">Assigned Location</span>
              <span className="soc-value text-strong">{locationName}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Assigned Radius</span>
              <span className="soc-value">{log.configuredRadius ? `${log.configuredRadius}m` : '-'}</span>
            </div>
            <div className="soc-data">
              <span className="soc-label">Calculated Dist.</span>
              <span className="soc-value">
                {log.calculatedDistance !== null ? `${log.calculatedDistance}m` : '-'}
              </span>
            </div>
            <div className="soc-data col-span-2">
              <span className="soc-label">Inside Radius?</span>
              <span className={`soc-value font-bold ${log.insideRadius ? 'text-green' : 'text-red'}`}>
                {log.insideRadius ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        </div>

        {(log.latitude && log.longitude && log.matchedLatitude && log.matchedLongitude) && (
          <div className="soc-section no-border">
            <div className="map-header">
              <h4 className="section-title no-border">Live Mini Map</h4>
              <div className="map-actions">
                <button 
                  className="btn-map"
                  onClick={() => navigator.clipboard.writeText(`${log.latitude}, ${log.longitude}`)}
                  title="Copy Coordinates"
                >
                  <span className="icon-xs">{Icons.copy}</span>
                </button>
                {mapLink && (
                  <a href={mapLink} target="_blank" rel="noreferrer" className="btn-map">
                    <span className="icon-xs">{Icons.externalLink}</span>
                  </a>
                )}
              </div>
            </div>
            <div className="mini-map-box">
              <AuditMiniMap log={log} />
            </div>
          </div>
        )}

      </div>
      <style jsx>{`
        .soc-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
          border-left: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .panel-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
        }
        .panel-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 0 20px 20px 20px;
        }
        
        .soc-section {
          padding: 16px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .soc-section.no-border { border-bottom: none; }
        .section-title {
          margin: 0 0 12px 0;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .section-title.no-border { margin-bottom: 0; }
        
        .soc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .soc-data {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .col-span-2 { grid-column: 1 / -1; }
        
        .soc-label {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          text-transform: uppercase;
        }
        .soc-value {
          font-size: 13px;
          color: #0f172a;
          font-weight: 500;
          word-break: break-all;
        }
        
        .capitalize { text-transform: capitalize; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .text-xs { font-size: 11px; }
        .text-strong { font-weight: 700; color: #0f172a; }
        .text-green { color: #10b981; }
        .text-red { color: #ef4444; }
        .line-clamp {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .employee-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #f8fafc;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .emp-avatar {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          background: #e0e7ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
        }
        .emp-info { display: flex; flex-direction: column; }
        .emp-name { font-size: 14px; font-weight: 700; color: #0f172a; }
        .emp-user { font-size: 12px; color: #64748b; }
        .emp-meta { font-size: 11px; color: #94a3b8; margin-top: 2px; }

        .status-badge {
          display: inline-flex;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .badge-allowed, .badge-granted { background: #dcfce7; color: #166534; }
        .badge-denied { background: #fee2e2; color: #991b1b; }
        .badge-bypassed { background: #f3e8ff; color: #6b21a8; }
        .badge-error, .badge-unknown { background: #f1f5f9; color: #475569; }

        .map-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .map-actions { display: flex; gap: 4px; }
        .btn-map {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
        }
        .btn-map:hover { background: #f1f5f9; color: #0f172a; }
        .icon-xs { width: 14px; height: 14px; }
        .mini-map-box {
          height: 240px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
      `}</style>
    </div>
  );
}
