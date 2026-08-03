import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function AuditMiniMap({ log }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already init

    const userLat = log.latitude;
    const userLng = log.longitude;
    const locLat = log.matchedLatitude;
    const locLng = log.matchedLongitude;
    const radius = log.configuredRadius || 0;

    // We center between the two points, or just on the location
    const centerLat = (userLat + locLat) / 2;
    const centerLng = (userLng + locLng) / 2;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([centerLat, centerLng], 14);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(map);

    // Permitted Location Circle
    const circle = L.circle([locLat, locLng], {
      color: '#0ea5e9', // Blue
      fillColor: '#0ea5e9',
      fillOpacity: 0.1,
      radius: radius,
      weight: 2,
    }).addTo(map);

    // Location Marker (Blue)
    const locIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color:#0ea5e9;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    L.marker([locLat, locLng], { icon: locIcon })
      .bindPopup(`<b>${log.matchedLocationName || 'Permitted Location'}</b>`)
      .addTo(map);

    // User Marker (Red for Denied, Green for Allowed)
    const decision = log.decision || log.result || 'unknown';
    const color = decision === 'allowed' ? '#22c55e' : decision === 'denied' ? '#ef4444' : '#f59e0b';
    const userIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5); z-index:1000;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 })
      .bindPopup(`<b>User Location</b><br/>Distance: ${log.calculatedDistance}m`)
      .addTo(map);

    // Line connecting the two
    const latlngs = [
      [locLat, locLng],
      [userLat, userLng]
    ];
    L.polyline(latlngs, { color: color, weight: 2, dashArray: '5, 5' }).addTo(map);

    // Fit bounds to show both markers + circle
    const bounds = circle.getBounds();
    bounds.extend([userLat, userLng]);
    map.fitBounds(bounds, { padding: [20, 20] });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [log]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
