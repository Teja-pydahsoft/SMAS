import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api/client';

export default function VehicleQrModal({ vehicle, onClose }) {
  const [qrUrl, setQrUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vehicle) return;

    const fetchQr = async () => {
      setLoading(true);
      setError(null);
      try {
        const targetId = vehicle.registrationId || vehicle._id;
        const res = await api.vehicles.qr(targetId);
        if (res && res.qrDataUrl) {
          setQrUrl(res.qrDataUrl);
        } else {
          setError('QR Code could not be generated');
        }
      } catch (err) {
        // Fallback to registrations QR endpoint if available
        try {
          if (vehicle.registrationId) {
            const resReg = await api.vehicles.registrations.qr(vehicle.registrationId);
            if (resReg && resReg.qrDataUrl) {
              setQrUrl(resReg.qrDataUrl);
              return;
            }
          }
        } catch (e) {
          // ignore
        }
        setError(err.message || 'Failed to load QR Code');
      } finally {
        setLoading(false);
      }
    };

    fetchQr();
  }, [vehicle]);

  if (!vehicle) return null;

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `QR_${vehicle.plateNumber || 'Vehicle'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!qrUrl) return;

    const printRootId = 'pass-print-root';
    let printRoot = document.getElementById(printRootId);
    if (printRoot) printRoot.remove();

    printRoot = document.createElement('div');
    printRoot.id = printRootId;
    printRoot.setAttribute('aria-hidden', 'true');

    const equipmentType = vehicle.typeId?.name || vehicle.data?.vehicleType || 'Logistics Equipment';
    const deptName = vehicle.departmentId?.name || 'General Fleet';

    printRoot.innerHTML = `
      <div class="vehicle-qr-print-page">
        <div class="vehicle-qr-print-top">
          <h1 class="vehicle-qr-print-header-text">SMAS VEHICLE PASS</h1>
          <div class="vehicle-qr-print-code-container">
            <img src="${qrUrl}" class="vehicle-qr-print-img" alt="QR Code" />
          </div>
          <p class="vehicle-qr-print-hint">SCAN AT GATE FOR ACCESS</p>
        </div>
        <div class="vehicle-qr-print-bottom">
          <div class="vehicle-qr-print-plate">${vehicle.plateNumber || 'UNKNOWN'}</div>
          <div class="vehicle-qr-print-grid">
            <div class="vehicle-qr-print-field">
              <span class="label">EQUIPMENT:</span>
              <span class="value">${equipmentType}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">VEHICLE TYPE:</span>
              <span class="value">${equipmentType}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">DEPARTMENT:</span>
              <span class="value">${deptName}</span>
            </div>
            <div class="vehicle-qr-print-field">
              <span class="label">STATUS:</span>
              <span class="value">${vehicle.status || 'Active'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(printRoot);

    const styleId = 'vehicle-qr-print-style';
    let styleTag = document.getElementById(styleId);
    if (styleTag) styleTag.remove();

    styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = `
      #pass-print-root {
        display: none;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body > *:not(#pass-print-root) {
          display: none !important;
        }
        #pass-print-root {
          display: block !important;
          width: 210mm;
          height: 297mm;
          box-sizing: border-box;
        }
        .vehicle-qr-print-page {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 15mm;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, sans-serif;
          color: #000;
          background: #fff;
        }
        .vehicle-qr-print-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding-top: 10mm;
        }
        .vehicle-qr-print-header-text {
          font-size: 28pt;
          font-weight: 900;
          letter-spacing: 2px;
          margin: 0 0 10mm 0;
          color: #0f172a;
        }
        .vehicle-qr-print-code-container {
          width: 110mm;
          height: 110mm;
          padding: 5mm;
          border: 3px solid #0f172a;
          border-radius: 8mm;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .vehicle-qr-print-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .vehicle-qr-print-hint {
          font-size: 14pt;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #475569;
          margin: 6mm 0 0 0;
        }
        .vehicle-qr-print-bottom {
          border-top: 2px dashed #cbd5e1;
          padding-top: 10mm;
          margin-bottom: 10mm;
        }
        .vehicle-qr-print-plate {
          font-family: monospace;
          font-size: 36pt;
          font-weight: 900;
          text-align: center;
          letter-spacing: 2px;
          color: #0f172a;
          margin-bottom: 8mm;
          background: #f8fafc;
          padding: 4mm 0;
          border: 2px solid #e2e8f0;
          border-radius: 4mm;
        }
        .vehicle-qr-print-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6mm 10mm;
          font-size: 14pt;
        }
        .vehicle-qr-print-field {
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }
        .vehicle-qr-print-field .label {
          font-size: 10pt;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .vehicle-qr-print-field .value {
          font-size: 14pt;
          font-weight: 700;
          color: #0f172a;
        }
      }
    `;
    document.head.appendChild(styleTag);

    setTimeout(() => {
      window.print();
    }, 150);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      <div 
        style={{
          position: 'relative',
          zIndex: 1101,
          width: '90%',
          maxWidth: '440px',
          background: 'var(--surface-base)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '1.5rem',
          textAlign: 'center'
        }}
      >
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="admin-btn admin-btn--ghost" 
          style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px 8px', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
        >
          ✕
        </button>

        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Vehicle Gate Pass QR Code
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Scan at security gate for automated entry & exit
        </p>

        {/* Plate Number Badge */}
        <div style={{ marginTop: '1rem', marginBottom: '1.25rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '1.25rem', padding: '6px 16px', background: 'var(--surface-sunken)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--primary)' }}>
          {vehicle.plateNumber}
        </div>

        {/* QR Code Container */}
        <div style={{ width: '220px', height: '220px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
          {loading ? (
            <div className="dash-loading__spinner"></div>
          ) : error ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--danger)', padding: '1rem' }}>{error}</div>
          ) : qrUrl ? (
            <img src={qrUrl} alt="Vehicle QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : null}
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.85rem', marginBottom: '1.25rem' }}>
          {vehicle.typeId?.name ? `${vehicle.typeId.name} • ` : ''}Authorized Fleet Equipment
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
          <button 
            type="button" 
            className="admin-btn admin-btn--primary" 
            disabled={!qrUrl} 
            onClick={handlePrint}
            style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print Pass
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--secondary" 
            disabled={!qrUrl} 
            onClick={handleDownload}
            style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--ghost" 
            onClick={onClose}
            style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
