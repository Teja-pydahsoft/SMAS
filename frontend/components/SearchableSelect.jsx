import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ options, value, onChange, placeholder, disabled, className, emptyValue = 'all', multiple = false }) {
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

  const isArray = Array.isArray(value);
  const selectedCount = isArray ? value.length : 0;
  
  const selectedLabel = multiple 
    ? (selectedCount === 0 || value === emptyValue ? placeholder : (selectedCount === 1 ? value[0] : `${selectedCount} selected`))
    : (value === emptyValue ? placeholder : value);

  const isSelected = (opt) => multiple ? isArray && value.includes(opt) : value === opt;

  const handleSelect = (opt) => {
    if (!multiple) {
      onChange(opt);
      setOpen(false);
      setSearch('');
    } else {
      if (opt === emptyValue) {
        onChange(emptyValue);
      } else {
        const current = isArray ? value : [];
        if (current.includes(opt)) {
          const next = current.filter(v => v !== opt);
          onChange(next.length ? next : emptyValue);
        } else {
          onChange([...current, opt]);
        }
      }
    }
  };

  const filtered = options.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="rc-searchable-select-wrap" style={{ position: 'relative', minWidth: '160px' }}>
      <button 
        type="button" 
        className={className || 'rc-select'} 
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: '8px' }}>
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
            marginTop: '4px',
            backgroundColor: '#fff', 
            border: '1px solid #d1d5db', 
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            zIndex: 1000,
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
            <input 
              type="text" 
              autoFocus
              style={{ width: '100%', fontSize: '0.875rem', padding: '0.4rem 0.6rem' }}
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            <div 
              style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: (!isArray && value === emptyValue) || (isArray && value.length === 0) ? '#f3f4f6' : 'transparent', fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => handleSelect(emptyValue)}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = (!isArray && value === emptyValue) || (isArray && value.length === 0) ? '#f3f4f6' : 'transparent'}
            >
              {multiple && (
                <input type="checkbox" checked={!isArray || value.length === 0} readOnly style={{ margin: 0, cursor: 'pointer' }} />
              )}
              {placeholder}
            </div>
            {filtered.map(opt => (
              <div 
                key={opt}
                style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: isSelected(opt) ? '#f3f4f6' : 'transparent', fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => handleSelect(opt)}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelected(opt) ? '#f3f4f6' : 'transparent'}
              >
                {multiple && (
                  <input type="checkbox" checked={isSelected(opt)} readOnly style={{ margin: 0, cursor: 'pointer' }} />
                )}
                {opt}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
