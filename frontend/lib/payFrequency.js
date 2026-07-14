export const PAY_FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom_days'];

export const PAY_FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom_days: 'Custom Days',
};

export const GENDERS = ['male', 'female'];

export const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
};

export function formatGender(gender) {
  if (!gender) return '—';
  return GENDER_LABELS[gender] || gender;
}

export function formatPayFrequency(payFrequency, customPayDays) {
  if (!payFrequency) return '—';
  if (payFrequency === 'custom_days' && customPayDays) {
    return `${customPayDays} Days`;
  }
  return PAY_FREQUENCY_LABELS[payFrequency] || payFrequency;
}

export function buildCombinedPayFrequencyOptions(payFrequencies = [], customPayDaysOptions = []) {
  const options = [];
  for (const value of payFrequencies) {
    if (value === 'custom_days') {
      for (const days of customPayDaysOptions) {
        options.push({
          value: `custom_days:${days}`,
          label: `${days} Days`,
        });
      }
      continue;
    }
    options.push({
      value,
      label: PAY_FREQUENCY_LABELS[value] || value,
    });
  }
  return options;
}

export function parsePayFrequencySelection(value) {
  if (!value) return { payFrequency: '', customPayDays: null };
  if (value.startsWith('custom_days:')) {
    const days = Number(value.split(':')[1]);
    return { payFrequency: 'custom_days', customPayDays: Number.isInteger(days) ? days : null };
  }
  return { payFrequency: value, customPayDays: null };
}

export function serializePayFrequencySelection(payFrequency, customPayDays) {
  if (!payFrequency) return '';
  if (payFrequency === 'custom_days' && customPayDays) {
    return `custom_days:${customPayDays}`;
  }
  return payFrequency;
}

/** @deprecated use buildCombinedPayFrequencyOptions */
export function getPayFrequencyOptions(payFrequencies = []) {
  return payFrequencies
    .filter((value) => PAY_FREQUENCIES.includes(value))
    .map((value) => ({
      value,
      label: PAY_FREQUENCY_LABELS[value] || value,
    }));
}

export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
