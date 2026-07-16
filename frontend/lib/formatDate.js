const IST_TIMEZONE = 'Asia/Kolkata';

const DATE_OPTS = {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
};
const DATETIME_OPTS = {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function parseDateValue(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      // Calendar dates are IST work dates — noon IST avoids off-by-one
      return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00+05:30`);
    }
  }
  return new Date(value);
}

/** Fixed-locale + IST formatting so SSR and client hydration match. */
export function formatDate(value) {
  if (!value) return '—';
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', DATETIME_OPTS);
}
