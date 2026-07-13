'use client';

import { PAY_FREQUENCIES, PAY_FREQUENCY_LABELS } from '@/lib/payFrequency';

export default function PayFrequencySettings({
  payFrequencies,
  customPayDaysOptions,
  customDayInput,
  onTogglePayFrequency,
  onCustomDayInputChange,
  onAddCustomDayOption,
  onRemoveCustomDayOption,
  compact = false,
}) {
  const showCustomDays = payFrequencies.includes('custom_days');

  return (
    <div className={`pay-frequency-settings${compact ? ' pay-frequency-settings--compact' : ''}`}>
      <div className="pay-frequency-settings__options">
        <label className="pay-frequency-settings__label">Pay Frequency Options</label>
        <p className="field-hint">Select which pay frequencies registrants can choose from</p>
        <div className="checkbox-group pay-frequency-settings__checkboxes">
          {PAY_FREQUENCIES.map((value) => (
            <label key={value} className="checkbox-option">
              <input
                type="checkbox"
                checked={payFrequencies.includes(value)}
                onChange={() => onTogglePayFrequency(value)}
              />
              <span>{PAY_FREQUENCY_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </div>

      {showCustomDays && (
        <div className="custom-days-editor">
          <div className="custom-days-editor__header">
            <label className="custom-days-editor__label">
              Custom Day Options <span className="custom-days-editor__required">*</span>
            </label>
            <span className="custom-days-editor__count">
              {customPayDaysOptions.length} option{customPayDaysOptions.length === 1 ? '' : 's'} added
            </span>
          </div>
          <p className="field-hint">
            Add as many day counts as needed. Each one becomes a dropdown option during registration.
          </p>

          <div className="custom-days-editor__add-row">
            <input
              type="number"
              min="1"
              value={customDayInput}
              onChange={(e) => onCustomDayInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddCustomDayOption();
                }
              }}
              placeholder="e.g. 15"
              aria-label="Custom day count"
            />
            <button type="button" className="btn-secondary" onClick={onAddCustomDayOption}>
              Add Option
            </button>
          </div>

          {customPayDaysOptions.length > 0 ? (
            <div className="custom-days-editor__list" role="list" aria-label="Custom day options">
              {customPayDaysOptions.map((days) => (
                <div key={days} className="custom-days-chip" role="listitem">
                  <span className="custom-days-chip__value">{days}</span>
                  <span className="custom-days-chip__label">days</span>
                  <button
                    type="button"
                    className="custom-days-chip__remove"
                    onClick={() => onRemoveCustomDayOption(days)}
                    aria-label={`Remove ${days} days option`}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="custom-days-editor__empty">No custom day options yet. Add at least one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
