'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * Compact table/cell display for long badge lists.
 * Shows the first item, then a "+N more" control that opens a dialog of the full list.
 */
export default function ScopeOverflowCell({
  items = [],
  badgeClass = 'badge-info',
  renderLabel,
  emptyLabel = '—',
  title = 'Items',
  subtitle = '',
  maxVisible = 1,
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const labelOf = (item) => (renderLabel ? renderLabel(item) : item?.name || '—');

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => labelOf(item).toLowerCase().includes(q));
  }, [items, query, renderLabel]);

  if (!items.length) {
    return <span className="scope-empty">{emptyLabel}</span>;
  }

  const visible = items.slice(0, maxVisible);
  const rest = items.length - visible.length;

  return (
    <>
      <div className="scope-overflow">
        {visible.map((item, index) => (
          <span
            key={item?._id || `${labelOf(item)}-${index}`}
            className={`badge ${badgeClass} scope-overflow__badge`}
            title={labelOf(item)}
          >
            {labelOf(item)}
          </span>
        ))}
        {rest > 0 && (
          <button
            type="button"
            className="scope-overflow__more"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={open}
            title={`Show all ${items.length} ${title.toLowerCase()}`}
          >
            +{rest} more
          </button>
        )}
      </div>

      {mounted && open && createPortal(
        <div
          className="scope-overflow-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="scope-overflow-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-overflow-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scope-overflow-popup__head">
              <div className="scope-overflow-popup__heading">
                <p id="scope-overflow-title" className="scope-overflow-popup__title">
                  {title}
                  <span className="scope-overflow-popup__count">{items.length}</span>
                </p>
                {subtitle ? (
                  <p className="scope-overflow-popup__subtitle">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="scope-overflow-popup__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="scope-overflow-popup__toolbar">
              <div className="scope-overflow-popup__search">
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  placeholder={`Search ${title.toLowerCase()}…`}
                  autoComplete="off"
                  aria-label={`Search ${title}`}
                />
                {query ? (
                  <button
                    type="button"
                    className="scope-overflow-popup__search-clear"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            <div className="scope-overflow-popup__body">
              {filteredItems.length === 0 ? (
                <p className="scope-overflow-popup__empty">No {title.toLowerCase()} match “{query.trim()}”.</p>
              ) : (
                <ul className="scope-overflow-popup__list">
                  {filteredItems.map((item, index) => (
                    <li
                      key={item?._id || `${labelOf(item)}-${index}`}
                      className="scope-overflow-popup__row"
                    >
                      <span className="scope-overflow-popup__index">{index + 1}</span>
                      <span className={`scope-overflow-popup__pip ${badgeClass}`} aria-hidden />
                      <span className="scope-overflow-popup__name">{labelOf(item)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="scope-overflow-popup__footer">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
