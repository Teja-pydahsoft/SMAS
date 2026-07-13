const DATE_OPTS = { year: 'numeric', month: 'numeric', day: 'numeric' };
const DATETIME_OPTS = {
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
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  return new Date(value);
}

/** Fixed-locale formatting so SSR and client hydration match. */
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
