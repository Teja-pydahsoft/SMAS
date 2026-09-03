import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AdminIcon from '@/components/admin/AdminIcons';
import { api } from '@/lib/api/client';

export default function VehicleTypesModal({ isOpen, onClose, onTypesUpdated }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Add / Edit Form state
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', isActive: true });
  const [saving, setSaving] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.vehicles.types.list();
      setTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load vehicle types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTypes();
      setShowForm(false);
      setEditingType(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenForm = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({ name: type.name, description: type.description || '', isActive: type.isActive });
    } else {
      setEditingType(null);
      setFormData({ name: '', description: '', isActive: true });
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingType(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      if (editingType) {
        await api.vehicles.types.update(editingType._id, formData);
      } else {
        await api.vehicles.types.create(formData);
      }
      setShowForm(false);
      setEditingType(null);
      await fetchTypes();
      if (onTypesUpdated) onTypesUpdated();
    } catch (err) {
      alert(err.message || 'Failed to save vehicle type');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (type) => {
    try {
      await api.vehicles.types.update(type._id, { ...type, isActive: !type.isActive });
      await fetchTypes();
      if (onTypesUpdated) onTypesUpdated();
    } catch (err) {
      alert(err.message || 'Failed to update type status');
    }
  };

  const filteredTypes = types.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      <style dangerouslySetInnerHTML={{__html: `
        .types-modal-container {
          position: relative;
          z-index: 1101;
          width: 95%;
          max-width: 920px;
          max-height: 65vh;
          display: flex;
          flex-direction: column;
          border-radius: 16px;
          overflow: hidden;
          padding: 0;
          box-shadow: 0 25px 60px rgba(0,0,0,0.35);
          background: var(--surface-base);
          border: 1px solid var(--border-color);
        }
        .types-desktop-table { display: block; }
        .types-mobile-cards { display: none; }

        @media (max-width: 768px) {
          .types-modal-container {
            width: 94% !important;
            max-height: 65vh !important;
            border-radius: 12px !important;
          }
          .types-modal-header {
            padding: 0.85rem 1rem !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.6rem !important;
            position: relative !important;
          }
          .types-modal-close-btn {
            position: absolute !important;
            top: 0.65rem !important;
            right: 0.65rem !important;
          }
          .types-modal-body {
            padding: 0.85rem 1rem !important;
          }
          .types-search-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.5rem !important;
          }
          .types-search-input-wrap {
            max-width: 100% !important;
          }
          .types-desktop-table { display: none !important; }
          .types-mobile-cards { display: flex !important; flex-direction: column !important; gap: 0.4rem !important; }
          .types-card-sm {
            background: var(--surface-base);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 0.5rem 0.65rem;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }
        }
      `}} />

      <div className="types-modal-container">
        {/* Header */}
        <div className="types-modal-header" style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-elevated)' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Define Vehicle Types</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Manage and configure all vehicle type classifications</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {!showForm && (
              <button 
                className="admin-btn admin-btn--primary" 
                onClick={() => handleOpenForm()}
                style={{ padding: '0.4rem 0.95rem', fontSize: '0.8125rem', fontWeight: 600 }}
              >
                + Create New Type
              </button>
            )}
            <button 
              onClick={onClose} 
              className="admin-btn admin-btn--ghost types-modal-close-btn" 
              style={{ padding: '4px 8px', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="types-modal-body" style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {showForm ? (
            <div style={{ backgroundColor: 'var(--surface-inset)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                {editingType ? 'Edit Vehicle Type' : 'Create New Vehicle Type'}
              </h3>
              <form onSubmit={handleSave}>
                <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Type Name *</label>
                  <input 
                    type="text" 
                    className="admin-input" 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    required 
                    placeholder="e.g. Tipper Truck, Crane, Loader, Excavator"
                    disabled={editingType?.metadata?.isSystem}
                    style={{ fontSize: '0.9rem', padding: '0.55rem 0.75rem' }}
                  />
                  {editingType?.metadata?.isSystem && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.35rem', display: 'block' }}>
                      System types cannot be renamed.
                    </span>
                  )}
                </div>

                <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Description</label>
                  <textarea 
                    className="admin-input" 
                    rows="3" 
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                    placeholder="Provide details about specs, load capacity, or usage for this type..."
                    style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }}
                  />
                </div>

                <div className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <input 
                    type="checkbox" 
                    id="isActiveModal" 
                    checked={formData.isActive} 
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })} 
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="isActiveModal" style={{ margin: 0, fontSize: '0.9rem', cursor: 'pointer', fontWeight: 500 }}>Active Status</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button type="button" className="admin-btn admin-btn--ghost" onClick={handleCloseForm} style={{ padding: '0.4rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={saving} style={{ padding: '0.4rem 1.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    {saving ? 'Saving...' : 'Save Vehicle Type'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Search & Counter Bar */}
              <div className="types-search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="types-search-input-wrap" style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                  <input 
                    type="text" 
                    className="admin-input" 
                    placeholder="Search vehicle types..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '2.4rem', height: '36px', fontSize: '0.85rem' }}
                  />
                  <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <AdminIcon name="search" />
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Total Types: <strong style={{ color: 'var(--text-primary)' }}>{filteredTypes.length}</strong>
                </span>
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="types-desktop-table" style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflowX: 'auto', background: 'var(--surface-base)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: '550px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'left', color: 'var(--text-primary)' }}>TYPE NAME</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'left', color: 'var(--text-primary)' }}>DESCRIPTION</th>
                      <th style={{ padding: '0.75rem 1rem', width: '110px', fontWeight: 700, textAlign: 'left', color: 'var(--text-primary)' }}>STATUS</th>
                      <th style={{ padding: '0.75rem 1rem', width: '130px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '2.5rem' }}>
                          <div className="dash-loading__spinner" style={{ margin: '0 auto' }}></div>
                        </td>
                      </tr>
                    ) : filteredTypes.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          No vehicle types found. Click "+ Create New Type" to define one.
                        </td>
                      </tr>
                    ) : (
                      filteredTypes.map(type => (
                        <tr key={type._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ fontWeight: 700, padding: '0.85rem 1rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{type.name}</td>
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                            {type.description || <span className="text-muted" style={{ fontStyle: 'italic' }}>No description provided</span>}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className={`admin-badge admin-badge--${type.isActive ? 'success' : 'secondary'}`} style={{ padding: '3px 8px', fontSize: '0.75rem' }}>
                              {type.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button 
                                className="admin-btn admin-btn--sm admin-btn--ghost" 
                                onClick={() => handleOpenForm(type)}
                                style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                              >
                                Edit
                              </button>
                              <button 
                                className={`admin-btn admin-btn--sm ${type.isActive ? 'admin-btn--danger' : 'admin-btn--secondary'}`} 
                                onClick={() => toggleStatus(type)}
                                disabled={type.metadata?.isSystem && type.isActive} 
                                style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                              >
                                {type.isActive ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS VIEW */}
              <div className="types-mobile-cards">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="dash-loading__spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : filteredTypes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No vehicle types found. Click "+ Create New Type" to define one.
                  </div>
                ) : (
                  filteredTypes.map(type => (
                    <div key={`mob-${type._id}`} className="types-card-sm">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        {/* Left Info: Name & Description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{type.name}</span>
                            <span className={`admin-badge admin-badge--${type.isActive ? 'success' : 'secondary'}`} style={{ padding: '2px 6px', fontSize: '0.68rem' }}>
                              {type.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {type.description || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No description provided</span>}
                          </div>
                        </div>

                        {/* Right Actions: Edit & Disable buttons */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                          <button 
                            className="admin-btn admin-btn--sm admin-btn--ghost" 
                            onClick={() => handleOpenForm(type)}
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button 
                            className={`admin-btn admin-btn--sm ${type.isActive ? 'admin-btn--danger' : 'admin-btn--secondary'}`} 
                            onClick={() => toggleStatus(type)}
                            disabled={type.metadata?.isSystem && type.isActive} 
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          >
                            {type.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--surface-elevated)' }}>
          <button className="admin-btn admin-btn--secondary" onClick={onClose} style={{ padding: '0.4rem 1.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
