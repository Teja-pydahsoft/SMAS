'use client';

import { formatDateTime } from '@/lib/formatDate';

export default function PassCard({ pass, onPrint }) {
  if (!pass) return null;

  const isDayPass = pass.passType === 'day_pass';
  const validUntil = pass.validUntil ? formatDateTime(pass.validUntil) : null;
  const accentColor = isDayPass ? '#22C55E' : '#2563EB';
  const accentColorLight = isDayPass ? '#DCFCE7' : '#DBEAFE';

  function handlePrint() {
    if (onPrint) {
      onPrint();
      return;
    }
    window.print();
  }

  return (
    <div className="pass-card" data-pass-type={isDayPass ? 'day' : 'registration'}>

      {/* ── Top accent bar ── */}
      <div className="pass-card__accent" style={{ background: accentColor }} />

      {/* ── Header ── */}
      <div className="pass-card__header">
        <div className="pass-card__brand">
          <span className="pass-brand-icon">S</span>
          <div>
            <p className="pass-brand-name">SAMS</p>
            <p className="pass-brand-sub">Smart Access Management System</p>
          </div>
        </div>
        <div className="pass-card__type-wrap">
          <span
            className="pass-card__type-badge"
            style={{ background: accentColorLight, color: accentColor }}
          >
            {pass.passTitle || (isDayPass ? 'Day Pass' : 'Registration Pass')}
          </span>
          {pass.passCode && (
            <span className="pass-card__pass-code">#{pass.passCode}</span>
          )}
        </div>
      </div>

      {/* ── Body: Photo | Details table | QR ── */}
      <div className="pass-card__body">

        {/* Left column — Photo */}
        <div className="pass-card__photo-col">
          {pass.holderPhotoUrl ? (
            <img
              src={pass.holderPhotoUrl}
              alt={pass.holderName || 'Pass holder'}
              className="pass-card__photo"
            />
          ) : (
            <div className="pass-card__photo pass-card__photo--placeholder">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
          )}
        </div>

        {/* Middle column — Name + tabular details */}
        <div className="pass-card__details-col">
          <h3 className="pass-card__name">{pass.holderName || '—'}</h3>
          <p className="pass-card__role" style={{ color: accentColor }}>{pass.roleName || '—'}</p>
          {pass.registrationCode && (
            <p className="pass-card__reg-code">{pass.registrationCode}</p>
          )}

          <div className="pass-card__divider" />

          {/* Tabular form details */}
          <table className="pass-card__table">
            <tbody>
              {(pass.details || []).map((d) => (
                <tr key={`${d.label}-${d.value}`} className="pass-card__table-row">
                  <td className="pass-card__table-label">{d.label}</td>
                  <td className="pass-card__table-value">{d.value || '—'}</td>
                </tr>
              ))}

              {/* Day-pass: In-Time / Out-Time (no division status) */}
              {isDayPass && pass.validDate && (
                <tr className="pass-card__table-row pass-card__table-row--highlight">
                  <td className="pass-card__table-label">Valid On</td>
                  <td className="pass-card__table-value" style={{ color: accentColor, fontWeight: 700 }}>
                    {pass.validDate}
                  </td>
                </tr>
              )}
              {isDayPass && pass.qrPayload?.gateEntryAt && (
                <tr className="pass-card__table-row">
                  <td className="pass-card__table-label">In Time</td>
                  <td className="pass-card__table-value pass-card__table-value--time">
                    <span className="pass-card__time-dot pass-card__time-dot--in" aria-hidden="true" />
                    {formatDateTime(pass.qrPayload.gateEntryAt)}
                  </td>
                </tr>
              )}
              {isDayPass && (
                <tr className="pass-card__table-row">
                  <td className="pass-card__table-label">Out Time</td>
                  <td className="pass-card__table-value pass-card__table-value--time">
                    {pass.qrPayload?.gateExitAt ? (
                      <>
                        <span className="pass-card__time-dot pass-card__time-dot--out" aria-hidden="true" />
                        {formatDateTime(pass.qrPayload.gateExitAt)}
                      </>
                    ) : validUntil ? (
                      <>
                        <span className="pass-card__time-dot pass-card__time-dot--expected" aria-hidden="true" />
                        <span style={{ color: '#64748B', fontWeight: 500 }}>Expected by {validUntil}</span>
                      </>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right column — QR code */}
        <div className="pass-card__qr-col">
          {pass.qrDataUrl ? (
            <img src={pass.qrDataUrl} alt="Pass QR Code" className="pass-card__qr" />
          ) : (
            <div className="pass-card__qr pass-card__qr--placeholder">QR</div>
          )}
          <p className="pass-card__qr-hint">Scan at gate</p>
        </div>

      </div>

      {/* ── Footer ── */}
      <div className="pass-card__footer">
        <p className="pass-card__footer-note">
          {isDayPass
            ? `Valid: ${pass.validDate || '—'} · Access any division`
            : 'Issued by SAMS · This pass is non-transferable'}
        </p>
        <button
          type="button"
          className="btn-primary no-print pass-card__print-btn"
          onClick={handlePrint}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print Pass
        </button>
      </div>
    </div>
  );
}
