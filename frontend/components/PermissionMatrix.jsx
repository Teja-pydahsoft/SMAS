import React, { useState } from 'react';
import { PERMISSION_MODULES } from '@/lib/auth/permissions';

const UI_TREE = [
  {
    title: 'General',
    items: [
      { key: 'gate', label: 'Gate Entry / Exit' },
      { key: 'activity', label: 'Activity' },
      { key: 'vehicle_activity', label: 'Vehicle Activity Log' }
    ]
  },
  {
    title: 'Management',
    items: [
      { key: 'registration_roles', label: 'Registration Roles' },
      { key: 'registrations', label: 'Registrations' },
      { key: 'shifts', label: 'Shifts' },
      { key: 'projects', label: 'Project Management' },
      {
        title: 'Organization',
        items: [
          { key: 'divisions', label: 'Divisions' },
          { key: 'departments', label: 'Departments' }
        ]
      },
      {
        title: 'Vehicle & Equipment',
        items: [
          { key: 'vehicles', label: 'Vehicles' },
          { key: 'vehicle_types', label: 'Vehicle Types' },
          { key: 'vehicle_categories', label: 'Vehicle Categories' },
          { key: 'vehicle_registrations', label: 'Vehicle Registrations' },
          { key: 'equipment_movements', label: 'Equipment Movements' },
          { key: 'idle_monitoring', label: 'Idle Monitoring' }
        ]
      },
      {
        title: 'Reports',
        items: [
          { key: 'reports', label: 'Reports' },
          { key: 'vehicle_reports', label: 'Vehicle Reports' },
          { key: 'idle_reports', label: 'Idle Reports' },
          { key: 'idle_dashboard', label: 'Idle Dashboard' }
        ]
      }
    ]
  },
  {
    title: 'Settings',
    items: [
      {
        title: 'System Access',
        items: [
          { key: 'system_roles', label: 'System Roles' },
          { key: 'system_users', label: 'System Users' }
        ]
      },
      { key: 'locations', label: 'Geo Location Access' },
      { key: 'geo_login_activity', label: 'Geo Login Audit' },
      { key: 'devices', label: 'Device Maintenance' }
    ]
  }
];

// Helper to extract all keys from a subtree
function getAllKeys(node) {
  if (node.key) return [node.key];
  if (node.items) return node.items.flatMap(getAllKeys);
  return [];
}

export default function PermissionMatrix({ permissions, onChange, readOnly = false }) {
  const [expanded, setExpanded] = useState({
    'General': true,
    'Management': true,
    'Settings': true,
    'Organization': false,
    'Vehicle & Equipment': false,
    'Reports': false,
    'System Access': false
  });

  function toggleExpand(title) {
    setExpanded(prev => ({ ...prev, [title]: !prev[title] }));
  }

  function toggleSingle(module, action) {
    if (readOnly) return;
    const current = permissions[module] || { read: false, write: false };
    const next = { ...current, [action]: !current[action] };
    if (action === 'write' && next.write) next.read = true;
    if (action === 'read' && !next.read) next.write = false;
    onChange({ ...permissions, [module]: next });
  }

  function toggleGroup(node, action, forceValue) {
    if (readOnly) return;
    const keys = getAllKeys(node);
    const newPerms = { ...permissions };
    keys.forEach(k => {
      const current = newPerms[k] || { read: false, write: false };
      const next = { ...current, [action]: forceValue };
      if (action === 'write' && next.write) next.read = true;
      if (action === 'read' && !next.read) next.write = false;
      newPerms[k] = next;
    });
    onChange(newPerms);
  }

  function getGroupState(node, action) {
    const keys = getAllKeys(node);
    if (keys.length === 0) return false;
    const allChecked = keys.every(k => permissions[k]?.[action]);
    const someChecked = keys.some(k => permissions[k]?.[action]);
    return { all: allChecked, some: someChecked };
  }

  function renderRow(node, level = 0) {
    if (node.key) {
      // Leaf node
      const value = permissions[node.key] || { read: false, write: false };
      return (
        <tr key={node.key} className="permission-leaf-row">
          <td className="name-cell" style={{ paddingLeft: `${level * 1.5 + 1}rem` }}>
            {node.label}
          </td>
          <td>
            <label className="permission-check">
              <input
                type="checkbox"
                checked={Boolean(value.read)}
                onChange={() => toggleSingle(node.key, 'read')}
                disabled={readOnly}
              />
            </label>
          </td>
          <td>
            <label className="permission-check">
              <input
                type="checkbox"
                checked={Boolean(value.write)}
                onChange={() => toggleSingle(node.key, 'write')}
                disabled={readOnly}
              />
            </label>
          </td>
        </tr>
      );
    }

    if (node.items) {
      // Group node
      const isExpanded = expanded[node.title];
      const readState = getGroupState(node, 'read');
      const writeState = getGroupState(node, 'write');
      
      const isTopLevel = level === 0;
      const rowStyle = isTopLevel 
        ? { backgroundColor: 'var(--bg-inset, #f9fafb)', borderBottom: '1px solid var(--border)' }
        : { backgroundColor: 'transparent' };
      const textStyle = isTopLevel
        ? { color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
        : { fontWeight: 600, fontSize: '0.85rem' };

      return (
        <React.Fragment key={node.title}>
          <tr className="permission-group-row" style={rowStyle}>
            <td 
              className="name-cell" 
              style={{ 
                paddingLeft: `${level * 1.5 + 1}rem`, 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                ...textStyle
              }}
              onClick={() => toggleExpand(node.title)}
            >
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" 
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.6 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {node.title}
            </td>
            <td>
              <label className="permission-check">
                <input
                  type="checkbox"
                  ref={el => { if (el) el.indeterminate = readState.some && !readState.all; }}
                  checked={readState.all}
                  onChange={(e) => toggleGroup(node, 'read', e.target.checked)}
                  disabled={readOnly}
                />
              </label>
            </td>
            <td>
              <label className="permission-check">
                <input
                  type="checkbox"
                  ref={el => { if (el) el.indeterminate = writeState.some && !writeState.all; }}
                  checked={writeState.all}
                  onChange={(e) => toggleGroup(node, 'write', e.target.checked)}
                  disabled={readOnly}
                />
              </label>
            </td>
          </tr>
          {isExpanded && node.items.map(child => renderRow(child, level + 1))}
        </React.Fragment>
      );
    }
    return null;
  }

  // Handle any uncategorized permissions dynamically
  const groupedKeys = new Set(UI_TREE.flatMap(getAllKeys));
  const otherKeys = PERMISSION_MODULES.filter(m => !groupedKeys.has(m.key)).map(m => ({ key: m.key, label: m.label }));
  const displayTree = [...UI_TREE];
  if (otherKeys.length > 0) {
    displayTree.push({ title: 'Other Features', items: otherKeys });
  }

  return (
    <div className="table-scroll">
      <table className="reg-table permission-matrix">
        <thead>
          <tr>
            <th>Module</th>
            <th>Read</th>
            <th>Write</th>
          </tr>
        </thead>
        <tbody>
          {displayTree.map(node => renderRow(node, 0))}
        </tbody>
      </table>
    </div>
  );
}
