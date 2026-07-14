'use client';

import { useRef, useState } from 'react';
import { formatDateTime } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';

/** @typedef {'a4-half' | 'a5-landscape'} PassPrintSize */

const PRINT_PAGE_STYLES = {
  'a4-half': '@page { size: A4 portrait; margin: 0; }',
  'a5-landscape': '@page { size: A5 landscape; margin: 0; }',
};

const PRINT_SIZE_CLASS = {
  'a4-half': 'pass-print-a4',
  'a5-landscape': 'pass-print-a5',
};

/** Labels already shown in the identity block — hide from the details table */
const IDENTITY_DETAIL_LABELS = new Set([
  'name',
  'full name',
  'full_name',
  'displayname',
  'display name',
  'holder name',
]);

function filterPassDetails(details, holderName) {
  const nameNorm = String(holderName || '').trim().toLowerCase();
  return (details || []).filter((d) => {
    const label = String(d.label || '').trim().toLowerCase();
    if (IDENTITY_DETAIL_LABELS.has(label)) return false;
    if (nameNorm && String(d.value || '').trim().toLowerCase() === nameNorm && label.includes('name')) {
      return false;
    }
    return true;
  });
}

/**
 * Clone the pass into a body-level print root so modal overlay /
 * backdrop-filter cannot break print positioning.
 */
function runPassPrint(cardEl, printSize) {
  if (!cardEl) return;

  const sizeClass = PRINT_SIZE_CLASS[printSize];
  document.getElementById('pass-print-root')?.remove();
  document.getElementById('pass-print-page-style')?.remove();

  const root = document.createElement('div');
  root.id = 'pass-print-root';
  root.setAttribute('aria-hidden', 'true');

  const clone = cardEl.cloneNode(true);
  clone.querySelectorAll('.no-print, .pass-card__print-controls').forEach((el) => el.remove());
  root.appendChild(clone);
  document.body.appendChild(root);

  const pageStyle = document.createElement('style');
  pageStyle.id = 'pass-print-page-style';
  pageStyle.textContent = PRINT_PAGE_STYLES[printSize];
  document.head.appendChild(pageStyle);

  document.body.classList.add('pass-printing', sizeClass);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('pass-printing', 'pass-print-a4', 'pass-print-a5');
    root.remove();
    pageStyle.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60_000);
  window.print();
}

