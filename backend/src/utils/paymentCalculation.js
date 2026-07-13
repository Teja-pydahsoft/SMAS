import { PAY_FREQUENCY_LABELS } from '../constants/index.js';

export function formatPayFrequencyLabel(payFrequency, customPayDays) {
  if (!payFrequency) return '—';
  if (payFrequency === 'custom_days' && customPayDays) {
    return `${customPayDays} Days`;
  }
  return PAY_FREQUENCY_LABELS[payFrequency] || payFrequency;
}

export function calculatePaymentSummary({ payFrequency, customPayDays, payAmount, days = [] }) {
  if (!payFrequency || payAmount == null || Number(payAmount) < 0) {
    return null;
  }

  const ratePerDay = Number(payAmount);
  const paymentDays = (days || []).filter((day) => day.status === 'P').length;
  const totalAmount = ratePerDay * paymentDays;

  return {
    payFrequency,
    customPayDays: payFrequency === 'custom_days' ? customPayDays : null,
    payAmount: ratePerDay,
    paymentDays,
    totalAmount,
    payFrequencyLabel: formatPayFrequencyLabel(payFrequency, customPayDays),
  };
}
