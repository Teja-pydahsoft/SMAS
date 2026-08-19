'use client';

import React, { useMemo, useState } from 'react';
import {
  PERMISSION_MODULES,
  SENSITIVE_PERMISSION_KEYS,
  emptyPermissions,
  applyWriteImpliesRead,
  summarizePermissions,
} from '@/lib/auth/permissions';
import { getPrivilegeTree } from '@/lib/app/navItems';

const SENSITIVE = new Set(SENSITIVE_PERMISSION_KEYS);

function uniqueKeys(keys) {
  return [...new Set(keys)];
}

function getAllKeys(node) {
  const keys = [];
  if (node.key) keys.push(node.key);
  if (node.items) keys.push(...node.items.flatMap(getAllKeys));
  return uniqueKeys(keys);
}

const UI_TREE = (() => {
  const tree = getPrivilegeTree();
  const groupedKeys = new Set(tree.flatMap(getAllKeys));
  const leftover = PERMISSION_MODULES.filter((m) => !groupedKeys.has(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    id: `more::${m.key}`,
  }));
  if (leftover.length) {
    tree.push({ title: 'More modules', items: leftover });
  }
  return tree;
})();

function defaultExpandedState() {
  const next = {};
  function walk(nodes) {
    nodes.forEach((node) => {
      if (node.items && node.title) {
        next[node.title] = node.title !== 'More modules';
        walk(node.items);
      }
    });
  }
  walk(UI_TREE);
  return next;
}

const DEFAULT_EXPANDED = defaultExpandedState();

const PRESETS = [
  { id: 'none', label: 'None' },
  { id: 'viewer', label: 'Viewer' },
  { id: 'operator', label: 'Operator' },
];

const OPERATOR_WRITE_KEYS = ['gate', 'activity', 'equipment_movements'];

function nodeMatchesQuery(node, query) {
  if (!query) return true;
  const hay = `${node.title || ''} ${node.label || ''} ${node.key || ''}`.toLowerCase();
  if (hay.includes(query)) return true;
  if (node.items) return node.items.some((child) => nodeMatchesQuery(child, query));
  return false;
}

function filterTree(nodes, query) {
  if (!query) return nodes;
  return nodes
    .map((node) => {
      const selfMatch = `${node.title || ''} ${node.label || ''} ${node.key || ''}`
        .toLowerCase()
        .includes(query);
      if (node.items) {
        if (selfMatch) return node;
        const items = filterTree(node.items, query);
        return items.length ? { ...node, items } : null;
      }
      return selfMatch ? node : null;
    })
    .filter(Boolean);
}

function setIndeterminate(el, some, all) {
  if (el) el.indeterminate = some && !all;
}

