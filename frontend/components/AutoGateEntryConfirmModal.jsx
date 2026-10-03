'use client';

/**
 * AutoGateEntryConfirmModal
 *
 * Shown when a department check-in is attempted for:
 * 1) A contractor labour who has NO division gate entry today, but contractor gate entry is optional.
 *    Shows notification: "This contractor has no gate entries, so we are directly marking the department entry for the contractor."
 * 2) A person who has NO division gate entry today AND the division is configured as "Division Gate Entry – Optional".
 */
export default function AutoGateEntryConfirmModal({
  registration,
  divisionName,
  borrowedGateEntry,
  isContractorGateOptional = false,
  contractorNotice = '',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const personName =
    registration?.displayName || registration?.holderName || 'This person';

  const defaultNotice =
    'This contractor has no gate entries, so we are directly marking the department entry for the contractor.';
  const displayNotice = contractorNotice || defaultNotice;

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
      aria-label={isContractorGateOptional ? 'Contractor direct department entry notification' : 'Confirm auto gate entry'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="shift-picker-modal" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
          {/* Info icon */}
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: isContractorGateOptional ? 'rgba(59, 130, 246, 0.12)' : 'var(--warning-bg, #fffbeb)',
              border: `1.5px solid ${isContractorGateOptional ? 'var(--primary, #2563eb)' : 'var(--warning, #f59e0b)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            {isContractorGateOptional ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>

          <div>
            <h3 className="shift-picker-modal__title" style={{ margin: 0 }}>
              {isContractorGateOptional ? 'Contractor Department Entry' : 'No Gate Entry Found'}
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isContractorGateOptional
                ? (divisionName ? `Division: ${divisionName} · Pay Category: Contractor` : 'Pay Category: Contractor')
                : (divisionName ? `Division: ${divisionName}` : 'Division Gate Entry – Optional')}
            </p>
          </div>
        </div>

        {/* Body */}
        {isContractorGateOptional ? (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(37, 99, 235, 0.04))',
              border: '1.5px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              padding: '1.1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Contractor Notice
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {personName}
              </span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.92rem',
                lineHeight: '1.55',
                color: 'var(--text-primary)',
                fontWeight: 500,
              }}
            >
              {displayNotice}
            </p>

            <p
              style={{
                margin: '0.65rem 0 0',
                fontSize: '0.82rem',
                lineHeight: '1.45',
                color: 'var(--text-secondary, #4b5563)',
              }}
            >
              Labour pay category gate entry is enabled as optional. Click below to proceed and record the department entry immediately.
            </p>
          </div>
        ) : (
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
        )}

        {/* Warning note */}
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            margin: '0 0 1.25rem',
            lineHeight: '1.4',
          }}
        >
          {isContractorGateOptional
            ? 'The department check-in will be logged and the gate entry will be marked as system-generated for contractor labour.'
            : 'The auto-created gate entry will appear in reports and is marked as system-generated (optional gate entry mode).'}
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
            {loading ? 'Processing…' : (isContractorGateOptional ? 'Proceed & Mark Department Entry' : 'Confirm & Check In')}
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

