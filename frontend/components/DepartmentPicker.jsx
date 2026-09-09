'use client';

import { useMemo, useState } from 'react';

/**
 * Checkbox list for assigning department gates with Entry / Exit / Both mode.
 *
 * Props:
 * - departments: [{ _id, name, isActive? }]
 * - selectedIds: string[]
 * - modes: { [departmentId]: 'entry' | 'exit' | 'both' }
 * - onChange({ departmentIds, departmentAccessModes })
 * - emptyMessage?: string
 * - searchPlaceholder?: string
 *
 * Legacy: onToggle(id) still works if onChange is not provided.
 */
const MODE_OPTIONS = [
  { value: 'entry', label: 'Entry' },
  { value: 'exit', label: 'Exit' },
  { value: 'both', label: 'Both' },
];

function isDeptActive(dept) {
  return dept?.isActive !== false;
}

function departmentLabel(dept) {
  const name = dept?.name || 'Department';
  return isDeptActive(dept) ? name : `${name} (Inactive)`;
}

function SearchIcon() {
  return (
    <svg className="su-dept-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function DepartmentPicker({
  departments = [],
  selectedIds = [],
  modes = {},
  onChange,
  onToggle,
  emptyMessage = 'No departments available.',
  searchPlaceholder = 'Search department gates…',
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
  const showModes = typeof onChange === 'function';

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => {
      const aActive = isDeptActive(a) ? 0 : 1;
      const bActive = isDeptActive(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [departments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedDepartments;
    return sortedDepartments.filter((dept) => {
      const hay = `${dept.name || ''} ${isDeptActive(dept) ? '' : 'inactive'}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedDepartments, query]);

  const inactiveCount = useMemo(
    () => departments.filter((dept) => !isDeptActive(dept)).length,
    [departments]
  );

  function emit(nextIds, nextModes) {
    if (onChange) {
      const cleaned = {};
      for (const id of nextIds) {
        cleaned[id] = nextModes[id] || 'both';
      }
      onChange({ departmentIds: nextIds, departmentAccessModes: cleaned });
    }
  }

  function toggleDepartment(dept) {
    const id = dept._id;
    const isOn = selected.has(String(id));
    if (!showModes) {
      onToggle?.(id);
      return;
    }
    if (isOn) {
      emit(
        selectedIds.filter((d) => String(d) !== String(id)),
        modes
      );
      return;
    }
    emit([...selectedIds, id], { ...modes, [id]: modes[id] || 'both' });
  }

  function setMode(dept, mode) {
    const id = dept._id;
    const nextModes = { ...modes, [id]: mode };
    if (!selected.has(String(id))) {
      emit([...selectedIds, id], nextModes);
      return;
    }
    emit(selectedIds, nextModes);
  }

  if (departments.length === 0) {
    return <p className="scope-empty">{emptyMessage}</p>;
  }

  return (
    <div className="su-dept-picker">
      <div className="su-dept-search">
        <SearchIcon />
        <input
          type="search"
          className="su-dept-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          placeholder={searchPlaceholder}
          aria-label="Search department gates"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="su-dept-search__clear"
            onClick={() => setQuery('')}
            aria-label="Clear department search"
          >
            ×
          </button>
        )}
      </div>
      <p className="su-dept-picker__meta">
        {selectedIds.length} selected
        {query.trim()
          ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
          : ` · ${departments.length} total`}
        {!query.trim() && inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ''}
      </p>
      {filtered.length === 0 ? (
        <p className="scope-empty">No departments match “{query.trim()}”.</p>
      ) : showModes ? (
        <div className="gate-access-picker gate-access-picker--dept">
          {filtered.map((dept) => {
            const id = dept._id;
            const checked = selected.has(String(id));
            const mode = modes[id] || 'both';
            const inactive = !isDeptActive(dept);
            return (
              <div
                key={id}
                className={`gate-access-picker__item${checked ? ' is-selected' : ''}${inactive ? ' is-inactive' : ''}`}
              >
                <label className="gate-access-picker__gate">
                  <input type="checkbox" checked={checked} onChange={() => toggleDepartment(dept)} />
                  <span className="gate-access-picker__text">
                    <span className="gate-access-picker__name">
                      {dept.name}
                      {inactive ? <span className="su-inactive-tag">Inactive</span> : null}
                    </span>
                    <span className="gate-access-picker__meta">
                      {inactive ? 'Inactive department gate' : 'Department gate'}
                    </span>
                  </span>
                </label>
                {checked && (
                  <div className="gate-access-picker__modes" role="group" aria-label={`${dept.name} access mode`}>
                    {MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`gate-access-picker__mode${mode === opt.value ? ' is-active' : ''}`}
                        onClick={() => setMode(dept, opt.value)}
                        aria-pressed={mode === opt.value}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="checkbox-group su-scroll-list su-scroll-list--dept">
          {filtered.map((dept) => (
            <label
              key={dept._id}
              className={`checkbox-option${!isDeptActive(dept) ? ' checkbox-option--inactive' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(String(dept._id))}
                onChange={() => toggleDepartment(dept)}
              />
              <span>{departmentLabel(dept)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function departmentModeBadgeLabel(deptOrId, modes = {}) {
  const id = deptOrId?._id || deptOrId;
  const mode = modes[id] || 'both';
  if (mode === 'entry') return 'entry';
  if (mode === 'exit') return 'exit';
  return 'entry & exit';
}

export function departmentDisplayLabel(dept, modes = {}) {
  if (!dept) return '—';
  const name = dept.name || 'Department';
  const mode = departmentModeBadgeLabel(dept, modes);
  const inactive = dept.isActive === false ? ' · inactive' : '';
  return `${name} (${mode}${inactive})`;
}
