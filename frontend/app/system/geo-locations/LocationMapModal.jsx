'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationSearchService } from '@/lib/services/LocationSearchService';

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Calculate distance between two coordinates in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; 
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function MapController({ center, zoom, isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { animate: true, duration: 0.5 });
  }, [center, zoom, map]);

  useEffect(() => {
    map.invalidateSize();
  }, [isFullscreen, map]);
  return null;
}

function MapEvents({ onLocationSelected }) {
  useMapEvents({
    click(e) {
      onLocationSelected({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function LocationMapModal({ location, existingLocations = [], onClose, onSave }) {
  const [name, setName] = useState(location?.name || '');
  const [address, setAddress] = useState(location?.address || '');
  const [radius, setRadius] = useState(location?.radius || 100);
  const [isActive, setIsActive] = useState(location ? location.isActive : true);
  
  const defaultCenter = { lat: 51.505, lng: -0.09 };
  const [center, setCenter] = useState(
    location ? { lat: location.latitude, lng: location.longitude } : defaultCenter
  );
  
  const [zoom, setZoom] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounced search for Geoapify
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(true);
      // Prevent searching again immediately after selecting a coordinate result
      if (searchQuery.trim().endsWith('(Coordinates)')) {
        setSearchResults([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }
      
      // Check if search query is a coordinate pair (lat, lng)
      const coordMatch = searchQuery.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          setSearchResults([{
            id: 'coord',
            name: `${lat}, ${lng} (Coordinates)`,
            formattedAddress: 'Jump to coordinates',
            latitude: lat,
            longitude: lng
          }]);
          setIsSearching(false);
          return;
        }
      }

      const results = await LocationSearchService.search(searchQuery);
      setSearchResults(results.map(LocationSearchService.formatSuggestion));
      setIsSearching(false);
    }, 400); // 400ms debounce
    
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  const handleSelectResult = (result) => {
    setCenter({ lat: result.latitude, lng: result.longitude });
    setAddress(result.formattedAddress);
    setSearchQuery(result.name);
    setSearchResults([]);
    setHasSearched(false);
    setZoom(17);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(17);
        setError('');
      },
      () => setError('Unable to retrieve your location. Please check browser permissions.')
    );
  };

  const handleResetView = () => {
    if (location) {
      setCenter({ lat: location.latitude, lng: location.longitude });
    } else {
      setCenter(defaultCenter);
    }
    setZoom(15);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Location name is required');
    if (!center.lat || !center.lng) return setError('Please select a point on the map');
    if (radius < 10) return setError('Radius must be at least 10 meters');

    // Duplicate check
    const isDuplicate = existingLocations.some(loc => {
      if (location && loc._id === location._id) return false; // skip self
      const dist = haversineDistance(center.lat, center.lng, loc.latitude, loc.longitude);
      return dist < 5 && loc.radius === Number(radius);
    });

    if (isDuplicate) {
      if (!confirm('A very similar location already exists. Are you sure you want to create a duplicate?')) {
        return;
      }
    }

    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      latitude: center.lat,
      longitude: center.lng,
      radius: Number(radius),
      address: address.trim(),
      isActive
    };

    try {
      let saved;
      if (location) {
        saved = await api.geoLocations.update(location._id, payload);
      } else {
        saved = await api.geoLocations.create(payload);
      }
      setSuccessMsg('Location saved successfully!');
      setTimeout(() => {
        onSave(saved);
      }, 1000);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="pass-modal-overlay" style={{ 
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999, 
      backgroundColor: 'rgba(255, 255, 255, 0.4)', 
      backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end'
    }} role="dialog" aria-modal="true">
      <style>{`
        @media (max-width: 768px) {
          .loc-workspace-grid {
            display: flex !important;
            flex-direction: column !important;
          }
          .loc-workspace-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid var(--border) !important;
          }
        }
      `}</style>
      
      <div 
        className="admin-panel glass-panel" 
        style={{ 
          width: '100%', 
          maxWidth: isFullscreen ? '100vw' : '1100px', 
          height: '100vh',
          display: 'flex', 
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          borderTopLeftRadius: isFullscreen ? '0' : '16px',
          borderBottomLeftRadius: isFullscreen ? '0' : '16px',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
          transition: 'all 0.3s ease',
          backgroundColor: 'var(--bg)',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div style={{ 
          padding: '1.25rem 1.5rem', 
          borderBottom: '1px solid var(--border)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: 'var(--bg-inset)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              width: '40px', height: '40px', borderRadius: '10px', 
              backgroundColor: 'var(--primary-light, rgba(37, 99, 235, 0.1))', 
              color: 'var(--primary, #2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--text)' }}>
                {location ? 'Edit Location' : 'New Location'}
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Define an access-controlled geographic location.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '0.5rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {successMsg && (
            <div style={{ backgroundColor: 'var(--success)', color: 'white', padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="loc-workspace-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: isFullscreen ? '1fr' : 'clamp(350px, 40%, 450px) 1fr', 
              flex: 1,
              minHeight: 0
            }}>
              
              {/* Left Column: Form Details */}
              <div className="loc-workspace-sidebar" style={{ 
                display: isFullscreen ? 'none' : 'flex', 
                flexDirection: 'column', gap: '2rem', 
                overflowY: 'auto', padding: '1.5rem', borderRight: '1px solid var(--border)' 
              }}>
                
                {/* SECTION: LOCATION DETAILS */}
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: '600' }}>Location Details</h4>
                  
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label htmlFor="loc-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Location Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input 
                      id="loc-name" className="admin-input"
                      value={name} onChange={(e) => setName(e.target.value)} 
                      placeholder="e.g. Headquarters" required
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                    />
                  </div>

                  <div className="form-group" style={{ position: 'relative', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Search Address</label>
                    <input 
                      type="text" className="admin-input"
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
                      placeholder="Search factories, companies, landmarks..." 
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                    />
                    <div style={{ position: 'absolute', right: '12px', top: '38px', color: 'var(--text-muted)' }}>
                      {isSearching ? (
                        <div className="login-spinner" style={{ transform: 'scale(0.5)', marginTop: '-8px' }}><span /><span /><span /><span /></div>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <ul style={{ 
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, 
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                        listStyle: 'none', margin: 0, padding: 0, boxShadow: 'var(--shadow-md)', maxHeight: 250, overflowY: 'auto' 
                      }}>
                        {searchResults.map(res => (
                          <li key={res.id} 
                            onClick={() => handleSelectResult(res)}
                            style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-inset)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <div style={{ fontWeight: '500', color: 'var(--text)' }}>{res.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.formattedAddress}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {hasSearched && !isSearching && searchResults.length === 0 && searchQuery.length >= 3 && (
                      <div style={{ 
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, 
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                        padding: '0.75rem', boxShadow: 'var(--shadow-md)', fontSize: '0.85rem', color: 'var(--text-muted)' 
                      }}>
                        No matching location found.
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="loc-address" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Resolved Address (Optional)</label>
                    <textarea 
                      id="loc-address" className="admin-input"
                      value={address} onChange={(e) => setAddress(e.target.value)} 
                      placeholder="e.g. 123 Main St, City" rows={2}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* SECTION: ACCESS AREA */}
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: '600' }}>Access Area</h4>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label htmlFor="loc-radius-num" style={{ margin: 0, fontWeight: '500', fontSize: '0.9rem' }}>Radius <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input 
                        id="loc-radius-num" className="admin-input"
                        type="number" min="10" max="100000"
                        value={radius} onChange={(e) => setRadius(Number(e.target.value))} required
                        style={{ width: '90px', padding: '0.3rem', textAlign: 'right', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                      />
                    </div>
                    <input 
                      type="range" min="10" max="5000" step="10"
                      value={radius > 5000 ? 5000 : radius} 
                      onChange={(e) => setRadius(Number(e.target.value))} 
                      style={{ width: '100%', cursor: 'pointer', margin: '0.5rem 0' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {[100, 250, 500, 1000].map(val => (
                        <button 
                          type="button" key={val} onClick={() => setRadius(val)} className="admin-badge"
                          style={{ 
                            fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
                            background: radius === val ? 'var(--primary)' : 'var(--bg-inset)',
                            color: radius === val ? 'white' : 'var(--text)',
                            border: '1px solid', borderColor: radius === val ? 'var(--primary)' : 'var(--border)'
                          }}
                        >
                          {val >= 1000 ? `${val/1000}km` : `${val}m`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SECTION: STATUS */}
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: '600' }}>Status</h4>
                  <div className="form-group">
                    <label className="checkbox-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} 
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontWeight: '500' }}>Active</span>
                    </label>
                  </div>
                </div>

                {/* SECTION: SELECTED LOCATION */}
                <div style={{ marginTop: 'auto' }}>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: '600' }}>Selected Location</h4>
                  <div style={{ padding: '1rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span>Latitude:</span>
                      <strong style={{ color: 'var(--text)' }}>{center.lat.toFixed(6)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Longitude:</span>
                      <strong style={{ color: 'var(--text)' }}>{center.lng.toFixed(6)}</strong>
                    </div>
                  </div>
                  {error && <p className="error-msg" style={{ marginTop: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
                </div>
                
              </div>

              {/* Right Column: Map */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, padding: '1.5rem', backgroundColor: 'var(--bg-inset)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={useCurrentLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    Use Current Location
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={handleResetView} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                      Reset View
                    </button>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setIsFullscreen(!isFullscreen)} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', position: 'relative' }}>
                  <MapContainer center={center} zoom={zoom} maxZoom={22} style={{ height: '100%', width: '100%' }}>
                    <LayersControl position="topright">
                      <LayersControl.BaseLayer checked={true} name="Satellite (Google Hybrid)">
                        <TileLayer
                          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                          attribution="&copy; Google"
                          maxZoom={22}
                          maxNativeZoom={21}
                        />
                      </LayersControl.BaseLayer>
                      <LayersControl.BaseLayer name="Street (OpenStreetMap)">
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          maxZoom={22}
                          maxNativeZoom={19}
                        />
                      </LayersControl.BaseLayer>
                    </LayersControl>
                    <Marker 
                      position={center} 
                      draggable={true} 
                      eventHandlers={{
                        dragend: (e) => {
                          const marker = e.target;
                          const position = marker.getLatLng();
                          setCenter({ lat: position.lat, lng: position.lng });
                        },
                      }}
                    />
                    <Circle 
                      center={center} 
                      radius={radius} 
                      pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.2 }}
                    />
                    <MapEvents onLocationSelected={setCenter} />
                    <MapController center={center} zoom={zoom} isFullscreen={isFullscreen} />
                  </MapContainer>
                </div>
              </div>

            </div>

            {/* FOOTER */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: 'var(--bg)',
              zIndex: 10
            }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Location coordinates will be used for access validation.
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="admin-btn" onClick={onClose} disabled={saving || successMsg} style={{ padding: '0.5rem 1rem' }}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || successMsg} style={{ padding: '0.5rem 1rem' }}>
                  {saving ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
