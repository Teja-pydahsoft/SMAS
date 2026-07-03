'use client';

import { formatDateTime } from '@/lib/formatDate';

export default function PassCard({ pass, onPrint }) {
  if (!pass) return null;

  const isDayPass = pass.passType === 'day_pass';
  const validUntil = pass.validUntil ? formatDateTime(pass.validUntil) : null;

  function handlePrint() {
    if (onPrint) {
      onPrint();
      return;
    }
    window.print();
  }

  return (
    <div className={`pass-card ${isDayPass ? 'pass-card-day' : 'pass-card-registration'}`}>
      <div className="pass-card-header">
        <div className="pass-brand">
          <span className="pass-brand-icon">S</span>
          <div>
            <p className="pass-brand-name">SMAS</p>
            <p className="pass-brand-sub">Access System</p>
          </div>
        </div>
        <span className={`pass-type-badge ${isDayPass ? 'day' : 'registration'}`}>
          {pass.passTitle || (isDayPass ? 'Day Pass' : 'Registration Pass')}
        </span>
      </div>

      <div className="pass-card-body">
        <div className="pass-photo-wrap">
          {pass.holderPhotoUrl ? (
            <img src={pass.holderPhotoUrl} alt={pass.holderName || 'Holder'} className="pass-photo" />
          ) : (
            <div className="pass-photo-placeholder">No Photo</div>
          )}
        </div>

        <div className="pass-details">
          <h4 className="pass-holder-name">{pass.holderName || '—'}</h4>
          <p className="pass-role">{pass.roleName}</p>
          <p className="pass-code">{pass.registrationCode}</p>

          <div className="pass-meta-list">
            {pass.details?.slice(0, 5).map((d) => (
              <div key={`${d.label}-${d.value}`} className="pass-meta-row">
                <span className="pass-meta-label">{d.label}</span>
                <span className="pass-meta-value">{d.value}</span>
              </div>
            ))}
          </div>

          {isDayPass && pass.validDate && (
            <p className="pass-validity">
              Valid today: <strong>{pass.validDate}</strong>
              {validUntil && <span className="pass-valid-until"> until {validUntil}</span>}
            </p>
          )}

          {isDayPass && pass.qrPayload?.divisionName && (
            <p className="pass-validity">
              Division: <strong>{pass.qrPayload.divisionName}</strong>
              {' · '}
              {pass.qrPayload.divisionInside ? 'Inside' : 'Outside'}
            </p>
          )}

          {isDayPass && pass.qrPayload?.currentDepartmentName && (
            <p className="pass-validity">
              Current department: <strong>{pass.qrPayload.currentDepartmentName}</strong>
            </p>
          )}

          {isDayPass && (pass.qrPayload?.departmentVisits || []).length > 0 && (
            <div className="pass-visit-history">
              <p className="pass-meta-label" style={{ marginBottom: '0.35rem' }}>Department visits (on QR)</p>
              {(pass.qrPayload.departmentVisits || []).map((visit, idx) => (
                <div key={`${visit.departmentId}-${idx}`} className="pass-meta-row">
                  <span className="pass-meta-label">{visit.departmentName}</span>
                  <span className="pass-meta-value">
                    {visit.exitAt ? 'Completed' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="pass-issued">
            Pass ID: <strong>{pass.passCode}</strong>
          </p>
        </div>

        <div className="pass-qr-wrap">
          {pass.qrDataUrl ? (
            <img src={pass.qrDataUrl} alt="Pass QR Code" className="pass-qr" />
          ) : (
            <div className="pass-qr-placeholder">QR</div>
          )}
          <p className="pass-qr-hint">Scan to verify</p>
        </div>
      </div>

      <div className="pass-card-footer no-print">
        <button type="button" className="btn-primary" onClick={handlePrint}>
          Print Pass
        </button>
      </div>
    </div>
  );
}
