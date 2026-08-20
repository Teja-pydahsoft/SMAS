'use client';

import React, { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';

export default function VehicleFilters({ filter, setFilter, onReset }) {
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import('@/lib/api/client');
        const depts = await api.departments.list().catch(() => []);
        if (!cancelled) setDepartments(Array.isArray(depts) ? depts : []);
      } catch {
        if (!cancelled) setDepartments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDepartmentName = useMemo(() => {
    return departments.find((d) => d._id === filter.departmentId)?.name || '';
  }, [departments, filter.departmentId]);

  const handleChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  return (
    <div className="admin-panel vehicle-filters-grid vehicle-filters-container" style={{ padding: '0.75rem', marginBottom: '1rem', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', overflow: 'visible', position: 'relative', zIndex: 30 }}>

      <div style={{ flex: '1 1 180px' }}>
        <select name="status" className="admin-input" value={filter.status || ''} onChange={handleChange} style={{ width: '100%', height: '32px', fontSize: '11px' }}>
          <option value="">All Statuses</option>
          <option value="Active">Active / Working</option>
          <option value="Idle">Idle</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
      <div style={{ flex: '1 1 220px', overflow: 'visible', position: 'relative', zIndex: 40 }}>
        <SearchableSelect
          options={departments.map((d) => d.name)}
          value={selectedDepartmentName}
          onChange={(name) => {
            const selected = departments.find((d) => d.name === name);
            setFilter({ ...filter, departmentId: selected?._id || '' });
          }}
          placeholder="All Departments"
          emptyValue=""
          className="admin-input"
        />
      </div>
      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <button className="admin-btn admin-btn--ghost" onClick={onReset} style={{ height: '32px', fontSize: '11px' }}>
          Reset Filters
        </button>
      </div>
    </div>
  );
}
