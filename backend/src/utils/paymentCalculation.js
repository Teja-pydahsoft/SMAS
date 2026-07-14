import { PAY_FREQUENCY_LABELS } from '../constants/index.js';

export function formatPayFrequencyLabel(payFrequency, customPayDays) {
  if (!payFrequency) return '—';
  if (payFrequency === 'custom_days' && customPayDays) {
    return `${customPayDays} Days`;
  }
  return PAY_FREQUENCY_LABELS[payFrequency] || payFrequency;
}

function dayPayFactor(day) {
  if (!day) return 0;
  if (typeof day.payFactor === 'number') return day.payFactor;
  if (day.status === 'P') return 1;
  if (day.status === 'HD' || day.status === 'PT') return 0.5;
  return 0;
}

function dayPayAmount(ratePerDay, day) {
  const factor = dayPayFactor(day);
  if (factor <= 0) return 0;
  return Math.round(ratePerDay * factor * 100) / 100;
}

/**
 * Payment is prorated by hours worked when payFactor is set on each day
 * (activityHours / shiftTotalHours, capped at 1). Absent days pay 0.
 * paymentDays is the sum of pay factors (e.g. 1 full + 4h/6h partial = 1.67).
 */
export function calculatePaymentSummary({ payFrequency, customPayDays, payAmount, days = [] }) {
  if (!payFrequency || payAmount == null || Number(payAmount) < 0) {
    return null;
  }

  const ratePerDay = Number(payAmount);
  let fullDays = 0;
  let halfDays = 0;
  let paymentDays = 0;
  let totalAmount = 0;

  for (const day of days || []) {
    const factor = dayPayFactor(day);
    if (factor <= 0) continue;
    paymentDays += factor;
    totalAmount += dayPayAmount(ratePerDay, day);
    if (day.status === 'P') fullDays += 1;
    else if (day.status === 'HD' || day.status === 'PT') halfDays += 1;
  }

  paymentDays = Math.round(paymentDays * 100) / 100;
  totalAmount = Math.round(totalAmount * 100) / 100;

  return {
    payFrequency,
    customPayDays: payFrequency === 'custom_days' ? customPayDays : null,
    payAmount: ratePerDay,
    fullDays,
    halfDays,
    paymentDays,
    totalAmount,
    payFrequencyLabel: formatPayFrequencyLabel(payFrequency, customPayDays),
  };
}
