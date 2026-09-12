import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className,
  emptyValue = 'all',
  multiple = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const getOptVal = (opt) => {
    if (opt == null) return '';
    if (typeof opt === 'object') return opt.value ?? opt.id ?? opt._id ?? opt.name ?? '';
    return opt;
  };

  const getOptLabel = (opt) => {
    if (opt == null) return '';
    if (typeof opt === 'object') return opt.label ?? opt.name ?? opt.value ?? opt.id ?? '';
    return String(opt);
  };

  const isArray = Array.isArray(value);
  const selectedCount = isArray ? value.length : 0;

  const getLabelForValue = (val) => {
    const found = options.find((o) => String(getOptVal(o)) === String(val));
    return found ? getOptLabel(found) : val;
  };

  const isAllSelected = !isArray || value.length === 0 || value === emptyValue;

  const selectedLabel = multiple
    ? isAllSelected
      ? placeholder
      : selectedCount === 1
        ? getLabelForValue(value[0])
        : `${selectedCount} selected`
    : value === emptyValue || !value
      ? placeholder
      : getLabelForValue(value);

  const isSelected = (opt) => {
    const v = String(getOptVal(opt));
    return multiple
      ? isArray && value.map(String).includes(v)
      : String(value) === v;
  };

  const handleSelect = (opt) => {
    const optVal = getOptVal(opt);
    if (!multiple) {
      onChange(optVal);
      setOpen(false);
      setSearch('');
    } else {
      if (opt === emptyValue || optVal === emptyValue) {
        onChange(emptyValue);
      } else {
        const current = isArray ? value : [];
        const exists = current.some((v) => String(v) === String(optVal));
        if (exists) {
          const next = current.filter((v) => String(v) !== String(optVal));
          onChange(next.length ? next : emptyValue);
        } else {
          onChange([...current, optVal]);
        }
      }
    }
  };

  const handleSelectAll = (e) => {
    e?.stopPropagation();
    if (!multiple) return;
    onChange(options.map(getOptVal));
  };

  const handleClearAll = (e) => {
    e?.stopPropagation();
    onChange(emptyValue);
  };

  const filtered = options.filter((opt) =>
    getOptLabel(opt).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      className="rc-searchable-select-wrap"
      style={{ position: 'relative', minWidth: '160px' }}
    >
      <button
        type="button"
        className={className || 'rc-select'}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundImage: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            marginLeft: '8px',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div
          className="rc-searchable-select-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            minWidth: '200px',
            marginTop: '4px',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            zIndex: 9999,
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
            <input
              type="text"
              autoFocus
              style={{
                width: '100%',
                fontSize: '0.875rem',
                padding: '0.4rem 0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                outline: 'none',
              }}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {multiple && options.length > 2 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 12px',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.75rem',
                backgroundColor: '#f9fafb',
              }}
            >
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  padding: '2px 0',
                  fontWeight: 600,
                }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 0',
                }}
              >
                Clear
              </button>
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            <div
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: isAllSelected ? '#f3f4f6' : 'transparent',
                fontSize: '0.875rem',
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onClick={() => handleSelect(emptyValue)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = isAllSelected ? '#f3f4f6' : 'transparent')
              }
            >
              {multiple && (
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  readOnly
                  style={{ margin: 0, cursor: 'pointer' }}
                />
              )}
              <span>{placeholder}</span>
            </div>

            {filtered.map((opt) => {
              const optVal = getOptVal(opt);
              const optLabel = getOptLabel(opt);
              const selected = isSelected(opt);
              return (
                <div
                  key={String(optVal)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    backgroundColor: selected ? '#eff6ff' : 'transparent',
                    fontSize: '0.875rem',
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = selected ? '#dbeafe' : '#f3f4f6')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = selected ? '#eff6ff' : 'transparent')
                  }
                >
                  {multiple && (
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                  )}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {optLabel}
                  </span>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div
                style={{
                  padding: '8px 12px',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                }}
              >
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
