'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Compact table/cell display for long badge lists.
 * Shows the first item, then a "+N more" control that opens a popup of the full list.
 */
export default function ScopeOverflowCell({
  items = [],
  badgeClass = 'badge-info',
  renderLabel,
  emptyLabel = '—',
  title = 'Items',
  maxVisible = 1,
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
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

  if (!items.length) {
    return <span className="scope-empty">{emptyLabel}</span>;
  }

  const labelOf = (item) => (renderLabel ? renderLabel(item) : item?.name || '—');
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
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scope-overflow-popup__head">
              <p className="scope-overflow-popup__title">
                {title}
                <span className="scope-overflow-popup__count">{items.length}</span>
              </p>
              <button
                type="button"
                className="scope-overflow-popup__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="scope-overflow-popup__body">
              {items.map((item, index) => (
                <span
                  key={item?._id || `${labelOf(item)}-${index}`}
                  className={`badge ${badgeClass}`}
                >
                  {labelOf(item)}
                </span>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
