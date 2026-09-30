'use client';

import { useEffect, useState, useMemo } from 'react';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import { formatVisitTime } from '@/components/GateMatchedPerson';

function parseSecondsFromError(errorStr) {
  if (!errorStr) return null;
  // Match patterns like "1 minute 7 seconds", "2 minutes", "45 seconds"
  const minMatch = errorStr.match(/(\d+)\s*min/i);
  const secMatch = errorStr.match(/(\d+)\s*sec/i);
  let total = 0;
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);
  return total > 0 ? total : null;
}

export default function CheckoutWaitingModal({
  isOpen,
  onClose,
  result,
  sessionState,
  registration,
  scanType,
  stationName,
}) {
  const reg = registration || result?.registration;
  const photoUrl = resolvePhotoUrl(reg?.photoUrl || reg?.photoPath);

  // Compute entry time and initial remaining seconds
  const isDept = scanType === 'department';
  const openVisit = isDept && Array.isArray(sessionState?.departmentVisits)
    ? [...sessionState.departmentVisits].reverse().find((v) => !v.exitAt)
    : null;

  const entryAt = isDept
    ? (openVisit?.entryAt || null)
    : (sessionState?.gateEntryAt || null);

  const initialSeconds = useMemo(() => {
    if (typeof result?.checkoutWaitRemainingMs === 'number' && result.checkoutWaitRemainingMs > 0) {
      return Math.ceil(result.checkoutWaitRemainingMs / 1000);
    }
    const fromText = parseSecondsFromError(result?.error);
    if (fromText) return fromText;
    if (entryAt) {
      const elapsedMs = Date.now() - new Date(entryAt).getTime();
      const remainingMs = 120000 - elapsedMs;
      if (remainingMs > 0) return Math.ceil(remainingMs / 1000);
    }
    return 120; // Default 2 minutes
  }, [result?.checkoutWaitRemainingMs, result?.error, entryAt]);

  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  // Sync when initialSeconds updates
  useEffect(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  // Live countdown timer
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isReady = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent = Math.min(100, Math.max(0, ((120 - secondsLeft) / 120) * 100));

  // Calculate unlock time
  const unlockTimeStr = entryAt
    ? formatVisitTime(new Date(new Date(entryAt).getTime() + 120000))
    : null;

  return (
    <div className="checkout-wait-overlay" onClick={onClose} role="presentation">
      <div
        className="checkout-wait-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Checkout Cooldown Notice"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="checkout-wait-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="checkout-wait-modal__header">
          <div className={`checkout-wait-modal__status-badge ${isReady ? 'checkout-wait-modal__status-badge--ready' : 'checkout-wait-modal__status-badge--waiting'}`}>
            <span className="checkout-wait-pulse-dot" />
            {isReady ? 'READY TO CHECK OUT' : 'CHECKOUT COOLDOWN IN PROGRESS'}
          </div>
          <h2 className="checkout-wait-modal__title">
            {isReady ? 'Cooldown Period Complete!' : 'Too Soon to Check Out'}
          </h2>
          <p className="checkout-wait-modal__subtitle">
            {isReady
              ? 'The required 2-minute safety window has elapsed. You may now scan check-out.'
              : `Check-out is temporarily blocked to prevent duplicate punches. Please wait before scanning again.`}
          </p>
        </div>

        {/* Person Information Card */}
        {reg && (
          <div className="checkout-wait-person-card">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="checkout-wait-person-photo" />
            ) : (
              <div className="checkout-wait-person-photo checkout-wait-person-photo--placeholder">
                👤
              </div>
            )}
            <div className="checkout-wait-person-info">
              <span className="checkout-wait-person-name">{reg.displayName || 'Unnamed'}</span>
              <span className="checkout-wait-person-meta">
                {reg.roleId?.name || 'Labour'}
                {reg.registrationCode ? ` · Code: ${reg.registrationCode}` : ''}
              </span>
              <span className="checkout-wait-station-tag">
                {isDept ? '🏬 Department Check-out' : '🏢 Division Gate Exit'} — {stationName || 'Current Station'}
              </span>
            </div>
          </div>
        )}

        {/* Circular / Large Countdown Display */}
        <div className="checkout-wait-timer-container">
          <div className={`checkout-wait-timer-ring ${isReady ? 'checkout-wait-timer-ring--ready' : ''}`}>
            <span className="checkout-wait-timer-value">{formattedCountdown}</span>
            <span className="checkout-wait-timer-sub">
              {isReady ? 'READY' : 'TIME REMAINING'}
            </span>
          </div>

          {/* Linear Progress Bar */}
          <div className="checkout-wait-progress-wrap">
            <div
              className={`checkout-wait-progress-bar ${isReady ? 'checkout-wait-progress-bar--ready' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Timestamps Card */}
        <div className="checkout-wait-meta-grid">
          {entryAt && (
            <div className="checkout-wait-meta-cell">
              <span className="checkout-wait-meta-label">CHECKED IN AT</span>
              <span className="checkout-wait-meta-val">{formatVisitTime(entryAt)}</span>
            </div>
          )}
          {unlockTimeStr && (
            <div className="checkout-wait-meta-cell">
              <span className="checkout-wait-meta-label">CHECKOUT UNLOCKED AT</span>
              <span className="checkout-wait-meta-val" style={{ color: isReady ? '#16a34a' : '#d97706' }}>
                {unlockTimeStr}
              </span>
            </div>
          )}
          <div className="checkout-wait-meta-cell">
            <span className="checkout-wait-meta-label">MINIMUM INTERVAL</span>
            <span className="checkout-wait-meta-val">2 Minutes (120s)</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="checkout-wait-modal__actions">
          <button
            type="button"
            className={isReady ? 'btn-primary checkout-wait-btn--ready' : 'btn-secondary'}
            onClick={onClose}
          >
            {isReady ? '✓ Ready to Scan Check-out' : 'Got It, Waiting...'}
          </button>
        </div>
      </div>
    </div>
  );
}
