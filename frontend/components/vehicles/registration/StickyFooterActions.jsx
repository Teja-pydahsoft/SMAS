import React from 'react';

export default function StickyFooterActions({ onCancel, onSaveDraft, onSubmit, loading, disableSubmit }) {
  return (
    <div 
      className="admin-panel" 
      style={{ 
        position: 'sticky', 
        bottom: '24px', 
        zIndex: 100, 
        padding: '16px 24px', 
        marginTop: '32px',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        boxShadow: '0 -4px 15px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button 
          type="button" 
          onClick={onCancel}
          className="admin-btn admin-btn--ghost"
        >
          Cancel
        </button>
        <button 
          type="button" 
          onClick={onSaveDraft}
          className="admin-btn admin-btn--ghost"
          style={{ color: 'var(--text-secondary)' }}
        >
          Save Draft
        </button>
      </div>
      <div>
        <button 
          type="button" 
          onClick={onSubmit}
          disabled={disableSubmit || loading}
          className="admin-btn admin-btn--primary"
        >
          {loading ? 'Submitting Registration...' : 'Submit Registration'}
        </button>
      </div>
    </div>
  );
}