export default function PassCard({ pass, onPrint }) {
  const cardRef = useRef(null);
  const [printSize, setPrintSize] = useState(/** @type {PassPrintSize} */ ('a5-landscape'));

  if (!pass) return null;

  const isDayPass = pass.passType === 'day_pass';
  const validUntil = pass.validUntil ? formatDateTime(pass.validUntil) : null;
  const accentColor = isDayPass ? '#16A34A' : '#1A56FF';
  const accentColorLight = isDayPass ? '#DCFCE7' : '#E8F0FF';
  const detailRows = filterPassDetails(pass.details, pass.holderName);

  function handlePrint() {
    if (onPrint) {
      onPrint(printSize);
      return;
    }
    runPassPrint(cardRef.current, printSize);
  }

  return (
    <div
      ref={cardRef}
      className="pass-card"
      data-pass-type={isDayPass ? 'day' : 'registration'}
      style={{ '--pass-accent': accentColor, '--pass-accent-soft': accentColorLight }}
    >
      <div className="pass-card__accent" />

      <header className="pass-card__header">
        <div className="pass-card__brand">
          <span className="pass-brand-icon" aria-hidden="true">S</span>
          <div className="pass-card__brand-text">
            <p className="pass-brand-name">SAMS</p>
            <p className="pass-brand-sub">Smart Access Management System</p>
          </div>
        </div>
        <div className="pass-card__type-wrap">
          <span className="pass-card__type-badge">
            {pass.passTitle || (isDayPass ? 'Day Pass' : 'Registration Pass')}
          </span>
          {pass.passCode && (
            <span className="pass-card__pass-code">#{pass.passCode}</span>
          )}
        </div>
      </header>

      <div className="pass-card__body">
        <div className="pass-card__photo-col">
          {pass.holderPhotoUrl ? (
            <img
              src={resolvePhotoUrl(pass.holderPhotoUrl)}
              alt={pass.holderName || 'Pass holder'}
              className="pass-card__photo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextSibling) {
                  e.currentTarget.nextSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="pass-card__photo pass-card__photo--placeholder"
            style={{ display: pass.holderPhotoUrl ? 'none' : 'flex' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
        </div>

        <div className="pass-card__details-col">
          <div className="pass-card__identity">
            <h3 className="pass-card__name">{pass.holderName || '—'}</h3>
            <div className="pass-card__identity-meta">
              <span className="pass-card__role">{pass.roleName || '—'}</span>
              {pass.registrationCode && (
                <>
                  <span className="pass-card__meta-sep" aria-hidden="true">·</span>
                  <span className="pass-card__reg-code">{pass.registrationCode}</span>
                </>
              )}
            </div>
          </div>

          <dl className="pass-card__fields">
            {detailRows.map((d) => (
              <div key={`${d.label}-${d.value}`} className="pass-card__field">
                <dt className="pass-card__field-label">{d.label}</dt>
                <dd className="pass-card__field-value">{d.value || '—'}</dd>
              </div>
            ))}

            {isDayPass && pass.validDate && (
              <div className="pass-card__field pass-card__field--accent">
                <dt className="pass-card__field-label">Valid On</dt>
                <dd className="pass-card__field-value">{pass.validDate}</dd>
              </div>
            )}
            {isDayPass && pass.qrPayload?.shiftName && (
              <div className="pass-card__field">
                <dt className="pass-card__field-label">Shift</dt>
                <dd className="pass-card__field-value">{pass.qrPayload.shiftName}</dd>
              </div>
            )}
            {isDayPass && pass.qrPayload?.gateEntryAt && (
              <div className="pass-card__field">
                <dt className="pass-card__field-label">In Time</dt>
                <dd className="pass-card__field-value pass-card__field-value--time">
                  <span className="pass-card__time-dot pass-card__time-dot--in" aria-hidden="true" />
                  {formatDateTime(pass.qrPayload.gateEntryAt)}
                </dd>
              </div>
            )}
            {isDayPass && (
              <div className="pass-card__field">
                <dt className="pass-card__field-label">Out Time</dt>
                <dd className="pass-card__field-value pass-card__field-value--time">
                  {pass.qrPayload?.gateExitAt ? (
                    <>
                      <span className="pass-card__time-dot pass-card__time-dot--out" aria-hidden="true" />
                      {formatDateTime(pass.qrPayload.gateExitAt)}
                    </>
                  ) : validUntil ? (
                    <>
                      <span className="pass-card__time-dot pass-card__time-dot--expected" aria-hidden="true" />
                      <span className="pass-card__expected">Expected by {validUntil}</span>
                    </>
                  ) : (
                    <span className="pass-card__empty">—</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="pass-card__qr-col">
          {pass.qrDataUrl ? (
            <img src={pass.qrDataUrl} alt="Pass QR Code" className="pass-card__qr" />
          ) : (
            <div className="pass-card__qr pass-card__qr--placeholder">QR</div>
          )}
          <p className="pass-card__qr-hint">Scan at gate</p>
        </div>
      </div>

      <footer className="pass-card__footer">
        <p className="pass-card__footer-note">
          {isDayPass
            ? `Valid: ${pass.validDate || '—'} · Access any division`
            : 'Issued by SAMS · This pass is non-transferable'}
        </p>
        <div className="pass-card__print-controls no-print">
          <div className="pass-card__paper-size" role="group" aria-label="Print paper size">
            <button
              type="button"
              className={`pass-card__paper-btn${printSize === 'a4-half' ? ' is-active' : ''}`}
              onClick={() => setPrintSize('a4-half')}
              title="A4 portrait — pass fills the top half of the page"
              aria-pressed={printSize === 'a4-half'}
            >
              A4 Half
            </button>
            <button
              type="button"
              className={`pass-card__paper-btn${printSize === 'a5-landscape' ? ' is-active' : ''}`}
              onClick={() => setPrintSize('a5-landscape')}
              title="A5 landscape — auto-fits the full sheet"
              aria-pressed={printSize === 'a5-landscape'}
            >
              A5 Landscape
            </button>
          </div>
          <button
            type="button"
            className="btn-primary pass-card__print-btn"
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
      </footer>
    </div>
  );
}
