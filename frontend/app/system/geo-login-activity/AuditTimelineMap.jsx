'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const Icons = {
  desktop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
};

export default function AuditTimelineMap({ logs, selectedLog, onSelectLog, locations = [] }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([20, 0], 2);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(mapRef.current);

    setMapReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach(({ marker, circle, line }) => {
      if (marker) marker.remove();
      if (circle) circle.remove();
      if (line) line.remove();
    });
    markersRef.current = {};

    const bounds = L.latLngBounds();
    let addedCount = 0;

    logs.forEach(log => {
      if (!log.latitude || !log.longitude) return;

      const pos = [log.latitude, log.longitude];
      
      const isSelected = selectedLog?._id === log._id;
      const color = log.decision === 'granted' || log.decision === 'allowed' ? '#10b981' : 
                   log.decision === 'denied' ? '#ef4444' : '#64748b';

      const iconHtml = `
        <div style="
          width: ${isSelected ? '20px' : '12px'}; 
          height: ${isSelected ? '20px' : '12px'}; 
          background: ${color}; 
          border: 2px solid white; 
          border-radius: 50%;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
          transition: all 0.2s;
        "></div>
      `;

      const marker = L.marker(pos, {
        icon: L.divIcon({ html: iconHtml, className: '', iconSize: [isSelected ? 20 : 12, isSelected ? 20 : 12] }),
        zIndexOffset: isSelected ? 1000 : 0
      }).addTo(mapRef.current);

      marker.on('click', () => {
        onSelectLog(log);
      });

      markersRef.current[log._id] = { marker };
      bounds.extend(pos);
      addedCount++;
    });

    // Draw extra details for selected log
    if (selectedLog) {
      const { latitude, longitude, matchedLatitude, matchedLongitude, configuredRadius } = selectedLog;
      if (latitude && longitude && matchedLatitude && matchedLongitude) {
        const userPos = [latitude, longitude];
        const assignedPos = [matchedLatitude, matchedLongitude];

        const assignedIcon = L.divIcon({
          html: `<div style="width: 16px; height: 16px; background: #3b82f6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
          className: '',
          iconSize: [16, 16]
        });

        const assignedMarker = L.marker(assignedPos, { icon: assignedIcon }).addTo(mapRef.current);
        
        let circle = null;
        if (configuredRadius) {
          circle = L.circle(assignedPos, {
            radius: configuredRadius,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            weight: 1,
            dashArray: '4'
          }).addTo(mapRef.current);
        }

        const line = L.polyline([userPos, assignedPos], {
          color: '#64748b',
          weight: 2,
          dashArray: '4'
        }).addTo(mapRef.current);

        markersRef.current['selected_details'] = { marker: assignedMarker, circle, line };
        bounds.extend(assignedPos);
      }
    }

    // Draw all saved locations with a subtle outline
    if (locations && locations.length > 0) {
      locations.forEach(loc => {
        if (!loc.latitude || !loc.longitude) return;
        const locPos = [loc.latitude, loc.longitude];
        const circle = L.circle(locPos, {
          radius: loc.radius || 100,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          weight: 1,
          dashArray: '4'
        }).addTo(mapRef.current);

        const iconHtml = `<div style="width: 12px; height: 12px; background: #3b82f6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        const marker = L.marker(locPos, {
          icon: L.divIcon({ html: iconHtml, className: '', iconSize: [12, 12] })
        }).addTo(mapRef.current);

        // Bind tooltip
        marker.bindTooltip(`<b>${loc.name}</b><br>Radius: ${loc.radius || 100}m`, {
          direction: 'top',
          offset: [0, -10]
        });

        markersRef.current[`loc_${loc._id}`] = { circle, marker };
        
        if (!selectedLog) {
          bounds.extend(locPos);
        }
      });
    }

    if (addedCount > 0 || (locations && locations.length > 0)) {
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
  }, [logs, locations, mapReady, selectedLog, onSelectLog]);

  useEffect(() => {
    // Only fly if a specific marker was clicked, but we already fitBounds in the main effect
  }, [selectedLog, mapReady]);

  return (
    <div className="timeline-map-container">
      <div className="map-area" ref={containerRef} />
      <div className="timeline-area">
        <h4 className="timeline-header">Audit Timeline</h4>
        <div className="timeline-scroll">
          {logs.map(log => {
            const isSelected = selectedLog?._id === log._id;
            const decision = log.decision || log.result || 'unknown';
            
            return (
              <div 
                key={log._id} 
                className={`timeline-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectLog(log)}
              >
                <div className={`timeline-indicator bg-${decision}`} />
                <div className="timeline-content">
                  <div className="timeline-top">
                    <span className="time">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <span className={`status badge-${decision}`}>{decision.toUpperCase()}</span>
                  </div>
                  <div className="timeline-user">
                    <strong>{log.userDisplayName || log.userUsername}</strong>
                  </div>
                  <div className="timeline-meta">
                    <span className="icon-xs">{log.loginSource === 'mobile' ? Icons.mobile : Icons.desktop}</span>
                    <span>{log.deviceName || log.operatingSystem || 'Unknown Device'}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {logs.length === 0 && (
             <div className="empty-timeline">No geographic events found.</div>
          )}
        </div>
      </div>
      <style jsx>{`
        .timeline-map-container {
          display: flex;
          width: 100%;
          height: calc(100vh - 200px);
          min-height: 500px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        .map-area {
          flex: 1;
          height: 100%;
          z-index: 1;
        }
        .timeline-area {
          width: 320px;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-left: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .timeline-header {
          margin: 0;
          padding: 16px;
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .timeline-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .timeline-item {
          display: flex;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .timeline-item:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .timeline-item.selected {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
          background: #eff6ff;
        }
        
        .timeline-indicator {
          width: 4px;
          border-radius: 4px;
          margin-right: 12px;
          flex-shrink: 0;
        }
        .bg-allowed, .bg-granted { background: #10b981; }
        .bg-denied { background: #ef4444; }
        .bg-bypassed { background: #8b5cf6; }
        .bg-unknown, .bg-error { background: #64748b; }

        .timeline-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .timeline-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .time {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        .status {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }
        .badge-allowed, .badge-granted { background: #dcfce7; color: #166534; }
        .badge-denied { background: #fee2e2; color: #991b1b; }
        .badge-bypassed { background: #f3e8ff; color: #6b21a8; }
        
        .timeline-user {
          font-size: 13px;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .timeline-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #64748b;
        }
        .icon-xs { width: 12px; height: 12px; display: flex; }
        
        .empty-timeline {
          padding: 24px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
