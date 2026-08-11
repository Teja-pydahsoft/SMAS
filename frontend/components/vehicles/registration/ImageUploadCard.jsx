import React, { useRef, useState } from 'react';

export default function ImageUploadCard({ label, file, onFileChange, onRemove, disabled }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div 
      className="admin-panel" 
      style={{ 
        padding: '16px', 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        borderColor: dragActive ? 'var(--primary-color)' : 'var(--border-color)',
        borderWidth: dragActive ? '2px' : '1px',
        borderStyle: dragActive ? 'dashed' : 'solid',
        opacity: disabled ? 0.7 : 1
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>{label} *</h4>
        {file && !disabled && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{ color: 'var(--danger-color)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
          >
            Remove
          </button>
        )}
      </div>

      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/*"
        onChange={handleChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {file ? (
        <div style={{ position: 'relative', flexGrow: 1, minHeight: '120px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain' }} />
          {!disabled && (
            <div 
              style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
              onClick={handleClick}
            >
              <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600, padding: '4px 12px', border: '1px solid #fff', borderRadius: '4px' }}>Replace Image</span>
            </div>
          )}
        </div>
      ) : (
        <div 
          onClick={handleClick}
          style={{ 
            flexGrow: 1, 
            minHeight: '120px',
            backgroundColor: 'var(--surface-sunken)', 
            border: '1px dashed var(--border-color)', 
            borderRadius: '4px',
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            padding: '16px',
            textAlign: 'center'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Click to browse or drag & drop</span>
        </div>
      )}
    </div>
  );
}
