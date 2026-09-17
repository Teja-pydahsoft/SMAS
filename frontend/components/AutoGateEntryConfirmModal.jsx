'use client';

/**
 * AutoGateEntryConfirmModal
 *
 * Shown when a department check-in is attempted for a labour who has NO division
 * gate entry today AND the division is configured as "Division Gate Entry – Optional".
 *
 * The operator must confirm that the system should auto-create a gate entry using
 * the same timestamp and photo as this department scan before proceeding.
 */
export default function AutoGateEntryConfirmModal({
  registration,
  divisionName,
  borrowedGateEntry,
  onConfirm,
  onCancel,
  loading = false,
}) {
  const personName =
    registration?.displayName || registration?.holderName || 'This person';

  const borrowedTime = borrowedGateEntry?.createdAt
    ? new Date(borrowedGateEntry.createdAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <div
      className="shift-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm auto gate entry"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="shift-picker-modal" style={{ maxWidth: '460px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
          {/* Info icon */}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--warning-bg, #fffbeb)',
              border: '1.5px solid var(--warning, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <div>
            <h3 className="shift-picker-modal__title" style={{ margin: 0 }}>
              No Gate Entry Found
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {divisionName ? `Division: ${divisionName}` : 'Division Gate Entry \u2013 Optional'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            background: 'var(--bg-inset, #f9fafb)',
            border: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.55', color: 'var(--text-primary)' }}>
            <strong>{personName}</strong> has no division gate entry for today.
          </p>

          <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', lineHeight: '1.5', color: 'var(--text-secondary, #4b5563)' }}>
            Since this division is configured as <strong>Gate Entry Optional</strong>, the system will
            automatically create a gate entry record using the{' '}
            <strong>same check-in time and photo</strong> as this department scan.
          </p>

          {borrowedTime && (
            <p style={{ margin: '0.65rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Reference entry time from another division: <strong>{borrowedTime}</strong>
            </p>
          )}
        </div>

        {/* Warning note */}
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            margin: '0 0 1.25rem',
            lineHeight: '1.4',
          }}
        >
          The auto-created gate entry will appear in reports and is marked as{' '}
          <em>system-generated (optional gate entry mode)</em>.
        </p>

        {/* Actions */}
        <div className="shift-picker-modal__actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={loading}
            id="auto-gate-entry-confirm-btn"
          >
            {loading ? 'Processing\u2026' : 'Confirm & Check In'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
            id="auto-gate-entry-cancel-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
