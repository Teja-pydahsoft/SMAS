const DATE_OPTS = { year: 'numeric', month: 'numeric', day: 'numeric' };
const DATETIME_OPTS = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** Fixed-locale formatting so SSR and client hydration match. */
export function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', DATETIME_OPTS);
}
