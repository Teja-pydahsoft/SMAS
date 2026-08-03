'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import dynamic from 'next/dynamic';

const LocationMapModal = dynamic(() => import('./LocationMapModal'), { 
  ssr: false, 
  loading: () => (
    <div className="pass-modal-overlay">
      <div className="pass-modal" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, width: 600 }}>
        <div className="login-spinner"><span /><span /><span /><span /></div>
      </div>
    </div>
  )
});

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MapIllustration() {
  return (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.8 }}>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
      <circle cx="12" cy="11" r="2" fill="var(--primary)" />
      <path d="M12 11c-1.5-2-3-4-3-6a3 3 0 0 1 6 0c0 2-1.5 4-3 6z" />
    </svg>
  );
}

export default function LocationsTab({ canWrite }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      setLoading(true);
      setError('');
      const data = await api.geoLocations.list();
      setLocations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(loc) {
    if (!canWrite) return;
    try {
      await api.geoLocations.update(loc._id, { isActive: !loc.isActive });
      loadLocations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(loc) {
    if (!canWrite) return;
    if (!confirm(`Are you sure you want to delete ${loc.name}?`)) return;
    try {
      await api.geoLocations.delete(loc._id);
      loadLocations();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSave(savedLoc) {
    setShowModal(false);
    setSelectedLocation(null);
    loadLocations();
  }

  const filteredLocations = locations.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    (l.address && l.address.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading && locations.length === 0) return <div className="card empty-state"><p>Loading locations...</p></div>;

  return (
    <div className="card" style={{ minHeight: '60vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="section-title">Permitted Locations</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {locations.length > 0 && (
            <input 
              type="text" 
              placeholder="Search locations..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            />
          )}
          {canWrite && locations.length > 0 && (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => { setSelectedLocation(null); setShowModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <PlusIcon />
              New Location
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
      {!canWrite && locations.length > 0 && <p className="read-only-banner">View only — location changes require write access.</p>}

      {locations.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', textAlign: 'center' }}>
          <MapIllustration />
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text)' }}>No Geo Locations Configured</h4>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: 400 }}>
            Create geographic boundaries to restrict where users can log in from.
          </p>
          {canWrite && (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => { setSelectedLocation(null); setShowModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '1rem' }}
            >
              <PlusIcon />
              Create your first location
            </button>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Location Name</th>
                <th>Address</th>
                <th>Radius</th>
                <th>Assigned Users</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map((loc) => (
                <tr key={loc._id} className={!loc.isActive ? 'row-inactive' : undefined}>
                  <td className="name-cell">{loc.name}</td>
                  <td>
                    {loc.address ? (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={loc.address}>
                        {loc.address}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>{loc.radius}m</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                      {loc.assignedUsersCount}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${loc.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {loc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{new Date(loc.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => { setSelectedLocation(loc); setShowModal(true); }}
                    >
                      {canWrite ? 'Edit' : 'View'}
                    </button>
                    {canWrite && (
                      <>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => handleToggleActive(loc)}>
                          {loc.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="btn-danger btn-sm" onClick={() => handleDelete(loc)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLocations.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No matching locations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <LocationMapModal 
          location={selectedLocation} 
          existingLocations={locations}
          onClose={() => { setShowModal(false); setSelectedLocation(null); }} 
          onSave={handleSave} 
        />
      )}
    </div>
  );
}
