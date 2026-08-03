'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

function UserAssignmentModal({ user, locations, onClose, onSave }) {
  const [selectedIds, setSelectedIds] = useState(user.allowedLocationIds?.map(l => l._id || l) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleLocation(id) {
    setSelectedIds((prev) => 
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Use the dedicated geo-locations user assignment endpoint
      const updatedLocations = await api.geoLocations.assignUserLocations(user._id, selectedIds);
      onSave({ ...user, allowedLocationIds: updatedLocations });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pass-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pass-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="pass-modal__header">
          <h3 className="pass-modal__title">Assign Locations - {user.displayName}</h3>
          <button type="button" className="pass-modal__close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="pass-modal__body">
          {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}
          <p className="field-hint" style={{ marginBottom: '1rem' }}>
            Select the geographical locations this user is permitted to log in from. Super Admins bypass this restriction.
          </p>

          {user.isSuperAdmin && (
            <div className="badge badge-info" style={{ display: 'block', marginBottom: '1rem', padding: '0.75rem', whiteSpace: 'normal', lineHeight: 1.4 }}>
              Note: This user is a Super Admin. They will bypass the geo location check completely regardless of these assignments.
            </div>
          )}

          {locations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No active locations available.</p>
          ) : (
            <div className="checkbox-group" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius)' }}>
              {locations.map((loc) => (
                <label key={loc._id} className="checkbox-option">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(loc._id)} 
                    onChange={() => toggleLocation(loc._id)} 
                  />
                  <span>
                    {loc.name}
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Radius: {loc.radius}m
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Assignments'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserAssignmentsTab({ canWrite }) {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [u, l] = await Promise.all([
        api.systemUsers.list(),
        api.geoLocations.list({ isActive: 'true' })
      ]);
      setUsers(u);
      setLocations(l);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAssignment(updatedUser) {
    setUsers(users.map(u => u._id === updatedUser._id ? updatedUser : u));
    setSelectedUser(null);
  }

  if (loading) return <div className="card empty-state"><p>Loading users...</p></div>;

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginBottom: '1.5rem' }}>User Location Assignments</h3>
      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {!canWrite && <p className="read-only-banner">View only — user assignments require write access.</p>}

      <div className="table-scroll">
        <table className="reg-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Role</th>
              <th>Permitted Locations</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className={!user.isActive ? 'row-inactive' : undefined}>
                <td className="name-cell">
                  {user.displayName}
                  {user.isSuperAdmin && (
                    <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>Super Admin</span>
                  )}
                </td>
                <td>{user.username}</td>
                <td>{user.isSuperAdmin ? 'Unrestricted' : user.systemRoleId?.name || '—'}</td>
                <td>
                  {user.isSuperAdmin ? (
                    <span className="badge badge-success">All (Bypass)</span>
                  ) : (user.allowedLocationIds || []).length > 0 ? (
                    <div className="scope-badges-col">
                      {user.allowedLocationIds.map((loc) => {
                        const locObj = typeof loc === 'object' ? loc : locations.find(l => l._id === loc);
                        return <span key={locObj?._id || loc} className="badge badge-success">{locObj?.name || 'Unknown'}</span>;
                      })}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: 'var(--text-13)' }}>None (Blocked)</span>
                  )}
                </td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setSelectedUser(user)}
                    disabled={!canWrite}
                  >
                    Assign Locations
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No system users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserAssignmentModal 
          user={selectedUser} 
          locations={locations} 
          onClose={() => setSelectedUser(null)} 
          onSave={handleSaveAssignment} 
        />
      )}
    </div>
  );
}
