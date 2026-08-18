'use client';

import { useMemo, useState } from 'react';

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
  onToggle,
  emptyMessage = 'No departments available.',
  searchPlaceholder = 'Search departments…',
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((dept) => (dept.name || '').toLowerCase().includes(q));
  }, [departments, query]);

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
          aria-label="Search departments"
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
        {query.trim() ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ` · ${departments.length} total`}
      </p>
      {filtered.length === 0 ? (
        <p className="scope-empty">No departments match “{query.trim()}”.</p>
      ) : (
        <div className="checkbox-group su-scroll-list su-scroll-list--dept">
          {filtered.map((dept) => (
            <label key={dept._id} className="checkbox-option">
              <input
                type="checkbox"
                checked={selected.has(dept._id)}
                onChange={() => onToggle(dept._id)}
              />
              <span>{dept.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
