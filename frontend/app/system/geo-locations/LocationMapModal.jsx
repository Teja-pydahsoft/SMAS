'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
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
  
  const [mapLayer, setMapLayer] = useState('street');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

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
    <div className="pass-modal-overlay" style={{ zIndex: 9999 }} role="dialog" aria-modal="true">
      <div 
        className="pass-modal" 
        style={{ 
          maxWidth: isFullscreen ? '98vw' : 1100, 
          width: '95vw', 
          height: isFullscreen ? '95vh' : 'auto',
          maxHeight: '95vh',
          display: 'flex', 
          flexDirection: 'column',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        <div className="pass-modal__header">
          <h3 className="pass-modal__title">{location ? 'Edit Location' : 'New Location'}</h3>
          <button type="button" className="pass-modal__close" onClick={onClose} disabled={saving}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="pass-modal__body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: isFullscreen ? '1rem' : '1.5rem' }}>
          {successMsg && (
            <div style={{ backgroundColor: 'var(--success)', color: 'white', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', marginBottom: '1rem', textAlign: 'center', fontWeight: 'bold' }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isFullscreen ? '300px 1fr' : '1fr 1.5fr', 
              gap: '1.5rem', 
              alignItems: 'stretch',
              flex: 1 
            }}>
              
              {/* Left Column: Form Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                <div className="form-group">
                  <label htmlFor="loc-name">Location Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    id="loc-name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="e.g. Headquarters" 
                    required
                  />
                </div>

                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Search Address</label>
                  <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    placeholder="Search factories, companies, landmarks..." 
                    style={{ 
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      fontSize: '0.95rem'
                    }}
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
                  <label htmlFor="loc-address">Resolved Address (Optional)</label>
                  <textarea 
                    id="loc-address" 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    placeholder="e.g. 123 Main St, City" 
                    rows={2}
                  />
                </div>
                
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label htmlFor="loc-radius-num" style={{ margin: 0 }}>Radius <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input 
                      id="loc-radius-num" 
                      type="number"
                      min="10" max="100000"
                      value={radius} 
                      onChange={(e) => setRadius(Number(e.target.value))} 
                      required
                      style={{ width: '80px', padding: '0.25rem', textAlign: 'right' }}
                    />
                  </div>
                  <input 
                    type="range"
                    min="10" max="5000" step="10"
                    value={radius > 5000 ? 5000 : radius} 
                    onChange={(e) => setRadius(Number(e.target.value))} 
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {[100, 250, 500, 1000].map(val => (
                      <button 
                        type="button" 
                        key={val}
                        onClick={() => setRadius(val)}
                        style={{ 
                          fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
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

                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="checkbox-option">
                    <input 
                      type="checkbox" 
                      checked={isActive} 
                      onChange={(e) => setIsActive(e.target.checked)} 
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div style={{ marginTop: 'auto', padding: '1rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <strong>Selected Coordinates:</strong><br />
                  Lat: {center.lat.toFixed(6)}<br />
                  Lng: {center.lng.toFixed(6)}
                </div>
              </div>

              {/* Right Column: Map */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={useCurrentLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    Use Current Location
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn-secondary btn-sm" onClick={handleResetView}>
                      Reset View
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setIsFullscreen(!isFullscreen)}>
                      {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                  </div>
                </div>

                  <div style={{ flex: 1, minHeight: isFullscreen ? '100%' : '400px', width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                  
                  {/* Layer Switcher */}
                  <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
                    <div style={{ position: 'relative' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowLayerMenu(!showLayerMenu)}
                        style={{
                          background: 'white',
                          border: '2px solid rgba(0,0,0,0.2)',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: '#333'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                        Layers
                      </button>
                      
                      {showLayerMenu && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: '4px',
                          background: 'white',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                          width: '130px',
                          overflow: 'hidden'
                        }}>
                          <button 
                            type="button"
                            onClick={() => { setMapLayer('street'); setShowLayerMenu(false); }}
                            style={{
                              display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                              background: mapLayer === 'street' ? '#f0f0f0' : 'white',
                              border: 'none', borderBottom: '1px solid #eee', cursor: 'pointer',
                              fontSize: '13px', color: '#333'
                            }}
                          >
                            Street Map
                          </button>
                          <button 
                            type="button"
                            onClick={() => { setMapLayer('satellite'); setShowLayerMenu(false); }}
                            style={{
                              display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                              background: mapLayer === 'satellite' ? '#f0f0f0' : 'white',
                              border: 'none', cursor: 'pointer',
                              fontSize: '13px', color: '#333'
                            }}
                          >
                            Satellite
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
                    {mapLayer === 'street' ? (
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                    ) : (
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      />
                    )}
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

            {error && <p className="error-msg" style={{ marginTop: '1.5rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
              <button type="submit" className="btn-primary" disabled={saving || successMsg}>
                {saving ? 'Saving...' : 'Save Location'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving || successMsg}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
