"use client";

import React, { useState, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import AdminIcon from '@/components/admin/AdminIcons';
import { api } from '@/lib/api/client';

export default function VehicleTypesPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', isActive: true });
  const [saving, setSaving] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const data = await api.vehicles.types.list();
      setTypes(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load vehicle types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const handleOpenModal = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({ name: type.name, description: type.description || '', isActive: type.isActive });
    } else {
      setEditingType(null);
      setFormData({ name: '', description: '', isActive: true });
    }
    setIsModalOpen(true);
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
      setIsModalOpen(false);
      fetchTypes();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (type) => {
    try {
      await api.vehicles.types.update(type._id, { ...type, isActive: !type.isActive });
      fetchTypes();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredTypes = types.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <PageShell 
      title="Vehicle Types Master" 
      description="Manage equipment classifications for AI Learning"
      toolbar={
        <button className="admin-btn admin-btn--primary" onClick={() => handleOpenModal()}>
          + Create New Type
        </button>
      }
    >
      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      <div className="admin-panel glass-panel admin-fade-in" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <input 
              type="text" 
              className="admin-input" 
              placeholder="Search types..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
            <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <AdminIcon name="search" />
            </div>
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type Name</th>
                <th>Description</th>
                <th>Status</th>
                <th style={{ width: '120px' }}>Created</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="dash-loading__spinner" style={{ margin: '0 auto' }}></div>
                  </td>
                </tr>
              ) : filteredTypes.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No vehicle types found.
                  </td>
                </tr>
              ) : (
                filteredTypes.map(type => (
                  <tr key={type._id}>
                    <td style={{ fontWeight: 'bold' }}>{type.name}</td>
                    <td>{type.description || <span className="text-muted">No description</span>}</td>
                    <td>
                      <span className={`admin-badge admin-badge--${type.isActive ? 'success' : 'secondary'}`}>
                        {type.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>{new Date(type.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => handleOpenModal(type)}>
                          Edit
                        </button>
                        <button 
                          className={`admin-btn admin-btn--sm ${type.isActive ? 'admin-btn--danger' : 'admin-btn--secondary'}`} 
                          onClick={() => toggleStatus(type)}
                          disabled={type.metadata?.isSystem && type.isActive} 
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
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="admin-panel glass-panel admin-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>
              {editingType ? 'Edit Vehicle Type' : 'Create Vehicle Type'}
            </h2>
            <form onSubmit={handleSave}>
              <div className="admin-form-group">
                <label>Type Name *</label>
                <input 
                  type="text" 
                  className="admin-input" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  required 
                  disabled={editingType?.metadata?.isSystem}
                />
                {editingType?.metadata?.isSystem && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.25rem', display: 'block' }}>System types cannot be renamed.</span>
                )}
              </div>
              <div className="admin-form-group">
                <label>Description</label>
                <textarea 
                  className="admin-input" 
                  rows="3" 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                />
              </div>
              <div className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="isActive" 
                  checked={formData.isActive} 
                  onChange={e => setFormData({...formData, isActive: e.target.checked})} 
                />
                <label htmlFor="isActive" style={{ margin: 0 }}>Active</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
