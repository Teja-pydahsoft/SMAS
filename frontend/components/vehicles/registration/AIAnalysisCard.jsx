import React from 'react';

export default function AIAnalysisCard({ aiData }) {
  if (!aiData) {
    return (
      <div className="admin-panel" style={{ padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>AI Analysis Preview</h3>
        <div style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <p style={{ color: 'var(--text-secondary)' }}>AI analysis will appear after upload.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>AI Analysis Preview</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Detected Front Plate</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem' }}>{aiData.frontPlateNumber || 'Not Detected'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Detected Rear Plate</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem' }}>{aiData.rearPlateNumber || 'Not Detected'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Normalized Output</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{aiData.normalizedPlateNumber || '-'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginBottom: '4px' }}>OCR Confidence</div>
          <div style={{ fontWeight: 600 }}>{aiData.confidence?.ocr || 0}%</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Validation Status</div>
          <div style={{ fontWeight: 600 }}>
             <span className={`badge ${aiData.validationStatus === 'Matched' ? 'badge-success' : 'badge-warning'}`}>
               {aiData.validationStatus || 'Pending'}
             </span>
          </div>
        </div>
      </div>
    </div>
  );
}