export default function PermissionMatrix({ permissions, onChange, readOnly = false, showSummary = true }) {
  const [expanded, setExpanded] = useState(DEFAULT_EXPANDED);
  const [search, setSearch] = useState('');
  const [activePreset, setActivePreset] = useState('');

  const query = search.trim().toLowerCase();
  const summary = useMemo(() => summarizePermissions(permissions), [permissions]);

  const displayTree = useMemo(() => filterTree(UI_TREE, query), [query]);

  function commit(next) {
    setActivePreset('');
    onChange(applyWriteImpliesRead(next));
  }

  function toggleExpand(title) {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  function setAllExpanded(value) {
    const next = { ...expanded };
    function walk(nodes) {
      nodes.forEach((node) => {
        if (node.items && node.title) {
          next[node.title] = value;
          walk(node.items);
        }
      });
    }
    walk(UI_TREE);
    setExpanded(next);
  }

  function toggleSingle(module, action) {
    if (readOnly) return;
    const current = permissions[module] || { read: false, write: false };
    const next = { ...current, [action]: !current[action] };
    if (action === 'write' && next.write) next.read = true;
    if (action === 'read' && !next.read) next.write = false;
    commit({ ...permissions, [module]: next });
  }

  function toggleKeys(keys, action, forceValue) {
    if (readOnly) return;
    const next = { ...permissions };
    keys.forEach((key) => {
      const current = next[key] || { read: false, write: false };
      const updated = { ...current, [action]: forceValue };
      if (action === 'write' && updated.write) updated.read = true;
      if (action === 'read' && !updated.read) updated.write = false;
      next[key] = updated;
    });
    commit(next);
  }

  function toggleGroup(node, action, forceValue) {
    toggleKeys(getAllKeys(node), action, forceValue);
  }

  function getGroupState(keys, action) {
    if (keys.length === 0) return { all: false, some: false };
    const all = keys.every((k) => permissions[k]?.[action]);
    const some = keys.some((k) => permissions[k]?.[action]);
    return { all, some };
  }

  function applyPreset(id) {
    if (readOnly) return;
    const next = emptyPermissions();
    if (id === 'viewer') {
      PERMISSION_MODULES.forEach(({ key }) => {
        next[key] = { read: true, write: false };
      });
    }
    if (id === 'operator') {
      OPERATOR_WRITE_KEYS.forEach((key) => {
        next[key] = { read: true, write: true };
      });
    }
    setActivePreset(id);
    onChange(applyWriteImpliesRead(next));
  }

  function renderCheckbox({ checked, indeterminate, onToggle, disabled, label, implied }) {
    return (
      <label className={`permission-check${implied ? ' permission-check--implied' : ''}`} title={implied ? 'Included with write' : label}>
        <input
          type="checkbox"
          checked={checked}
          ref={(el) => setIndeterminate(el, Boolean(indeterminate), checked)}
          onChange={onToggle}
          disabled={disabled || readOnly}
          aria-label={label}
        />
      </label>
    );
  }

  function renderRow(node, level = 0) {
    if (node.key && !node.items) {
      const value = permissions[node.key] || { read: false, write: false };
      const sensitive = SENSITIVE.has(node.key);
      return (
        <tr key={node.id || `${node.key}:${node.label}`} className={`permission-leaf-row${sensitive ? ' permission-leaf-row--sensitive' : ''}`}>
          <td className="name-cell" style={{ paddingLeft: `${level * 1.25 + 0.9}rem` }}>
            <span className="permission-leaf-label">
              {node.label}
              {sensitive && <span className="permission-badge permission-badge--warn">Privileged</span>}
            </span>
          </td>
          <td>
            {renderCheckbox({
              checked: Boolean(value.read),
              onToggle: () => toggleSingle(node.key, 'read'),
              disabled: Boolean(value.write),
              implied: Boolean(value.write),
              label: `Read access for ${node.label}`,
            })}
          </td>
          <td>
            {renderCheckbox({
              checked: Boolean(value.write),
              onToggle: () => toggleSingle(node.key, 'write'),
              label: `Write access for ${node.label}`,
            })}
          </td>
        </tr>
      );
    }

    if (node.items) {
      const isExpanded = query ? true : expanded[node.title] !== false;
      const keys = getAllKeys(node);
      const readState = getGroupState(keys, 'read');
      const writeState = getGroupState(keys, 'write');
      const isTopLevel = level === 0;

      return (
        <React.Fragment key={node.title}>
          <tr className={`permission-group-row${isTopLevel ? ' permission-group-row--section' : ''}`}>
            <td className="name-cell" style={{ paddingLeft: `${level * 1.25 + 0.9}rem` }}>
              <button
                type="button"
                className="permission-group-toggle"
                onClick={() => toggleExpand(node.title)}
                aria-expanded={isExpanded}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span>{node.title}</span>
              </button>
            </td>
            <td>
              {renderCheckbox({
                checked: readState.all,
                indeterminate: readState.some,
                onToggle: (e) => toggleGroup(node, 'read', e.target.checked),
                label: `Read access for ${node.title}`,
              })}
            </td>
            <td>
              {renderCheckbox({
                checked: writeState.all,
                indeterminate: writeState.some,
                onToggle: (e) => toggleGroup(node, 'write', e.target.checked),
                label: `Write access for ${node.title}`,
              })}
            </td>
          </tr>
          {isExpanded && node.items.map((child) => renderRow(child, level + 1))}
        </React.Fragment>
      );
    }

    return null;
  }

  const allKeys = PERMISSION_MODULES.map((m) => m.key);
  const allRead = getGroupState(allKeys, 'read');
  const allWrite = getGroupState(allKeys, 'write');

  return (
    <div className="permission-matrix-wrap">
      <div className="permission-matrix-toolbar">
        <div className="permission-matrix-search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
            placeholder="Search modules…"
            aria-label="Search modules"
            disabled={readOnly}
          />
        </div>
        <div className="permission-matrix-presets" role="group" aria-label="Permission presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`permission-preset${activePreset === preset.id ? ' is-active' : ''}`}
              onClick={() => applyPreset(preset.id)}
              disabled={readOnly}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="permission-matrix-actions">
          <button type="button" className="permission-link-btn" onClick={() => setAllExpanded(true)}>
            Expand all
          </button>
          <button type="button" className="permission-link-btn" onClick={() => setAllExpanded(false)}>
            Collapse
          </button>
        </div>
      </div>

      <p className="permission-matrix-hint">
        Write includes read. Checking write on a module grants read automatically — you only need to check write once.
      </p>

      <div className="table-scroll permission-matrix-scroll">
        <table className="reg-table permission-matrix">
          <thead>
            <tr>
              <th>Module</th>
              <th>
                <span className="permission-col-head">
                  Read
                  {renderCheckbox({
                    checked: allRead.all,
                    indeterminate: allRead.some,
                    onToggle: (e) => toggleKeys(allKeys, 'read', e.target.checked),
                    label: 'Grant read on all modules',
                  })}
                </span>
              </th>
              <th>
                <span className="permission-col-head">
                  Write
                  {renderCheckbox({
                    checked: allWrite.all,
                    indeterminate: allWrite.some,
                    onToggle: (e) => toggleKeys(allKeys, 'write', e.target.checked),
                    label: 'Grant write on all modules',
                  })}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayTree.length === 0 ? (
              <tr>
                <td colSpan={3} className="permission-empty">
                  No modules match “{search.trim()}”.
                </td>
              </tr>
            ) : (
              displayTree.map((node) => renderRow(node, 0))
            )}
          </tbody>
        </table>
      </div>

      {showSummary && (
        <div className="permission-matrix-summary" aria-live="polite">
          <span>
            <strong>{summary.grantedCount}</strong> of {summary.total} modules granted
          </span>
          <span className="permission-matrix-summary__split">
            {summary.writeCount} write · {summary.readCount} read-only
          </span>
        </div>
      )}
    </div>
  );
}
