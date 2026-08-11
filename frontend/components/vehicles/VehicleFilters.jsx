import React from 'react';

export default function VehicleFilters({ filter, setFilter, onReset }) {
  const handleChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  return (
    <div className="admin-panel" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
      <div style={{ flex: '1 1 200px' }}>
        <input 
          type="text" 
          name="search"
          placeholder="Search Vehicle Number or Name..." 
          className="admin-input" 
          value={filter.search || ''}
          onChange={handleChange}
          style={{ width: '100%', height: '36px' }}
        />
      </div>
      <div style={{ flex: '1 1 150px' }}>
        <select name="categoryId" className="admin-input" value={filter.categoryId || ''} onChange={handleChange} style={{ width: '100%', height: '36px' }}>
          <option value="">All Categories</option>
          {/* Options dynamically populated by parent if needed */}
        </select>
      </div>
      <div style={{ flex: '1 1 150px' }}>
        <select name="typeId" className="admin-input" value={filter.typeId || ''} onChange={handleChange} style={{ width: '100%', height: '36px' }}>
          <option value="">All Types</option>
        </select>
      </div>
      <div style={{ flex: '1 1 150px' }}>
        <select name="status" className="admin-input" value={filter.status || ''} onChange={handleChange} style={{ width: '100%', height: '36px' }}>
          <option value="">All Statuses</option>
          <option value="Active">Active / Working</option>
          <option value="Idle">Idle</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
      <div style={{ flex: '1 1 150px' }}>
        <select name="departmentId" className="admin-input" value={filter.departmentId || ''} onChange={handleChange} style={{ width: '100%', height: '36px' }}>
          <option value="">All Departments</option>
        </select>
      </div>
      <div style={{ flexShrink: 0 }}>
        <button className="admin-btn admin-btn--ghost" onClick={onReset} style={{ height: '36px' }}>
          Reset Filters
        </button>
      </div>
    </div>
  );
}
