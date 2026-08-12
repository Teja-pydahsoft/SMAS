import React from 'react';

export default function VehicleFilters({ filter, setFilter, onReset }) {
  const handleChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  return (
    <div className="admin-panel vehicle-filters-grid" style={{ padding: '0.5rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', alignItems: 'center' }}>

      <div>
        <select name="status" className="admin-input" value={filter.status || ''} onChange={handleChange} style={{ width: '100%', height: '32px', fontSize: '11px' }}>
          <option value="">All Statuses</option>
          <option value="Active">Active / Working</option>
          <option value="Idle">Idle</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
      <div>
        <select name="departmentId" className="admin-input" value={filter.departmentId || ''} onChange={handleChange} style={{ width: '100%', height: '32px', fontSize: '11px' }}>
          <option value="">All Departments</option>
        </select>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="admin-btn admin-btn--ghost" onClick={onReset} style={{ height: '32px', width: '100%', fontSize: '11px' }}>
          Reset Filters
        </button>
      </div>
    </div>
  );
}
