'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime, todayDateStringIst } from '@/lib/formatDate';
import { formatCurrency, PAY_FREQUENCY_LABELS, PAY_FREQUENCIES } from '@/lib/payFrequency';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import { formatShiftWindow, formatDurationHours } from '@/lib/shiftTiming';
import PassCard from '@/components/PassCard';
import { useAuth } from '@/components/AuthProvider';
import SearchableSelect from '@/components/SearchableSelect';

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════════ */

function PortalWrapper({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function uniqueEmployeesById(list) {
  const seen = new Set();
  const out = [];
  for (const emp of list || []) {
    const id = emp?.registrationId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(emp);
  }
  return out;
}

function paySlipOverlapsRange(slip, fromDate, toDate) {
  return Boolean(
    slip?.status === 'Locked' &&
    slip.fromDate &&
    slip.toDate &&
    slip.fromDate <= toDate &&
    slip.toDate >= fromDate
  );
}

function PayLockMark({ className = '', size = 12 }) {
  return (
    <span className={`rc-pay-lock-mark ${className}`.trim()} title="Pay locked" aria-label="Pay locked">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

function statusCodeClass(code, status) {
  const raw = String(code || status || '').toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '') || 'unknown';
}

function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  confirmDisabled = false,
}) {
  if (!open) return null;
  return (
    <PortalWrapper>
      <div className="rc-dialog-overlay" onClick={onClose}>
        <div className="rc-dialog" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
          <div className="rc-dialog__header">
            <h2 className="rc-dialog__title" style={{ marginTop: 0 }}>{title}</h2>
            <button className="rc-dialog__close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="rc-dialog__body">
            <p style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{message}</p>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={confirmDisabled}>
                {cancelLabel}
              </button>
              <button type="button" className="btn-primary" onClick={onConfirm} disabled={confirmDisabled}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PortalWrapper>
  );
}

/** Print helper — Daily / History download professional PDFs; others use browser print */
function printReportCenterFallback() {
  document.body.classList.add('report-printing');
  let pageStyle = document.getElementById('report-print-page-style');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'report-print-page-style';
    pageStyle.textContent = '@page { size: A4 portrait; margin: 12mm; }';
    document.head.appendChild(pageStyle);
  }
  const cleanup = () => {
    document.body.classList.remove('report-printing');
    pageStyle?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 2000);
  window.print();
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

/** Pay frequency filter dropdown options shared by both attendance views */
const PAY_FREQUENCY_FILTER_OPTIONS = PAY_FREQUENCIES.map((value) => ({
  value,
  label: PAY_FREQUENCY_LABELS[value] || value,
}));

/** Collect the ordered set of unique select-field labels present across a set of people */
function collectSelectionColumns(people = []) {
  const labels = [];
  const seen = new Set();
  for (const person of people) {
    for (const sel of person?.selections || []) {
      if (sel?.label && !seen.has(sel.label)) {
        seen.add(sel.label);
        labels.push(sel.label);
      }
    }
  }
  return labels;
}

/** Read a person's selected value for a given select-field label */
function selectionValueFor(person, label) {
  const sel = (person?.selections || []).find((s) => s.label === label);
  return sel && sel.value ? sel.value : '—';
}

/** Distinct, sorted values chosen for a given select-field label across a set of people */
function selectionValueOptions(people = [], label) {
  const set = new Set();
  for (const person of people) {
    const sel = (person?.selections || []).find((s) => s.label === label);
    if (sel && sel.value) set.add(sel.value);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function selectionFilterHasActiveValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && value !== 'all');
}

function selectionFilterMatches(value, selectedValue) {
  if (!selectionFilterHasActiveValue(selectedValue)) return true;
  if (Array.isArray(selectedValue)) return selectedValue.includes(value);
  return value === selectedValue;
}

/** Value used to sort a daily-activity person for a given column key */
function dailySortValue(person, key) {
  switch (key) {
    case 'name': return person.displayName || '';
    case 'role': return person.roleName || '';
    case 'payFreq': return person.payFrequencyLabel || '';
    case 'code': return person.registrationCode || '';
    case 'entry': return person.gateEntryAt ? new Date(person.gateEntryAt).getTime() : 0;
    case 'exit': return person.gateExitAt ? new Date(person.gateExitAt).getTime() : 0;
    case 'status': return person.divisionInside ? 2 : person.hadActivityToday ? 1 : 0;
    case 'shift': return person.shiftName || '';
    default:
      if (key.startsWith('sel:')) return selectionValueFor(person, key.slice(4));
      return '';
  }
}

/** Compare helper: numeric-aware for both numbers and alphanumeric codes */
function compareSortValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

/** Clickable table header that toggles ascending/descending sort with an up/down arrow */
function SortHeader({ label, columnKey, activeKey, dir, onSort, className = '' }) {
  const active = activeKey === columnKey;
  return (
    <th
      className={`rc-th-sortable${active ? ' rc-th-sortable--active' : ''}${className ? ` ${className}` : ''}`}
      role="button"
      tabIndex={0}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(columnKey)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(columnKey); } }}
      title={`Sort by ${label}`}
    >
      <span className="rc-th-sortable__label">{label}</span>
      <span className="rc-th-sortable__arrow" aria-hidden="true">
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

function calcDuration(entryAt, exitAt) {
  if (!entryAt) return '—';
  const end = exitAt ? new Date(exitAt) : new Date();
  const ms = end - new Date(entryAt);
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** IST calendar date (YYYY-MM-DD) of a timestamp, '' when invalid. */
function istDateOf(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return todayDateStringIst(d);
}

/** IST hour of day (0–23) for a timestamp, or null when invalid. */
function istHourOf(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  const hour = Number(hourStr);
  return Number.isNaN(hour) ? null : hour;
}

/** Day = gate-in before 6:00 PM IST; Night = 6:00 PM IST onwards. */
function matchesDayNightPeriod(gateEntryAt, period) {
  if (!period || period === 'all') return true;
  const hour = istHourOf(gateEntryAt);
  if (hour === null) return false;
  if (period === 'day') return hour < 18;
  if (period === 'night') return hour >= 18;
  return true;
}

/** Compact date like "Jul 26" (IST) — shown under overnight exit times. */
function formatShortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Time stack used on overnight rows: always show the clock time; when the
 * event's IST calendar day differs from the work-date, show that date under it.
 */
function TimeWithOptionalDate({ at, workDate, className = '' }) {
  if (!at) return '—';
  const eventDate = istDateOf(at);
  const showDate = Boolean(workDate && eventDate && eventDate !== workDate);
  return (
    <span className={`rc-table__time-stack ${className}`.trim()}>
      <span>{formatTime(at)}</span>
      {showDate && (
        <span className="rc-table__time-date" title="Event on a different calendar day (overnight shift)">
          {formatShortDate(at)}
        </span>
      )}
    </span>
  );
}

function dayEarnedAmount(day, rate) {
  if (rate == null || Number.isNaN(Number(rate))) return null;
  if (!day || day.status === 'blank') return null;
  if (day.status === 'A') return 0;
  const factor = typeof day.payFactor === 'number'
    ? day.payFactor
    : day.status === 'P'
      ? 1
      : day.status === 'HD' || day.status === 'FH' || day.status === 'SH' || day.status === 'PT'
        ? 0.5
        : 0;
  return Math.round(Number(rate) * factor * 100) / 100;
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ═══════════════════════════════════════════════════════════════
   SMALL SHARED UI
════════════════════════════════════════════════════════════════ */

function Avatar({ url, name, size = 36 }) {
  const [err, setErr] = useState(false);
  const initial = (name || 'U').charAt(0).toUpperCase();
  if (url && !err) {
    return (
      <img
        src={resolvePhotoUrl(url)}
        alt=""
        className="rc-avatar rc-avatar--img"
        style={{ width: size, height: size }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="rc-avatar rc-avatar--initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initial}
    </div>
  );
}

function StatusBadge({ inside, hadActivity, activitySeen, hadGateActivity }) {
  if (inside) return <span className="badge badge-success rc-status-badge">Inside</span>;
  if (hadGateActivity ?? (hadActivity && !activitySeen)) {
    return <span className="badge badge-info rc-status-badge">Checked Out</span>;
  }
  if (activitySeen || (hadActivity && !hadGateActivity)) {
    return <span className="badge badge-warning rc-status-badge">Seen</span>;
  }
  if (hadActivity) return <span className="badge badge-info rc-status-badge">Checked Out</span>;
  return <span className="badge rc-status-badge rc-status-badge--absent">Not In</span>;
}

function Spinner({ size = 28 }) {
  return (
    <div className="rc-spinner" style={{ width: size, height: size, borderWidth: size > 20 ? 3 : 2 }} aria-hidden />
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="rc-empty">
      <div className="rc-empty__icon">{icon}</div>
      <h3 className="rc-empty__title">{title}</h3>
      {desc && <p className="rc-empty__desc">{desc}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MINI SPARKLINE
════════════════════════════════════════════════════════════════ */
function Sparkline({ data = [], color = '#2563EB' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 64, h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUMMARY CARDS
════════════════════════════════════════════════════════════════ */
function SummaryCard({ icon, label, value, trend, trendUp, sparkData, color = 'primary', loading }) {
  return (
    <div className={`rc-summary-card rc-summary-card--${color}`}>
      <div className="rc-summary-card__header">
        <div className={`rc-summary-card__icon rc-summary-card__icon--${color}`}>{icon}</div>
        {trend != null && (
          <span className={`rc-summary-card__trend ${trendUp ? 'rc-trend--up' : 'rc-trend--down'}`}>
            {trendUp ? '↑' : '↓'} {trend}%
          </span>
        )}
      </div>
      <div className="rc-summary-card__value">
        {loading ? <span className="rc-skeleton rc-skeleton--sm" /> : fmt(value)}
      </div>
      <div className="rc-summary-card__label">{label}</div>
      <div className="rc-summary-card__spark">
        <Sparkline data={sparkData} color={color === 'success' ? '#10B981' : color === 'danger' ? '#EF4444' : color === 'warning' ? '#F59E0B' : '#2563EB'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE COMPONENT
════════════════════════════════════════════════════════════════ */
function entryLocationTitle(entry) {
  const parts = [];
  if (entry.gateName) parts.push(`Gate: ${entry.gateName}`);
  if (entry.departmentName) parts.push(`Department: ${entry.departmentName}`);
  if (entry.divisionName) parts.push(`Division: ${entry.divisionName}`);
  return parts.join(' · ') || entry.label || '';
}

function timelineEventTitle(entry) {
  const isDept = entry?.scanType === 'department';
  if (isDept && entry?.departmentName) return entry.departmentName;
  if (entry?.gateName) return entry.gateName;
  if (entry?.scanType === 'activity') return (entry?.label || '').trim() || 'Activity detected';
  const label = (entry?.label || '').trim();
  if (!label) return 'Access event';
  return label.replace(/\s*[—–-]\s*(Entry|Exit|Check-in|Check-out|In|Out)\s*$/i, '').trim() || label;
}

function scanByWhomLabel(entry) {
  const name = (entry?.scannedByName || '').trim();
  const username = (entry?.scannedByUsername || '').trim();
  if (name && username && name.toLowerCase() !== username.toLowerCase()) {
    return `${name} (@${username})`;
  }
  if (name) return name;
  if (username) return `@${username}`;
  if (entry?.scanType === 'activity') return 'Activity Monitor';
  return '';
}

function EntryLocationMeta({ entry, compact = false, pills = false }) {
  const isDept = entry.scanType === 'department';

  if (pills) {
    const items = [];
    if (entry.divisionName) items.push({ key: 'div', text: entry.divisionName });
    if (isDept && entry.departmentName && timelineEventTitle(entry) !== entry.departmentName) {
      items.push({ key: 'dept', text: entry.departmentName, dept: true });
    }
    if (!isDept && entry.gateName && timelineEventTitle(entry) !== entry.gateName) {
      items.push({ key: 'gate', text: entry.gateName });
    }
    if (!items.length) return null;
    return (
      <div className="rc-entry-loc rc-entry-loc--pills">
        {items.map((item) => (
          <span
            key={item.key}
            className={`rc-entry-loc__pill ${item.dept ? 'rc-entry-loc__pill--dept' : ''}`.trim()}
          >
            {item.text}
          </span>
        ))}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rc-entry-loc rc-entry-loc--compact">
        {isDept ? (
          <>
            {entry.departmentName && (
              <span className="rc-entry-loc__dept">{entry.departmentName}</span>
            )}
            {entry.divisionName && (
              <span className="rc-entry-loc__div">{entry.divisionName}</span>
            )}
          </>
        ) : (
          <>
            {entry.gateName && (
              <span className="rc-entry-loc__gate">{entry.gateName}</span>
            )}
            {entry.divisionName && (
              <span className="rc-entry-loc__div">{entry.divisionName}</span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rc-entry-loc">
      {entry.divisionName && (
        <p className="rc-timeline__meta">Division: {entry.divisionName}</p>
      )}
      {isDept && entry.departmentName && (
        <p className="rc-timeline__meta">Department: {entry.departmentName}</p>
      )}
      {!isDept && entry.gateName && (
        <p className="rc-timeline__meta">Gate: {entry.gateName}</p>
      )}
    </div>
  );
}

function ScanPhoto({ url, label, className = '', onClick = null, size = 'md' }) {
  const [err, setErr] = useState(false);
  const src = resolvePhotoUrl(url);
  const clickable = Boolean(onClick);
  const sizeClass = size === 'sm' ? 'rc-scan-photo--sm' : size === 'lg' ? 'rc-scan-photo--lg' : '';

  if (!src || err) {
    const empty = (
      <div
        className={`rc-scan-photo rc-scan-photo--empty ${sizeClass} ${className}`.trim()}
        aria-hidden={!clickable}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
        </svg>
      </div>
    );
    if (!clickable) return empty;
    return (
      <button type="button" className="rc-scan-photo-btn" onClick={onClick} aria-label={label || 'View scan details'}>
        {empty}
      </button>
    );
  }

  const img = (
    <img
      src={src}
      alt={label || 'Scan photo'}
      className={`rc-scan-photo ${sizeClass} ${className}`.trim()}
      onError={() => setErr(true)}
    />
  );

  if (!clickable) return img;
  return (
    <button type="button" className="rc-scan-photo-btn" onClick={onClick} aria-label={label || 'View scan details'}>
      {img}
    </button>
  );
}

function ScanDetailLightbox({ entry, workDate = '', onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) return null;
  const isEntry = !isExitScan(entry);
  const isDept = isDeptScan(entry);
  const isGate = !isDept && entry.scanType !== 'activity';
  const kind = isDept ? 'Department' : entry.scanType === 'activity' ? 'Activity' : 'Gate';
  const action = scanActivityLabel(entry);
  const at = entry.at || entry.entryAt;
  const title = timelineEventTitle(entry);
  const detailRows = [];

  if (title) detailRows.push({ label: isDept ? 'Department' : isGate ? 'Gate' : 'Location', value: title });
  if (entry.divisionName) detailRows.push({ label: 'Division / Unit', value: entry.divisionName });
  const byWhom = scanByWhomLabel(entry);
  detailRows.push({ label: 'By Whom', value: byWhom || '—' });
  if (isDept && entry.departmentName && entry.departmentName !== title) {
    detailRows.push({ label: 'Department', value: entry.departmentName });
  }
  if (isGate && entry.gateName && entry.gateName !== title) {
    detailRows.push({ label: 'Gate', value: entry.gateName });
  }
  if (entry.matchScore != null) {
    detailRows.push({ label: 'Face Match', value: `${Math.round(Number(entry.matchScore) * 100)}%` });
  }
  if (entry.remark?.trim()) detailRows.push({ label: 'Remark', value: entry.remark.trim() });
  if (entry.entryAt && entry.exitAt) {
    detailRows.push({ label: 'Duration', value: calcDuration(entry.entryAt, entry.exitAt) });
  }

  return (
    <div className="rc-scan-lightbox" onClick={onClose} role="presentation">
      <div
        className="rc-scan-lightbox__panel"
        role="dialog"
        aria-modal
        aria-label="Scan details"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rc-scan-lightbox__close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="rc-scan-lightbox__photo-wrap">
          <ScanPhoto url={entry.photoUrl} label={action} className="rc-scan-lightbox__photo" size="lg" />
        </div>
        <div className="rc-scan-lightbox__body">
          <div className="rc-scan-lightbox__badges">
            <span className={`badge ${isEntry ? 'badge-success' : 'badge-info'}`}>{action}</span>
            <span className="badge badge-secondary">{kind}</span>
            {entry.status === 'Active' && (
              <span className="badge badge-warning">
                <span className="today-timeline__pulse" aria-hidden /> Active
              </span>
            )}
          </div>
          <div className="rc-scan-lightbox__datetime">
            <time className="rc-scan-lightbox__date-line" dateTime={at || undefined}>
              {at ? formatDate(at) : '—'}
            </time>
            <time className="rc-scan-lightbox__time-line" dateTime={at || undefined}>
              {at ? formatTime(at) : '—'}
            </time>
            {workDate && istDateOf(at) && istDateOf(at) !== workDate && (
              <p className="rc-scan-lightbox__date-note">
                Event date differs from selected work date ({formatDate(workDate)})
              </p>
            )}
          </div>
          {detailRows.length > 0 && (
            <div className="rc-scan-lightbox__details">
              {detailRows.map((row) => (
                <div key={row.label} className="rc-scan-lightbox__detail-row">
                  <span className="rc-scan-lightbox__detail-label">{row.label}</span>
                  <span className="rc-scan-lightbox__detail-value">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ entry, isLast, showPhoto = true, onOpen }) {
  const isActivity = entry.scanType === 'activity';
  const isGate = !isActivity && entry.scanType !== 'department';
  const isEntry = isActivity
    ? true
    : (entry.eventType || '').toLowerCase().includes('entry') ||
    (entry.label || '').toLowerCase().includes('entry') ||
    entry.isEntry;
  const isActive = entry.status === 'Active';
  const time = entry.at || entry.entryAt;
  const eventBadge = isActivity ? 'SEEN' : (entry.eventType || (isEntry ? 'ENTRY' : 'EXIT'));
  const kindBadge = isActivity ? 'Activity' : isGate ? 'Gate' : 'Dept';

  return (
    <div className={`rc-timeline__item ${isLast ? 'rc-timeline__item--last' : ''}`}>
      <div className="rc-timeline__connector">
        <div className={`rc-timeline__dot rc-timeline__dot--${isActivity ? 'entry' : isEntry ? 'entry' : 'exit'} ${isActive ? 'rc-timeline__dot--active' : ''}`}>
          {isActivity ? (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          ) : isGate ? (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
            </svg>
          )}
        </div>
        {!isLast && <div className="rc-timeline__line" />}
      </div>
      <div className={`rc-timeline__card ${isActive ? 'rc-timeline__card--active' : ''}`}>
        <div className={`rc-timeline__card-body ${!showPhoto ? 'rc-timeline__card-body--no-photo' : ''}`}>
          {showPhoto && (
            <div className="rc-timeline__card-photo">
              <ScanPhoto url={entry.photoUrl} label={`${eventBadge} photo`} size="sm" onClick={() => onOpen?.(entry)} />
            </div>
          )}
          <div className="rc-timeline__card-content">
            <div className="rc-timeline__card-top">
              <div className="rc-timeline__badges">
                <span className={`badge ${isActivity ? 'badge-warning' : isEntry ? 'badge-success' : 'badge-info'}`}>
                  {eventBadge}
                </span>
                <span className={`badge ${isActivity ? 'badge-secondary' : isGate ? 'badge-secondary' : 'badge-warning'}`}>
                  {kindBadge}
                </span>
                {isActive && (
                  <span className="badge badge-warning">
                    <span className="today-timeline__pulse" aria-hidden /> Active
                  </span>
                )}
              </div>
              <time className="rc-timeline__time" dateTime={time || undefined}>
                {time ? formatTime(time) : '—'}
              </time>
            </div>
            <p className="rc-timeline__label">{timelineEventTitle(entry)}</p>
            <EntryLocationMeta entry={entry} pills />
            {entry.remark?.trim() && (
              <p className="rc-timeline__remark">{entry.remark.trim()}</p>
            )}
            {entry.entryAt && entry.exitAt && (
              <p className="rc-timeline__meta rc-timeline__meta--duration">
                Duration {calcDuration(entry.entryAt, entry.exitAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isDeptScan(entry) {
  return entry?.scanType === 'department';
}

function isExitScan(entry) {
  return (entry?.eventType || '').toLowerCase() === 'exit';
}

function isGateExitScan(entry) {
  return !isDeptScan(entry) && isExitScan(entry);
}

function isGateEntryScan(entry) {
  return !isDeptScan(entry) && !isExitScan(entry);
}

/** Clear label for last activity / track steps */
function scanActivityLabel(entry) {
  if (!entry) return '—';
  if (entry.scanType === 'activity') return entry.inActivity ? 'Seen (in)' : 'Seen';
  if (isDeptScan(entry)) return isExitScan(entry) ? 'Dept Out' : 'Dept In';
  return isExitScan(entry) ? 'Gate Out' : 'Gate In';
}

function trackNodeRole(entry, index, total, checkedOut) {
  if (index === 0 && isGateEntryScan(entry)) return 'Gate In';
  if (index === total - 1) {
    if (checkedOut && isGateExitScan(entry)) return 'Gate Out';
    return 'Latest';
  }
  return scanActivityLabel(entry);
}

function PeriodTrackNode({ entry, workDate, role, isEndpoint, onOpen }) {
  const isEntry = !isExitScan(entry);
  const kind = isDeptScan(entry) ? 'dept' : entry.scanType === 'activity' ? 'activity' : 'gate';
  const endpointKind =
    role === 'Gate In' ? 'start' : role === 'Gate Out' ? 'end' : role === 'Latest' ? 'latest' : '';

  return (
    <div
      className={`rc-day-track__node ${isEndpoint ? 'rc-day-track__node--endpoint' : 'rc-day-track__node--step'} ${endpointKind ? `rc-day-track__node--${endpointKind}` : ''
        }`}
      title={entryLocationTitle(entry)}
    >
      <ScanPhoto
        url={entry.photoUrl}
        label={`${role} photo — click for details`}
        className={`rc-day-track__photo-img ${isEndpoint ? 'rc-day-track__photo' : 'rc-day-track__step-photo'} ${isEntry ? 'rc-day-track__photo-img--entry' : 'rc-day-track__photo-img--exit'
          }`}
        size={isEndpoint ? 'md' : 'sm'}
        onClick={() => onOpen?.(entry)}
      />
      <span className={`rc-day-track__node-label rc-day-track__node-label--${kind} ${endpointKind ? `rc-day-track__node-label--${endpointKind}` : ''}`}>
        {role}
      </span>
      <span className="rc-day-track__node-time">
        <TimeWithOptionalDate at={entry.at} workDate={workDate} />
      </span>
      <EntryLocationMeta entry={entry} compact />
    </div>
  );
}

/**
 * Compact horizontal day track: every scan gets a photo; click opens details.
 * Short timelines stay packed instead of stretching across the full width.
 */
function PeriodDayTrack({ entries, workDate = '' }) {
  const [detailEntry, setDetailEntry] = useState(null);
  const sorted = [...entries].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (sorted.length === 0) return null;

  const lastGate = [...sorted].reverse().find((e) => !isDeptScan(e)) || null;
  const checkedOut = Boolean(lastGate && isGateExitScan(lastGate));

  return (
    <>
      <div
        className={`rc-day-track ${sorted.length === 1 ? 'rc-day-track--single' : ''}`}
      >
        <div className="rc-day-track__flow">
          {sorted.map((entry, i) => {
            const isEndpoint = i === 0 || i === sorted.length - 1;
            const role = trackNodeRole(entry, i, sorted.length, checkedOut);
            return (
              <Fragment key={entry.id || `${entry.at}-${i}`}>
                {i > 0 && (
                  <div
                    className={`rc-day-track__seg ${isExitScan(sorted[i - 1]) || isExitScan(entry)
                        ? 'rc-day-track__seg--exit'
                        : 'rc-day-track__seg--entry'
                      }`}
                    aria-hidden
                  />
                )}
                <PeriodTrackNode
                  entry={entry}
                  workDate={workDate}
                  role={role}
                  isEndpoint={isEndpoint}
                  onOpen={setDetailEntry}
                />
              </Fragment>
            );
          })}
        </div>
        {sorted.length > 1 && !checkedOut && (
          <p className="rc-day-track__status-hint">Still inside · no gate out yet</p>
        )}
      </div>
      {detailEntry && (
        <PortalWrapper>
          <ScanDetailLightbox
            entry={detailEntry}
            workDate={workDate}
            onClose={() => setDetailEntry(null)}
          />
        </PortalWrapper>
      )}
    </>
  );
}

const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'AUTO', label: 'Auto', hint: 'Use computed status from scans' },
  { value: 'DS', label: 'Double Shift', hint: 'Double pay' },
  { value: '1.5S', label: '1.5 Shift', hint: '1.5x pay' },
  { value: 'OT', label: 'Overtime', hint: 'Present + OT pay' },
  { value: 'P', label: 'Present', hint: 'Full day pay' },
  { value: 'HD', label: 'Half Day', hint: 'Half day pay' },
  { value: 'A', label: 'Absent', hint: 'No pay' },
];

function AttendanceStatusEditPopup({ registrationId, day, onClose, onSaved }) {
  const [status, setStatus] = useState(day.overridden ? day.overrideStatus : 'AUTO');
  const [note, setNote] = useState(day.overrideNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.reports.setAttendanceStatus(registrationId, {
        date: day.date,
        status,
        note: note.trim(),
      });
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rc-dialog-overlay rc-dialog-overlay--nested"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Change attendance status"
    >
      <div className="rc-dialog rc-dialog--status-edit" onClick={(e) => e.stopPropagation()}>
        <div className="rc-dialog__header">
          <div>
            <h3 className="rc-dialog__title">Change Status</h3>
            <p className="rc-dialog__subtitle">{formatDate(day.date)}</p>
          </div>
          <button type="button" className="rc-dialog__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rc-dialog__body rc-status-popup__body">
          <p className="rc-status-popup__current">
            Current: <strong>{day.label || day.code}</strong>
            {day.overridden && <span className="rc-status-popup__manual"> · Manual</span>}
          </p>

          <fieldset className="rc-status-popup__options">
            <legend className="rc-status-popup__legend">Status</legend>
            {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`rc-status-popup__option ${status === opt.value ? 'rc-status-popup__option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="attendance-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  disabled={saving}
                />
                <span className="rc-status-popup__option-text">
                  <span className="rc-status-popup__option-label">{opt.label}</span>
                  <span className="rc-status-popup__option-hint">{opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="rc-status-popup__note-label" htmlFor={`status-note-${day.date}`}>
            Note <span className="rc-status-popup__optional">(optional)</span>
          </label>
          <textarea
            id={`status-note-${day.date}`}
            className="rc-status-popup__note"
            rows={3}
            maxLength={500}
            placeholder="Reason for changing this day’s status…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />

          {error && <p className="error-msg rc-status-popup__error">{error}</p>}
        </div>

        <div className="rc-dialog__footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Status'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceStatusEditor({ day, canEdit, onEdit }) {
  const locked = Boolean(day?.payLocked);
  const codeClass = statusCodeClass(day.code, day.status);
  const badgeTitle = locked
    ? 'Pay locked — attendance cannot be changed'
    : day.overridden
      ? `Manually set${day.overrideBy ? ` by ${day.overrideBy}` : ''}${day.overrideNote ? ` — ${day.overrideNote}` : ''}`
      : (day.label || day.code);

  return (
    <div className={`rc-status-edit ${day.overridden ? 'rc-status-edit--overridden' : ''} ${locked ? 'rc-status-edit--locked' : ''}`.trim()}>
      <span
        className={`rc-period-sessions-table__status rc-period-sessions-table__status--${day.status?.toLowerCase() || 'unknown'} rc-period-sessions-table__status--${codeClass}`}
        title={badgeTitle}
      >
        {day.code}
        {day.overridden && <span className="rc-status-edit__flag" aria-hidden>•</span>}
      </span>
      {canEdit && (
        <button
          type="button"
          className="rc-status-edit__btn"
          onClick={() => onEdit?.(day)}
          disabled={locked}
          title={locked ? 'Pay locked — attendance cannot be changed' : 'Edit status'}
          aria-label={locked ? `Pay locked for ${day.date}` : `Edit attendance status for ${day.date}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function PeriodDaySessionsTable({
  periodDays,
  entriesByDateMap,
  payAmount = null,
  registrationId = null,
  canEditStatus = false,
  onStatusChange,
}) {
  const [editingDay, setEditingDay] = useState(null);
  const [expandedDays, setExpandedDays] = useState({});
  const toggleDay = (date) => setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  const sortedDays = [...periodDays].reverse();
  const rate = payAmount != null ? Number(payAmount) : null;

  return (
    <>
      <div className="rc-period-sessions-table-wrap">
        <table className="rc-period-sessions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Gate In</th>
              <th>Last Activity</th>
              <th>Shift</th>
              <th>Hours</th>
              <th>Break</th>
              <th>Day Amount</th>
              <th>Sessions</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedDays.map((day) => {
              const entries = entriesByDateMap[day.date] || [];
              const lastEntry = [...entries].sort((a, b) => new Date(a.at) - new Date(b.at)).at(-1);
              const lastLabel = lastEntry
                ? scanActivityLabel(lastEntry)
                : day.lastActivityType === 'exit'
                  ? 'Gate Out'
                  : 'Gate In';
              const hoursLabel = formatCellHours(day.activityHours) || '—';
              const breakLabel = formatCellHours(day.breakHours) || '—';
              const earned = dayEarnedAmount(day, rate);
              const shiftWindow =
                day.shiftTotalHours != null
                  ? `${formatDurationHours(day.shiftTotalHours)}h`
                  : formatShiftWindow(day.shiftStartTime, day.shiftEndTime);
              const breakSegments = Array.isArray(day.breaks) ? day.breaks : [];
              const overnight = isOvernightDay(day);

              return (
                <Fragment key={day.date}>
                  <tr className="rc-period-sessions-table__meta">
                    <td className="rc-period-sessions-table__date">
                      <span className="rc-period-sessions-table__date-inner">
                        {overnight ? (
                          <span className="rc-period-sessions-table__date-overnight">
                            {formatDate(day.date)}
                            <span className="rc-period-sessions-table__date-next"> – {formatDate(nextIstDateStr(day.date))}</span>
                          </span>
                        ) : (
                          formatDate(day.date)
                        )}
                      </span>
                    </td>
                    <td className="rc-period-sessions-table__time">
                      <TimeWithOptionalDate at={day.checkIn} workDate={day.date} />
                    </td>
                    <td className="rc-period-sessions-table__time">
                      <span className="rc-period-sessions-table__activity">
                        <TimeWithOptionalDate at={day.lastActivityAt} workDate={day.date} />
                        <span className="rc-period-sessions-table__activity-type">{lastLabel}</span>
                      </span>
                    </td>
                    <td className="rc-period-sessions-table__shift">
                      {shiftWindow || day.shiftName ? (
                        <span className="rc-period-sessions-table__shift-cell">
                          {day.shiftName && (
                            <span className="rc-period-sessions-table__shift-name">{day.shiftName}</span>
                          )}
                          {shiftWindow && (
                            <span className="rc-period-sessions-table__shift-window">{shiftWindow}</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="rc-period-sessions-table__hours">{hoursLabel}</td>
                    <td className="rc-period-sessions-table__break">
                      {day.breakHours > 0 ? (
                        <span className="rc-period-sessions-table__break-cell">
                          <span className="rc-period-sessions-table__break-total">{breakLabel}</span>
                          {breakSegments.length > 0 && (
                            <span className="rc-period-sessions-table__break-detail">
                              {breakSegments
                                .map((b) => {
                                  const fromLabel = istDateOf(b.from) !== day.date
                                    ? `${formatTime(b.from)} (${formatShortDate(b.from)})`
                                    : formatTime(b.from);
                                  const toLabel = istDateOf(b.to) !== day.date
                                    ? `${formatTime(b.to)} (${formatShortDate(b.to)})`
                                    : formatTime(b.to);
                                  return `${fromLabel}–${toLabel}`;
                                })
                                .join(', ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="rc-period-sessions-table__amount">
                      {earned != null ? formatCurrency(earned) : '—'}
                    </td>
                    <td className="rc-period-sessions-table__count">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{entries.length}</span>
                        {entries.length > 0 && (
                          <button 
                            className="btn-secondary btn-sm"
                            style={{ whiteSpace: 'nowrap', padding: '2px 8px', fontSize: '11px' }}
                            onClick={() => toggleDay(day.date)}
                          >
                            {expandedDays[day.date] ? 'Hide Photos' : 'View Photos'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="rc-period-sessions-table__status-cell">
                      <AttendanceStatusEditor
                        day={day}
                        canEdit={canEditStatus && Boolean(registrationId)}
                        onEdit={setEditingDay}
                      />
                    </td>
                  </tr>
                  {expandedDays[day.date] && (
                    <tr className="rc-period-sessions-table__track-row">
                      <td colSpan={9}>
                        {entries.length === 0 ? (
                          <p className="rc-period-day-timeline__empty">No scan events recorded for this day.</p>
                        ) : (
                          <PeriodDayTrack entries={entries} workDate={day.date} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingDay && registrationId && (
        <AttendanceStatusEditPopup
          registrationId={registrationId}
          day={editingDay}
          onClose={() => setEditingDay(null)}
          onSaved={onStatusChange}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PERSON DETAIL DIALOG (centered modal)
════════════════════════════════════════════════════════════════ */
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PersonDetailDialog({ registrationId, dateFrom, dateTo, divisionId, onClose }) {
  const { can } = useAuth();
  const canEditStatus = can('reports', 'write');
  const canManagePayroll = can('payroll_rate_master', 'write');
  const canReadPayroll = can('payroll_rate_master', 'read') || canManagePayroll;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasDateRange = Boolean(dateFrom && dateTo);
  const singleDayDate =
    hasDateRange && dateFrom === dateTo
      ? dateFrom
      : !hasDateRange
        ? todayDateStringIst()
        : null;
  const isDayPassToday = Boolean(singleDayDate && singleDayDate === todayDateStringIst());
  const canShowDayPass = Boolean(singleDayDate) && !divisionId;
  const dayPassLabel = isDayPassToday
    ? 'Today Day Pass'
    : singleDayDate
      ? `Day Pass · ${formatDate(singleDayDate)}`
      : 'Day Pass';
  const [activeInnerTab, setActiveInnerTab] = useState(hasDateRange ? 'history' : 'today');
  const [exporting, setExporting] = useState('');
  const [dayPass, setDayPass] = useState(null);
  const [dayPassLoading, setDayPassLoading] = useState(false);
  const [dayPassError, setDayPassError] = useState('');
  const [showDayPass, setShowDayPass] = useState(false);
  const [detailEntry, setDetailEntry] = useState(null);
  const [paySlipHistory, setPaySlipHistory] = useState([]);
  const [paySlipHistoryLoading, setPaySlipHistoryLoading] = useState(false);
  const [periodPaySlipLocked, setPeriodPaySlipLocked] = useState(false);
  const [paySlipStatusLoading, setPaySlipStatusLoading] = useState(false);
  const [generatingPaySlip, setGeneratingPaySlip] = useState(false);
  const [paySlipConfirmOpen, setPaySlipConfirmOpen] = useState(false);
  const [paySlipSuccess, setPaySlipSuccess] = useState('');

  const reloadReport = useCallback(async () => {
    if (!registrationId) return;
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (divisionId) params.divisionId = divisionId;
    const d = await api.reports.getRegistration(registrationId, params);
    setData(d);
    return d;
  }, [registrationId, dateFrom, dateTo, divisionId]);

  useEffect(() => {
    if (!registrationId) return;
    setLoading(true);
    setError('');
    setActiveInnerTab(hasDateRange ? 'history' : 'today');
    setDayPass(null);
    setDayPassError('');
    setShowDayPass(false);
    reloadReport()
      .then(() => setLoading(false))
      .catch(e => { setError(e.message); setLoading(false); });
  }, [registrationId, hasDateRange, reloadReport]);

  // Prefetch day pass for today OR a single selected past date
  useEffect(() => {
    if (!registrationId || !canShowDayPass || !singleDayDate) return undefined;
    let cancelled = false;
    setDayPassLoading(true);
    setDayPassError('');
    api.passes.getDayPass(registrationId, isDayPassToday ? null : singleDayDate)
      .then((pass) => {
        if (!cancelled) setDayPass(pass);
      })
      .catch((e) => {
        if (!cancelled) {
          setDayPass(null);
          // 404 = no pass yet — not a hard error for the dialog
          if (e?.status !== 404) setDayPassError(e.message || 'Failed to load day pass');
        }
      })
      .finally(() => {
        if (!cancelled) setDayPassLoading(false);
      });
    return () => { cancelled = true; };
  }, [registrationId, canShowDayPass, singleDayDate, isDayPassToday]);

  useEffect(() => {
    if (!registrationId || !canReadPayroll) {
      setPaySlipHistory([]);
      setPeriodPaySlipLocked(false);
      setPaySlipHistoryLoading(false);
      setPaySlipStatusLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPaySlipHistoryLoading(true);
    setPaySlipStatusLoading(true);
    api.payroll.getPaySlips({ registrationId })
      .then((paySlips) => {
        if (cancelled) return;
        const history = Array.isArray(paySlips) ? paySlips : [];
        setPaySlipHistory(history);
        const hasLockedSlip = Boolean(dateFrom && dateTo) && history.some((slip) =>
          slip?.status === 'Locked' &&
          slip?.fromDate <= dateFrom &&
          slip?.toDate >= dateTo);
        setPeriodPaySlipLocked(hasLockedSlip);
      })
      .catch(() => {
        if (!cancelled) {
          setPaySlipHistory([]);
          setPeriodPaySlipLocked(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPaySlipHistoryLoading(false);
          setPaySlipStatusLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [registrationId, dateFrom, dateTo, canReadPayroll]);

  if (!registrationId) return null;

  const details = data?.details || {};
  const todayEntries = [...(data?.todayEntries || [])].sort((a, b) =>
    new Date(a.at || a.entryAt || 0) - new Date(b.at || b.entryAt || 0));
  const entriesByDate = data?.entriesByDate || [];
  const session = data?.sessionState || {};
  const rangeSummary = data?.attendanceRange?.summary;
  const paymentSummary = data?.attendanceRange?.payment;
  const entriesByDateMap = Object.fromEntries(entriesByDate.map((g) => [g.date, g.entries]));
  // Include Present/Partial days AND any day that has scans / check-in activity
  // (previously Absent-with-scans were hidden → false "No activity in selected period").
  const periodDays = (data?.attendanceRange?.days || []).filter((day) => {
    if (day.status === 'blank') return false;
    if (day.payLocked) return true;
    if (day.status === 'P' || day.status === 'HD' || day.status === 'FH' || day.status === 'SH' || day.status === 'PT') {
      return true;
    }
    const scanCount = entriesByDateMap[day.date]?.length || 0;
    return Boolean(day.checkIn || day.lastActivityAt || day.checkInTime || scanCount > 0);
  });
  const rangeLabel = hasDateRange
    ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
    : null;

  const exportOptions = { dateFrom, dateTo };
  const overlappingLockedSlips = hasDateRange
    ? paySlipHistory.filter((slip) => paySlipOverlapsRange(slip, dateFrom, dateTo))
    : [];
  const lockedDayCount = data?.attendanceRange?.lockedDayCount
    || (data?.attendanceRange?.days || []).filter((day) => day.payLocked).length;
  const paySlipAlreadyGenerated = hasDateRange && (
    Boolean(data?.attendanceRange?.payPeriodLocked) || periodPaySlipLocked
  );
  const paySlipPartiallyLocked = hasDateRange && !paySlipAlreadyGenerated && lockedDayCount > 0;

  const handleGeneratePaySlip = () => {
    if (!dateFrom || !dateTo) {
      setError('Cannot generate pay slip without a valid date range.');
      return;
    }
    if (paySlipAlreadyGenerated) {
      setError('Pay slip already generated for this period.');
      return;
    }
    setPaySlipConfirmOpen(true);
  };

  const executeGeneratePaySlip = async () => {
    setGeneratingPaySlip(true);
    setPaySlipConfirmOpen(false);
    setError('');
    setPaySlipSuccess('');
    try {
      const unlockedDays = (data?.attendanceRange?.days || []).filter((day) => !day.payLocked);
      const totalHours = Math.round(
        unlockedDays.reduce((sum, day) => sum + (Number(day?.activityHours) || 0), 0) * 100
      ) / 100;
      await api.payroll.generatePaySlips({
        fromDate: dateFrom,
        toDate: dateTo,
        registrations: [{
          registrationId,
          totalHours,
          amount: data?.attendanceRange?.unlockedPayment?.totalAmount || paymentSummary?.totalAmount || 0,
        }]
      });
      setPaySlipSuccess(paySlipPartiallyLocked
        ? 'Pay slip generated for remaining unlocked days.'
        : 'Pay slip generated successfully.');
      setPeriodPaySlipLocked(true);
      api.payroll.getPaySlips({ registrationId })
        .then((history) => setPaySlipHistory(Array.isArray(history) ? history : []))
        .catch(() => {});
    } catch (e) {
      setError(e.message || 'Failed to generate pay slip.');
    } finally {
      setGeneratingPaySlip(false);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting('excel');
    try {
      const { downloadPersonReportExcel } = await import('@/lib/reportExport');
      await downloadPersonReportExcel(data, exportOptions);
    } finally {
      setExporting('');
    }
  };

  const handleExportPdf = async () => {
    if (!data) return;
    setExporting('pdf');
    try {
      const { downloadPersonReportPdf } = await import('@/lib/reportExport');
      await downloadPersonReportPdf(data, exportOptions);
    } finally {
      setExporting('');
    }
  };

  const handleOpenDayPass = async () => {
    if (dayPass) {
      setShowDayPass(true);
      return;
    }
    if (!singleDayDate) {
      setDayPassError('Select a single date to view the day pass.');
      return;
    }
    setDayPassLoading(true);
    setDayPassError('');
    try {
      const pass = await api.passes.getDayPass(registrationId, isDayPassToday ? null : singleDayDate);
      setDayPass(pass);
      setShowDayPass(true);
    } catch (e) {
      setDayPassError(e?.status === 404
        ? (isDayPassToday
          ? 'No day pass for today yet. It appears after a successful gate entry.'
          : `No day pass found for ${formatDate(singleDayDate)}.`)
        : (e.message || 'Failed to load day pass'));
    } finally {
      setDayPassLoading(false);
    }
  };

  const innerTabs = hasDateRange
    ? [
      { id: 'history', label: 'Period History' },
      { id: 'details', label: 'Details' },
      ...(canReadPayroll ? [{ id: 'paySlips', label: 'Pay Slip History' }] : []),
    ]
    : [
      { id: 'today', label: "Today's Timeline" },
      { id: 'history', label: 'Date History' },
      { id: 'details', label: 'Details' },
      ...(canReadPayroll ? [{ id: 'paySlips', label: 'Pay Slip History' }] : []),
    ];

  return (
    <div className="rc-dialog-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Person Access Report">
      <div className={`rc-dialog rc-dialog--person ${hasDateRange ? 'rc-dialog--person-wide' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rc-dialog__header">
          <div className="rc-dialog__header-info">
            <div>
              <h2 className="rc-dialog__title">{loading ? 'Loading…' : 'Access Report'}</h2>
              {rangeLabel && <p className="rc-dialog__subtitle">{rangeLabel}</p>}
            </div>
          </div>
          <button className="rc-dialog__close" onClick={onClose} aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="rc-dialog__body">
          {loading && <div className="rc-center-load"><Spinner size={32} /><span>Loading report…</span></div>}
          {error && <p className="error-msg">{error}</p>}
          {!loading && !error && data && (
            <>
              {/* Profile card */}
              <div className="rc-person-profile">
                <div className="rc-person-profile__left">
                  <Avatar url={details.holderPhotoUrl} name={details.holderName} size={72} />
                  <div>
                    <h3 className="rc-person-profile__name">{details.holderName || '—'}</h3>
                    <p className="rc-person-profile__role">{details.roleName}</p>
                    <code className="rc-person-profile__code">{details.registrationCode}</code>
                    {!hasDateRange && (
                      <div style={{ marginTop: 8 }}>
                        <StatusBadge
                          inside={session?.divisionInside}
                          hadActivity={todayEntries.length > 0}
                          hadGateActivity={todayEntries.some((e) => e.scanType !== 'activity')}
                          activitySeen={todayEntries.some((e) => e.scanType === 'activity')}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="rc-person-profile__stats">
                  {hasDateRange && rangeSummary ? (
                    <>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Total Days</span>
                        <span className="rc-person-profile__stat-value">{rangeSummary.totalDays}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Present Days</span>
                        <span className="rc-person-profile__stat-value rc-color-success">{rangeSummary.present}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Partial Days</span>
                        <span className="rc-person-profile__stat-value">{rangeSummary.halfDay ?? 0}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Absent Days</span>
                        <span className="rc-person-profile__stat-value rc-color-danger">{rangeSummary.absent}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Scans in Period</span>
                        <span className="rc-person-profile__stat-value">{details.totalScans ?? '—'}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Last Activity</span>
                        <span className="rc-person-profile__stat-value">{formatDateTime(details.lastScanAt)}</span>
                      </div>
                      {(details.shiftName || details.shiftTotalHours != null || details.shiftStartTime || details.shiftEndTime) && (
                        <>
                          {details.shiftName && (
                            <div className="rc-person-profile__stat">
                              <span className="rc-person-profile__stat-label">Shift</span>
                              <span className="rc-person-profile__stat-value">{details.shiftName}</span>
                            </div>
                          )}
                          {(details.shiftTotalHours != null || details.shiftStartTime || details.shiftEndTime) && (
                            <div className="rc-person-profile__stat">
                              <span className="rc-person-profile__stat-label">Working Hours</span>
                              <span className="rc-person-profile__stat-value">
                                {details.shiftTotalHours != null
                                  ? `${formatDurationHours(details.shiftTotalHours)}h`
                                  : formatShiftWindow(details.shiftStartTime, details.shiftEndTime) || '—'}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {paymentSummary && (
                        <>
                          <div className="rc-person-profile__stat">
                            <span className="rc-person-profile__stat-label">Pay Frequency</span>
                            <span className="rc-person-profile__stat-value">{paymentSummary.payFrequencyLabel}</span>
                          </div>
                          <div className="rc-person-profile__stat">
                            <span className="rc-person-profile__stat-label">Per Day Amount</span>
                            <span className="rc-person-profile__stat-value">{formatCurrency(paymentSummary.payAmount)}</span>
                          </div>
                          <div className="rc-person-profile__stat">
                            <span className="rc-person-profile__stat-label">Payment Days</span>
                            <span className="rc-person-profile__stat-value">{paymentSummary.paymentDays}</span>
                          </div>
                          <div className="rc-person-profile__stat">
                            <span className="rc-person-profile__stat-label">Calculated Amount</span>
                            <span className="rc-person-profile__stat-value rc-color-success">
                              {formatCurrency(paymentSummary.totalAmount)}
                            </span>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Total Scans</span>
                        <span className="rc-person-profile__stat-value">{details.totalScans ?? '—'}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">In Time</span>
                        <span className="rc-person-profile__stat-value rc-color-success">{formatTime(session?.gateEntryAt)}</span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Out Time</span>
                        <span className="rc-person-profile__stat-value rc-color-danger">
                          {formatTime(session?.gateExitAt)}
                          {session?.gateExitAt && session?.gateEntryAt && istDateOf(session.gateExitAt) !== istDateOf(session.gateEntryAt) && (
                            <span className="rc-table__time-date" title="Exited on a different day (overnight shift)">
                              {formatShortDate(session.gateExitAt)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="rc-person-profile__stat">
                        <span className="rc-person-profile__stat-label">Duration</span>
                        <span className="rc-person-profile__stat-value">{calcDuration(session?.gateEntryAt, session?.gateExitAt)}</span>
                      </div>
                      {details.shiftName && (
                        <div className="rc-person-profile__stat">
                          <span className="rc-person-profile__stat-label">Shift</span>
                          <span className="rc-person-profile__stat-value">{details.shiftName}</span>
                        </div>
                      )}
                      {(details.shiftTotalHours != null || details.shiftStartTime || details.shiftEndTime || session?.totalHours != null || session?.shiftStartTime || session?.shiftEndTime) && (
                        <div className="rc-person-profile__stat">
                          <span className="rc-person-profile__stat-label">Working Hours</span>
                          <span className="rc-person-profile__stat-value">
                            {(details.shiftTotalHours ?? session?.totalHours) != null
                              ? `${formatDurationHours(details.shiftTotalHours ?? session.totalHours)}h`
                              : formatShiftWindow(
                                details.shiftStartTime || session?.shiftStartTime,
                                details.shiftEndTime || session?.shiftEndTime
                              ) || '—'}
                          </span>
                        </div>
                      )}
                      {session?.currentDepartmentName && (
                        <div className="rc-person-profile__stat">
                          <span className="rc-person-profile__stat-label">Active Dept</span>
                          <span className="rc-person-profile__stat-value">{session.currentDepartmentName}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Inner tabs */}
              <div className="sub-nav rc-dialog__sub-nav" style={{ marginBottom: '1rem' }}>
                {innerTabs.map(t => (
                  <button key={t.id} type="button"
                    className={`sub-nav-item ${activeInnerTab === t.id ? 'active' : ''}`}
                    onClick={() => setActiveInnerTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {!hasDateRange && activeInnerTab === 'today' && (
                <div>
                  {todayEntries.length === 0 ? (
                    <EmptyState icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                      title="No activity today" desc="No gate, department, or activity-monitor sightings recorded today." />
                  ) : (
                    <div className="rc-timeline">
                      {todayEntries.map((e, i) => (
                        <TimelineEvent key={e.id || i} entry={e} isLast={i === todayEntries.length - 1} onOpen={setDetailEntry} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeInnerTab === 'history' && (
                <div>
                  {hasDateRange ? (
                    periodDays.length === 0 && entriesByDate.length === 0 ? (
                      <EmptyState icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                        title="No activity in selected period"
                        desc={`No check-in or check-out activity between ${formatDate(dateFrom)} and ${formatDate(dateTo)}.`} />
                    ) : periodDays.length > 0 ? (
                      <PeriodDaySessionsTable
                        periodDays={periodDays}
                        entriesByDateMap={entriesByDateMap}
                        payAmount={paymentSummary?.payAmount ?? details.payAmount}
                        registrationId={registrationId}
                        canEditStatus={canEditStatus}
                        onStatusChange={reloadReport}
                      />
                    ) : (
                      <div className="rc-history-list">
                        {entriesByDate.map(group => (
                          <div key={group.date} className="rc-history-day">
                            <div className="rc-history-day__header">
                              <span className="rc-history-day__date">{formatDate(group.date)}</span>
                              <span className="badge badge-info">{group.entries.length} events</span>
                            </div>
                            <div className="rc-timeline" style={{ paddingLeft: 0 }}>
                              {group.entries.map((e, i) => (
                                <TimelineEvent key={e.id || i} entry={e} isLast={i === group.entries.length - 1} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : entriesByDate.length === 0 ? (
                    <EmptyState icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                      title="No history found"
                      desc="No historical gate activity found for this person." />
                  ) : (
                    <div className="rc-history-list">
                      {entriesByDate.map(group => (
                        <div key={group.date} className="rc-history-day">
                          <div className="rc-history-day__header">
                            <span className="rc-history-day__date">{formatDate(group.date)}</span>
                            <span className="badge badge-info">{group.entries.length} events</span>
                          </div>
                          <div className="rc-timeline" style={{ paddingLeft: 0 }}>
                            {group.entries.map((e, i) => (
                              <TimelineEvent key={e.id || i} entry={e} isLast={i === group.entries.length - 1} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeInnerTab === 'details' && (
                <div className="rc-person-details-grid">
                  {[
                    { label: 'Registration Code', value: details.registrationCode },
                    { label: 'Role', value: details.roleName },
                    { label: 'Registered', value: formatDateTime(details.registeredAt) },
                    { label: 'Last Scan', value: formatDateTime(details.lastScanAt) },
                    { label: 'Total Scans', value: details.totalScans },
                    { label: 'Divisions Visited', value: (details.divisionsVisited || []).join(', ') || '—' },
                    { label: 'Shift', value: details.shiftName || '—' },
                    {
                      label: 'Working Hours',
                      value:
                        details.shiftTotalHours != null
                          ? `${formatDurationHours(details.shiftTotalHours)}h`
                          : formatShiftWindow(details.shiftStartTime, details.shiftEndTime) || '—',
                    },
                    { label: 'Pay Frequency', value: details.payFrequencyLabel || '—' },
                    { label: 'Gender', value: details.genderLabel || '—' },
                    { label: 'Pay Amount (per day)', value: details.payAmount != null ? formatCurrency(details.payAmount) : '—' },
                  ].map(row => (
                    <div key={row.label} className="rc-detail-row">
                      <span className="rc-detail-row__label">{row.label}</span>
                      <span className="rc-detail-row__value">{row.value || '—'}</span>
                    </div>
                  ))}
                  {(details.details || []).map(d => (
                    <div key={d.label} className="rc-detail-row">
                      <span className="rc-detail-row__label">{d.label}</span>
                      <span className="rc-detail-row__value">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeInnerTab === 'paySlips' && (
                <div>
                  {paySlipHistoryLoading ? (
                    <div className="rc-center-load"><Spinner size={28} /><span>Loading pay slip history…</span></div>
                  ) : paySlipHistory.length === 0 ? (
                    <EmptyState
                      icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>}
                      title="No pay slips found"
                      desc="No generated pay slips are available for this person yet."
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {paySlipHistory.map((slip) => {
                        const isCurrentPeriod = Boolean(dateFrom && dateTo && slip?.fromDate === dateFrom && slip?.toDate === dateTo);
                        const overlapsSelected = Boolean(dateFrom && dateTo && paySlipOverlapsRange(slip, dateFrom, dateTo));
                        return (
                          <div
                            key={slip._id || slip.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              border: '1px solid var(--border-color)',
                              borderRadius: '14px',
                              padding: '1rem 1.1rem',
                              background: isCurrentPeriod || overlapsSelected ? 'var(--surface-secondary)' : 'var(--surface-base)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                <strong>{formatDate(slip.fromDate)} to {formatDate(slip.toDate)}</strong>
                                <span className={`badge ${slip.status === 'Locked' ? 'badge-warning' : 'badge-info'}`}>{slip.status || 'Unknown'}</span>
                                {isCurrentPeriod && <span className="badge badge-info">Current Period</span>}
                                {!isCurrentPeriod && overlapsSelected && <span className="badge badge-warning">Overlaps selected period</span>}
                              </div>
                              <div className="rc-table__muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                <span>Hours: <strong>{slip.totalHours || 0}</strong></span>
                                <span>Amount: <strong>{formatCurrency(slip.amount || 0)}</strong></span>
                                <span>Generated: <strong>{formatDateTime(slip.createdAt)}</strong></span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {dayPassError && !showDayPass && (
          <p className="error-msg" style={{ margin: '0 1.5rem' }}>{dayPassError}</p>
        )}
        {paySlipSuccess && !showDayPass && (
          <p className="success-msg" style={{ margin: '0 1.5rem' }}>{paySlipSuccess}</p>
        )}
        {paySlipAlreadyGenerated && !showDayPass && !paySlipSuccess && (
          <p className="success-msg" style={{ margin: '0 1.5rem' }}>
            Pay slip already generated for this selected period.
          </p>
        )}
        {paySlipPartiallyLocked && !showDayPass && !paySlipSuccess && (
          <p className="success-msg" style={{ margin: '0 1.5rem' }}>
            {lockedDayCount} day{lockedDayCount === 1 ? '' : 's'} already locked from earlier pay slips
            {overlappingLockedSlips.length > 0
              ? ` (${overlappingLockedSlips.map((slip) => `${formatDate(slip.fromDate)} – ${formatDate(slip.toDate)}`).join(', ')})`
              : ''}. Generate will pay only the remaining unlocked days.
          </p>
        )}

        <div className="rc-dialog__footer">
          {!loading && !error && data && (
            <>
              {canShowDayPass && (
                <button
                  type="button"
                  className="btn-primary rc-download-btn"
                  onClick={handleOpenDayPass}
                  disabled={dayPassLoading}
                  title={
                    dayPass
                      ? `View day pass for ${isDayPassToday ? 'today' : formatDate(singleDayDate)}`
                      : 'Day pass appears after a successful gate entry on this date'
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M7 8h10M7 12h6" />
                  </svg>
                  <span>{dayPassLoading ? 'Loading…' : dayPassLabel}</span>
                </button>
              )}
              <button
                type="button"
                className="btn-secondary rc-download-btn"
                onClick={handleExportExcel}
                disabled={Boolean(exporting)}
              >
                <DownloadIcon />
                <span>{exporting === 'excel' ? 'Exporting…' : 'Download Excel'}</span>
              </button>
                <button
                  type="button"
                  className="btn-secondary rc-download-btn"
                  onClick={handleExportPdf}
                  disabled={Boolean(exporting)}
                >
                  <DownloadIcon />
                  <span>{exporting === 'pdf' ? 'Exporting…' : 'Download PDF'}</span>
                </button>
                {canManagePayroll && hasDateRange && (
                  <button
                    type="button"
                    className="btn-enterprise-primary rc-download-btn"
                    onClick={handleGeneratePaySlip}
                    disabled={generatingPaySlip || paySlipStatusLoading || paySlipAlreadyGenerated}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <span>
                      {generatingPaySlip
                        ? 'Generating…'
                        : paySlipStatusLoading
                          ? 'Checking Pay Slip…'
                          : paySlipAlreadyGenerated
                            ? 'Pay Slip Generated'
                            : paySlipPartiallyLocked
                              ? 'Generate Remaining Days'
                              : 'Generate Pay Slip'}
                    </span>
                  </button>
                )}
              </>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {showDayPass && dayPass && (
        <div
          className="rc-dialog-overlay rc-day-pass-overlay"
          onClick={() => setShowDayPass(false)}
          role="dialog"
          aria-modal
          aria-label={dayPassLabel}
        >
          <div className="rc-day-pass-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rc-day-pass-modal__header">
              <div>
                <h3 className="rc-day-pass-modal__title">{dayPassLabel}</h3>
                <p className="rc-day-pass-modal__sub">
                  {details.holderName || '—'}
                  {details.registrationCode ? ` · ${details.registrationCode}` : ''}
                  {singleDayDate ? ` · ${formatDate(singleDayDate)}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="rc-dialog__close"
                onClick={() => setShowDayPass(false)}
                aria-label="Close day pass"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rc-day-pass-modal__body">
              <PassCard pass={dayPass} />
            </div>
          </div>
        </div>
      )}

      {detailEntry && (
        <PortalWrapper>
          <ScanDetailLightbox
            entry={detailEntry}
            workDate={singleDayDate || todayDateStringIst()}
            onClose={() => setDetailEntry(null)}
          />
        </PortalWrapper>
      )}
      <ConfirmActionDialog
        open={paySlipConfirmOpen}
        title="Generate Pay Slip"
        message={paySlipPartiallyLocked
          ? `This period includes ${lockedDayCount} already locked day${lockedDayCount === 1 ? '' : 's'}. Generate a pay slip for the remaining unlocked days only?\n\nPeriod: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`
          : `Generate a pay slip for this person for the selected period?\n\nPeriod: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`}
        confirmLabel={generatingPaySlip ? 'Generating...' : 'Generate Pay Slip'}
        onConfirm={executeGeneratePaySlip}
        onClose={() => !generatingPaySlip && setPaySlipConfirmOpen(false)}
        confirmDisabled={generatingPaySlip}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — TODAY'S ACTIVITY
════════════════════════════════════════════════════════════════ */

/** Short-lived in-memory cache so tab remounts / revisits skip a full reload. */
const REPORT_VIEW_CACHE_TTL_MS = 90_000;
const reportViewCache = new Map();

function reportCacheGet(key) {
  if (!key) return null;
  const hit = reportViewCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > REPORT_VIEW_CACHE_TTL_MS) {
    reportViewCache.delete(key);
    return null;
  }
  return hit.data;
}

function reportCacheSet(key, data) {
  if (!key || data == null) return;
  reportViewCache.set(key, { data, ts: Date.now() });
}

function TodayActivityTab({
  onViewPerson,
  onPrintReady,
  divisionRequired = false,
  selectedDate,
  onDateChange,
  isActive = true,
}) {
  const activityDate = selectedDate || todayDateStringIst();
  const [rangeFrom, setRangeFrom] = useState(() => selectedDate || todayDateStringIst());
  const [rangeTo, setRangeTo] = useState(() => selectedDate || todayDateStringIst());
  const effectiveFrom = divisionRequired ? (rangeFrom || activityDate) : activityDate;
  const effectiveTo = divisionRequired ? (rangeTo || activityDate) : activityDate;
  const cacheKey = `daily:${divisionRequired ? 'div' : 'today'}:${effectiveFrom}:${effectiveTo}:all`;

  const [data, setData] = useState(() => reportCacheGet(cacheKey));
  const [loading, setLoading] = useState(() => !reportCacheGet(cacheKey));
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [payFreqFilter, setPayFreqFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [shiftOptions, setShiftOptions] = useState([]);
  const [dayNightFilter, setDayNightFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [selectionFilters, setSelectionFilters] = useState({});
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [printing, setPrinting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [listTab, setListTab] = useState('department'); // 'department' | 'divisionOnly' | 'allPeople'
  const [drillDepartmentId, setDrillDepartmentId] = useState(null);
  const [drillDivisionId, setDrillDivisionId] = useState(null);
  const [divisionOnlyDrillId, setDivisionOnlyDrillId] = useState(null);
  const intervalRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const periodLabel = `${formatDate(effectiveFrom)} — ${formatDate(effectiveTo)}`;
  const isToday = activityDate === todayDateStringIst();
  const dayLabel = isToday ? 'Today' : formatDate(activityDate);

  const handleSort = useCallback((key) => {
    setSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    ));
  }, []);

  useEffect(() => {
    setDrillDepartmentId(null);
    setDrillDivisionId(null);
    setDivisionOnlyDrillId(null);
  }, [listTab]);

  const clearDepartmentDrill = useCallback(() => {
    setDrillDepartmentId(null);
    setDrillDivisionId(null);
  }, []);

  const clearDivisionOnlyDrill = useCallback(() => {
    setDivisionOnlyDrillId(null);
  }, []);

  useEffect(() => {
    api.reports.divisions()
      .then((res) => setDivisions(Array.isArray(res?.divisions) ? res.divisions : []))
      .catch(() => setDivisions([]));
    api.shifts.list()
      .then((list) => setShiftOptions(Array.isArray(list) ? list : []))
      .catch(() => setShiftOptions([]));
  }, []);

  useEffect(() => {
    setDepartmentFilter('all');
    if (divisionRequired && !divisionFilter) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingDepartments(true);
    const params = { isActive: 'true' };
    if (divisionFilter && divisionFilter !== 'all') params.divisionId = divisionFilter;
    api.departments.list(params)
      .then((list) => {
        if (!cancelled) setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDepartments(false);
      });
    return () => { cancelled = true; };
  }, [divisionFilter, divisionRequired]);

  const load = useCallback(async (silent = false) => {
    if (divisionRequired && !divisionFilter) {
      setData(null);
      dataRef.current = null;
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      if (divisionRequired && effectiveFrom > effectiveTo) {
        setError('From date cannot be after To date.');
        setData(null);
        dataRef.current = null;
        setLoading(false);
        return;
      }
      const params = divisionRequired
        ? { dateFrom: effectiveFrom, dateTo: effectiveTo }
        : { date: activityDate };
      if (divisionFilter !== 'all') params.divisionId = divisionFilter;
      const result = await api.reports.dailyPasses(params);
      const scopedKey = `daily:${divisionRequired ? 'div' : 'today'}:${effectiveFrom}:${effectiveTo}:${divisionFilter}`;
      const tagged = { ...result, __cacheKey: scopedKey };
      setData(tagged);
      reportCacheSet(scopedKey, tagged);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [divisionFilter, divisionRequired, activityDate, effectiveFrom, effectiveTo]);

  useEffect(() => {
    if (divisionRequired && !divisionFilter) {
      setData(null);
      dataRef.current = null;
      setLoading(false);
      return undefined;
    }
    const scopedKey = `daily:${divisionRequired ? 'div' : 'today'}:${effectiveFrom}:${effectiveTo}:${divisionFilter}`;
    const cached = reportCacheGet(scopedKey);
    const scopeChanged = dataRef.current
      && dataRef.current.__cacheKey
      && dataRef.current.__cacheKey !== scopedKey;
    if (scopeChanged) {
      dataRef.current = null;
    }

    // Hidden keep-alive tabs: keep existing/cached data, do not refetch
    if (!isActive) {
      if (!dataRef.current && cached) {
        const hydrated = { ...cached, __cacheKey: scopedKey };
        setData(hydrated);
        dataRef.current = hydrated;
        setLoading(false);
      }
      return undefined;
    }

    // Already loaded for this exact scope — show instantly on tab switch
    if (dataRef.current && dataRef.current.__cacheKey === scopedKey) {
      setLoading(false);
    } else if (cached) {
      const hydrated = { ...cached, __cacheKey: scopedKey };
      setData(hydrated);
      dataRef.current = hydrated;
      setLoading(false);
      load(true);
    } else {
      load();
    }
    if (!divisionRequired && isToday) {
      intervalRef.current = setInterval(() => load(true), 30000);
    }
    return () => clearInterval(intervalRef.current);
  }, [load, divisionFilter, divisionRequired, isToday, isActive, effectiveFrom, effectiveTo]);

  // Flatten all people from all roles (memoized)
  const allPeople = useMemo(
    () => (data?.roles || []).flatMap(r =>
      r.people.map(p => ({ ...p, roleId: r.roleId, roleName: r.roleName, isShiftBased: r.isShiftBased }))
    ),
    [data]
  );

  const selectionColumns = useMemo(() => collectSelectionColumns(allPeople), [allPeople]);
  const roleOptions = useMemo(() => (data?.roles || []).map(r => ({ id: r.roleId, name: r.roleName })), [data]);
  const selectedDivision = useMemo(() => divisions.find(d => d._id === divisionFilter), [divisions, divisionFilter]);
  const selectedDivisionName = selectedDivision?.name || '';
  const selectedDepartment = useMemo(() => departments.find(d => d._id === departmentFilter), [departments, departmentFilter]);
  const selectedDepartmentName = selectedDepartment?.name || '';

  // Union of configured shifts and shift names present in today's rows
  const shiftNameOptions = useMemo(() => [...new Set([
    ...shiftOptions.map(s => s.name),
    ...allPeople.map(p => p.shiftName),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [shiftOptions, allPeople]);

  const filtered = useMemo(() => {
    return allPeople.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (p.displayName || '').toLowerCase().includes(q) ||
        (p.registrationCode || '').toLowerCase().includes(q) ||
        (p.roleName || '').toLowerCase().includes(q);
      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'inside' && p.divisionInside) ||
        (filterStatus === 'outside' && !p.divisionInside && p.hadActivityToday) ||
        (filterStatus === 'entered' && Boolean(p.hadGateActivity || p.gateEntryAt)) ||
        (filterStatus === 'inactive' && !p.divisionInside && !p.hadActivityToday);
      const matchPayFreq = payFreqFilter === 'all' || p.payFrequency === payFreqFilter;
      const matchRole = roleFilter === 'all' || p.roleId === roleFilter;
      const matchShift =
        shiftFilter === 'all' ||
        (shiftFilter === 'none' ? !p.shiftName : p.shiftName === shiftFilter);
      const matchDayNight = matchesDayNightPeriod(p.gateEntryAt, dayNightFilter);
      const matchDepartment =
        departmentFilter === 'all' ||
        (p.currentDepartmentName || '') === selectedDepartmentName;
      const matchSelections = selectionColumns.every(label => {
        const wanted = selectionFilters[label];
        return selectionFilterMatches(selectionValueFor(p, label), wanted);
      });
      return matchSearch && matchStatus && matchPayFreq && matchRole && matchShift && matchDayNight && matchDepartment && matchSelections;
    }).sort((a, b) => {
      const res = compareSortValues(dailySortValue(a, sort.key), dailySortValue(b, sort.key));
      return sort.dir === 'asc' ? res : -res;
    });
  }, [allPeople, search, filterStatus, payFreqFilter, roleFilter, shiftFilter, dayNightFilter, departmentFilter, selectedDepartmentName, selectionColumns, selectionFilters, sort]);

  const departmentSummaries = useMemo(
    () => groupDepartmentActivity(filtered, departments, { includeEmpty: !search && filterStatus === 'all' }),
    [filtered, departments, search, filterStatus]
  );

  const departmentDivisionRows = useMemo(
    () => buildDepartmentDivisionActivityRows(filtered, departments, { includeEmpty: !search && filterStatus === 'all' }),
    [filtered, departments, search, filterStatus]
  );

  const globalUnitSummaries = useMemo(
    () => groupUnitActivity(filtered),
    [filtered]
  );

  const divisionOnlyTableRows = useMemo(
    () => globalUnitSummaries.map((unit) => ({
      rowKey: unit.divisionId || `unit-${unit.divisionName}`,
      divisionId: unit.divisionId,
      divisionName: unit.divisionName,
      enteredCount: unit.enteredCount,
      inCount: unit.inCount,
      exitCount: unit.exitCount,
      total: unit.total,
      isClickable: Boolean(unit.total > 0),
    })),
    [globalUnitSummaries]
  );

  const handleSelectDepartmentDivision = useCallback((row) => {
    if (!row?.isClickable) return;
    const departmentId = row.departmentId || ACTIVITY_UNKNOWN_SCOPE;
    const divisionId = row.divisionId || ACTIVITY_UNKNOWN_SCOPE;
    setDrillDepartmentId(departmentId);
    setDrillDivisionId(divisionId);
  }, []);

  const handleSelectDivisionOnly = useCallback((row) => {
    if (!row?.divisionId && !row?.isClickable) return;
    if (!row?.divisionId) return;
    setDivisionOnlyDrillId(row.divisionId);
  }, []);

  const drilledDepartment = useMemo(() => {
    if (!drillDepartmentId) return null;
    const people = filtered.filter((p) => personMatchesDepartmentScope(p, drillDepartmentId));
    return departmentSummaries.find((row) => String(row.departmentId) === String(drillDepartmentId))
      || {
        departmentId: drillDepartmentId,
        departmentName: people[0]?.departmentName || people[0]?.currentDepartmentName || selectedDepartmentName || 'Department',
        people,
        ...activityGroupStats(people),
      };
  }, [drillDepartmentId, departmentSummaries, filtered, selectedDepartmentName]);

  const drilledUnit = useMemo(() => {
    if (!drillDivisionId) return null;
    const people = filtered.filter(
      (p) => personMatchesDeptDivisionScope(p, drillDepartmentId, drillDivisionId)
    );
    return {
      divisionId: drillDivisionId,
      divisionName: people[0]?.divisionName || selectedDivisionName || 'Unit',
      people,
      ...activityGroupStats(people),
    };
  }, [drillDivisionId, drillDepartmentId, filtered, selectedDivisionName]);

  const drilledDivisionOnly = useMemo(() => {
    if (!divisionOnlyDrillId) return null;
    const people = filtered.filter((p) => personMatchesDivisionScope(p, divisionOnlyDrillId));
    return {
      divisionId: divisionOnlyDrillId,
      divisionName: people[0]?.divisionName || selectedDivisionName || 'Division',
      people,
      ...activityGroupStats(people),
    };
  }, [divisionOnlyDrillId, filtered, selectedDivisionName]);

  const employeeRows = useMemo(() => {
    if (!drillDepartmentId || !drillDivisionId) return [];
    return filtered.filter(
      (p) => personMatchesDeptDivisionScope(p, drillDepartmentId, drillDivisionId)
    );
  }, [drillDepartmentId, drillDivisionId, filtered]);

  const divisionOnlyEmployeeRows = useMemo(() => {
    if (!divisionOnlyDrillId) return [];
    return filtered.filter((p) => personMatchesDivisionScope(p, divisionOnlyDrillId));
  }, [divisionOnlyDrillId, filtered]);

  const employeeWindow = useInfiniteWindow(
    employeeRows,
    ACTIVITY_PEOPLE_PAGE_SIZE,
    `today-emp-${drillDepartmentId}-${drillDivisionId}-${filterStatus}-${search}`
  );
  const divisionOnlyEmployeeWindow = useInfiniteWindow(
    divisionOnlyEmployeeRows,
    ACTIVITY_PEOPLE_PAGE_SIZE,
    `today-div-${divisionOnlyDrillId}-${filterStatus}-${search}`
  );
  const allPeopleWindow = useInfiniteWindow(
    filtered,
    ACTIVITY_PEOPLE_PAGE_SIZE,
    `today-all-${filterStatus}-${search}-${payFreqFilter}-${roleFilter}-${shiftFilter}-${dayNightFilter}-${departmentFilter}`
  );

  const handleStatFilter = useCallback((nextStatus) => {
    // Today activity status values: all | inside | outside | inactive | entered
    if (nextStatus === 'entered') {
      setFilterStatus('entered');
      setListTab('allPeople');
      return;
    }
    if (nextStatus === 'exited') {
      setFilterStatus('outside');
      setListTab('allPeople');
      return;
    }
    if (nextStatus === 'inside') {
      setFilterStatus('inside');
      setListTab('allPeople');
      return;
    }
    setFilterStatus('all');
    setListTab('allPeople');
  }, []);

  const isEmployeeDrill = Boolean(drillDepartmentId && drillDivisionId);
  const isDivisionOnlyEmployeeDrill = Boolean(divisionOnlyDrillId);

  const breadcrumbItems = useMemo(() => {
    const items = [{
      key: 'departments',
      label: 'All Departments',
      onClick: isEmployeeDrill ? clearDepartmentDrill : null,
    }];
    if (drilledDepartment) {
      items.push({
        key: `dept-${drilledDepartment.departmentId}`,
        label: drilledDepartment.departmentName,
      });
    }
    if (drilledUnit) {
      items.push({
        key: `unit-${drilledUnit.divisionId}`,
        label: drilledUnit.divisionName,
      });
    }
    return items;
  }, [isEmployeeDrill, drilledDepartment, drilledUnit, clearDepartmentDrill]);

  const divisionOnlyBreadcrumbItems = useMemo(() => {
    if (!isDivisionOnlyEmployeeDrill || !drilledDivisionOnly) return [];
    return [{
      key: 'divisions',
      label: 'All Divisions',
      onClick: clearDivisionOnlyDrill,
    }, {
      key: `div-${drilledDivisionOnly.divisionId}`,
      label: drilledDivisionOnly.divisionName,
    }];
  }, [isDivisionOnlyEmployeeDrill, drilledDivisionOnly, clearDivisionOnlyDrill]);

  const hierarchyStats = useMemo(() => {
    if (isEmployeeDrill && drilledUnit) {
      return {
        scopeLabel: `${drilledDepartment?.departmentName || 'Department'} · ${drilledUnit.divisionName}`,
        departmentCount: 1,
        departmentSub: drilledDepartment?.departmentName,
        unitCount: 1,
        unitSub: drilledUnit.divisionName,
        employeeSub: 'In this unit',
        ...activityGroupStats(drilledUnit.people),
      };
    }
    const activeDepartments = departmentSummaries.filter((row) => row.total > 0).length;
    const activeUnits = globalUnitSummaries.filter((row) => row.total > 0).length;
    return {
      scopeLabel: departmentFilter !== 'all'
        ? (selectedDepartmentName || 'Filtered department')
        : 'All Departments',
      departmentCount: activeDepartments,
      departmentSub: `${departmentSummaries.length} total`,
      unitCount: activeUnits,
      unitSub: `${globalUnitSummaries.length} total`,
      employeeSub: 'Today check-ins',
      ...activityGroupStats(filtered),
    };
  }, [isEmployeeDrill, drilledDepartment, drilledUnit, departmentFilter, selectedDepartmentName, departmentSummaries, globalUnitSummaries, filtered]);

  const divisionOnlyStats = useMemo(() => {
    if (isDivisionOnlyEmployeeDrill && drilledDivisionOnly) {
      return {
        scopeLabel: drilledDivisionOnly.divisionName,
        departmentCount: 0,
        departmentSub: 'Division view',
        unitCount: 1,
        unitSub: drilledDivisionOnly.divisionName,
        employeeSub: 'In this division',
        ...activityGroupStats(drilledDivisionOnly.people),
      };
    }
    const activeUnits = divisionOnlyTableRows.filter((row) => row.total > 0).length;
    return {
      scopeLabel: 'Division only summary',
      departmentCount: 0,
      departmentSub: 'Division view',
      unitCount: activeUnits,
      unitSub: `${divisionOnlyTableRows.length} total`,
      employeeSub: 'Division check-ins',
      ...activityGroupStats(filtered),
    };
  }, [isDivisionOnlyEmployeeDrill, drilledDivisionOnly, divisionOnlyTableRows, filtered]);

  const handlePrintPdf = useCallback(async () => {
    if (divisionRequired && !selectedDivision) {
      setError('Select a division before exporting attendance.');
      return;
    }
    setPrinting(true);
    try {
      const { downloadDailyAttendancePdf } = await import('@/lib/pdfReportCenter');
      await downloadDailyAttendancePdf(filtered, {
        date: parseDateForPdf(activityDate),
        divisionName: selectedDivision?.name,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to generate PDF');
    } finally {
      setPrinting(false);
    }
  }, [filtered, divisionRequired, selectedDivision, activityDate]);

  useEffect(() => {
    if (!isActive) {
      onPrintReady?.(null);
      return undefined;
    }
    onPrintReady?.(handlePrintPdf);
    return () => onPrintReady?.(null);
  }, [handlePrintPdf, onPrintReady, isActive]);

  const insideCount = filtered.filter(p => p.divisionInside).length;
  const activeCount = filtered.filter(p => p.hadActivityToday).length;

  const openPerson = (registrationId) => {
    const divisionId = divisionFilter !== 'all' ? divisionFilter : '';
    if (!divisionRequired && isToday) {
      onViewPerson(registrationId, divisionId);
    } else {
      onViewPerson(registrationId, divisionId, effectiveFrom, effectiveTo);
    }
  };

  return (
    <div>
      {/* Mobile Filter Toggle */}
      {/* Desktop Toggle */}
      <div className="hide-on-desktop" style={{ marginBottom: '1rem', display: 'none' }}></div>

      {/* Mobile Inline Toolbar */}
      <div className="hide-on-desktop rc-mobile-toolbar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="rc-search-wrap" style={{ flex: 1, minWidth: 0 }}>
          <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="rc-search-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading || printing}
          />
        </div>
        <button type="button" className={`btn-secondary btn-sm ${showFilters ? 'btn-primary' : ''}`} onClick={() => setShowFilters(!showFilters)} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Toggle Filters">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => load()} disabled={loading} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={handlePrintPdf} disabled={printing} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Print">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        </button>
      </div>

      {/* Filters bar */}
      <div className={`rc-filters-bar ${!showFilters ? 'hide-on-mobile' : ''}`}>
        <div className="rc-filters-bar__left">
          <ActivityDatePicker
            value={activityDate}
            onChange={onDateChange}
            displayLabel={isToday ? `Today · ${formatDate(activityDate)}` : formatDate(activityDate)}
            className="rc-activity-date--filter"
          />
          <select
            className="rc-select"
            value={dayNightFilter}
            onChange={(e) => setDayNightFilter(e.target.value)}
            aria-label="Filter by day or night gate entry"
          >
            <option value="all">All Day &amp; Night</option>
            <option value="day">Day (before 6 PM)</option>
            <option value="night">Night (6 PM onwards)</option>
          </select>
          {divisionRequired && (
            <>
              <input type="date" className="rc-select" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} aria-label="From date" />
              <input type="date" className="rc-select" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} aria-label="To date" />
            </>
          )}
          <div className="rc-search-wrap hide-on-mobile">
            <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" className="rc-search-input" placeholder="Search name, code, role…"
              value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" />
          </div>
          {(divisionRequired || divisions.length > 0) && (
            <div className="rc-filter-wrap">
              <SearchableSelect
                options={divisions.map(d => d.name)}
                value={selectedDivisionName}
                onChange={(name) => {
                  if (!name) {
                    setDivisionFilter('all');
                    return;
                  }
                  const selected = divisions.find(d => d.name === name);
                  setDivisionFilter(selected?._id || 'all');
                }}
                placeholder="All Divisions"
                emptyValue=""
                className="rc-select"
              />
            </div>
          )}
          {(divisionRequired || divisions.length > 0) && (
            <div className="rc-filter-wrap">
              <SearchableSelect
                options={departments.map(d => d.name)}
                value={selectedDepartmentName}
                onChange={(name) => {
                  if (!name) {
                    setDepartmentFilter('all');
                    return;
                  }
                  const selected = departments.find(d => d.name === name);
                  setDepartmentFilter(selected?._id || 'all');
                }}
                placeholder={loadingDepartments ? 'Loading…' : 'All Departments'}
                emptyValue=""
                className="rc-select"
                disabled={loadingDepartments}
              />
            </div>
          )}
          <select className="rc-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="all">All Roles</option>
            {roleOptions.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <select className="rc-select" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} aria-label="Filter by shift">
            <option value="all">All Shifts</option>
            <option value="none">No Shift</option>
            {shiftNameOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select className="rc-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <option value="all">All Status</option>
            <option value="inside">Inside</option>
            <option value="entered">Entered</option>
            <option value="outside">Outside</option>
            {!divisionRequired && <option value="inactive">Not In {isToday ? 'Today' : 'This Day'}</option>}
          </select>
          <select className="rc-select" value={payFreqFilter} onChange={e => setPayFreqFilter(e.target.value)} aria-label="Filter by pay frequency">
            <option value="all">All Pay Frequencies</option>
            {PAY_FREQUENCY_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {selectionColumns.map(label => {
            const options = selectionValueOptions(allPeople, label);
            const val = selectionFilters[label] || 'all';
            
            if (options.length > 10) {
              return (
                <div key={`sel-filter-${label}`} style={{ display: 'inline-flex' }}>
                  <SearchableSelect
                    options={options}
                    value={val}
                    onChange={(newVal) => setSelectionFilters(prev => ({ ...prev, [label]: newVal }))}
                    placeholder={`All · ${label}`}
                  />
                </div>
              );
            }

            return (
              <select
                key={`sel-filter-${label}`}
                className="rc-select"
                value={val}
                onChange={e => setSelectionFilters(prev => ({ ...prev, [label]: e.target.value }))}
                aria-label={`Filter by ${label}`}
              >
                <option value="all">All · {label}</option>
                {options.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            );
          })}
        </div>
        {dayNightFilter !== 'all' && (
          <div className="rc-filters-bar__right">
            {dayNightFilter === 'day' && (
              <span className="rc-filter-pill rc-filter-pill--muted">Day · before 6 PM</span>
            )}
            {dayNightFilter === 'night' && (
              <span className="rc-filter-pill rc-filter-pill--muted">Night · 6 PM onwards</span>
            )}
          </div>
        )}
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* View sub-tab mode switcher */}
      <div className="rc-tab-nav" style={{ marginBottom: '1rem' }} role="tablist" aria-label="Today activity views">
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'department'}
          className={`rc-tab-btn ${listTab === 'department' ? 'rc-tab-btn--active' : ''}`}
          onClick={() => { setListTab('department'); setDrillDepartmentId(null); setDrillDivisionId(null); }}
        >
          Department &amp; Division Stats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'divisionOnly'}
          className={`rc-tab-btn ${listTab === 'divisionOnly' ? 'rc-tab-btn--active' : ''}`}
          onClick={() => { setListTab('divisionOnly'); setDivisionOnlyDrillId(null); }}
        >
          Division Only Stats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === 'allPeople'}
          className={`rc-tab-btn ${listTab === 'allPeople' ? 'rc-tab-btn--active' : ''}`}
          onClick={() => setListTab('allPeople')}
        >
          All People List
          <span className="rc-filter-pill" style={{ margin: 0, padding: '0 8px', fontSize: '0.75rem' }}>
            {filtered.length}
          </span>
        </button>
      </div>

      {listTab !== 'allPeople' && (
        <DepartmentActivityHierarchyCards
          stats={listTab === 'divisionOnly' ? divisionOnlyStats : hierarchyStats}
          loading={loading}
          scopeLabel={listTab === 'divisionOnly' ? divisionOnlyStats.scopeLabel : hierarchyStats.scopeLabel}
          onStatFilter={handleStatFilter}
          activeStatFilter={
            filterStatus === 'inside' ? 'inside'
              : filterStatus === 'outside' ? 'exited'
                : filterStatus === 'entered' ? 'entered'
                  : 'all'
          }
        />
      )}

      {divisionRequired && !divisionFilter ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" /></svg>}
          title="Select a division"
          desc={`Choose a division to view only its attendance for ${isToday ? 'today' : dayLabel}.`}
        />
      ) : loading && !data ? (
        <div className="rc-table-loading">
          {[...Array(5)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : listTab === 'department' ? (
        isEmployeeDrill ? (
          <>
            <DepartmentActivityNavBar
              breadcrumbItems={breadcrumbItems}
              onBack={clearDepartmentDrill}
              backLabel="Back to department stats"
            />
            <div className="rc-table-meta" style={{ marginBottom: '0.75rem' }}>
              {drilledDepartment?.departmentName} · {drilledUnit?.divisionName} · {employeeRows.length} employee{employeeRows.length === 1 ? '' : 's'}
            </div>
            <DepartmentActivityPeopleList
              rows={employeeWindow.visibleItems.map(p => ({
                ...p,
                rowKey: p.registrationId,
                currentlyIn: p.divisionInside,
                entryAt: p.gateEntryAt,
                exitAt: p.gateExitAt,
              }))}
              sort={sort}
              onSort={handleSort}
              activityDate={activityDate}
              isToday={isToday}
              onViewPerson={openPerson}
              showDivision
              showDepartment
            />
            <InfiniteScrollSentinel
              loaderRef={employeeWindow.loaderRef}
              hasMore={employeeWindow.hasMore}
              label={`Showing ${employeeWindow.visibleCount} of ${employeeWindow.totalCount}`}
            />
          </>
        ) : (
          <DepartmentDivisionActivityTable
            rows={departmentDivisionRows}
            onSelectRow={handleSelectDepartmentDivision}
            emptyTitle={search || filterStatus !== 'all' ? 'No matching departments/divisions' : `No activity recorded ${isToday ? 'today' : `on ${dayLabel}`}`}
            emptyDesc={search ? 'Try adjusting your search or filters.' : 'No gate activity recorded yet.'}
          />
        )
      ) : listTab === 'divisionOnly' ? (
        isDivisionOnlyEmployeeDrill ? (
          <>
            <DepartmentActivityNavBar
              breadcrumbItems={divisionOnlyBreadcrumbItems}
              onBack={clearDivisionOnlyDrill}
              backLabel="Back to division stats"
            />
            <div className="rc-table-meta" style={{ marginBottom: '0.75rem' }}>
              {drilledDivisionOnly?.divisionName} · {divisionOnlyEmployeeRows.length} employee{divisionOnlyEmployeeRows.length === 1 ? '' : 's'}
            </div>
            <DepartmentActivityPeopleList
              rows={divisionOnlyEmployeeWindow.visibleItems.map(p => ({
                ...p,
                rowKey: p.registrationId,
                currentlyIn: p.divisionInside,
                entryAt: p.gateEntryAt,
                exitAt: p.gateExitAt,
              }))}
              sort={sort}
              onSort={handleSort}
              activityDate={activityDate}
              isToday={isToday}
              onViewPerson={openPerson}
              showDivision
            />
            <InfiniteScrollSentinel
              loaderRef={divisionOnlyEmployeeWindow.loaderRef}
              hasMore={divisionOnlyEmployeeWindow.hasMore}
              label={`Showing ${divisionOnlyEmployeeWindow.visibleCount} of ${divisionOnlyEmployeeWindow.totalCount}`}
            />
          </>
        ) : (
          <DivisionOnlyActivityTable
            rows={divisionOnlyTableRows}
            onSelectRow={handleSelectDivisionOnly}
            emptyTitle={search || filterStatus !== 'all' ? 'No matching divisions' : `No division activity recorded ${isToday ? 'today' : `on ${dayLabel}`}`}
            emptyDesc={search ? 'Try adjusting your search or filters.' : 'No gate activity recorded yet.'}
          />
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          title={search || filterStatus !== 'all' || payFreqFilter !== 'all' || roleFilter !== 'all' || shiftFilter !== 'all' || dayNightFilter !== 'all' || departmentFilter !== 'all' || Object.values(selectionFilters).some(selectionFilterHasActiveValue) ? 'No matching people' : `No attendance ${isToday ? 'today' : `on ${dayLabel}`}`}
          desc={
            search
              ? 'Try adjusting your search or filters.'
              : dayNightFilter === 'day'
                ? `No gate entries before 6 PM ${isToday ? 'today' : `on ${dayLabel}`}.`
                : dayNightFilter === 'night'
                  ? `No gate entries from 6 PM onwards ${isToday ? 'today' : `on ${dayLabel}`}.`
                  : `No gate activity recorded ${isToday ? 'today' : 'for this date'} yet.`
          }
        />
      ) : (
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead>
              <tr>
                <SortHeader label="Person" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Role" columnKey="role" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                {selectionColumns.map(label => (
                  <SortHeader key={`sel-head-${label}`} label={label} columnKey={`sel:${label}`} activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                ))}
                <SortHeader label="Pay Frequency" columnKey="payFreq" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Code" columnKey="code" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Entry Time" columnKey="entry" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Exit Time" columnKey="exit" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <th>Duration</th>
                <SortHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Shift" columnKey="shift" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {allPeopleWindow.visibleItems.map(person => (
                <tr key={person.registrationId} className="rc-table__row"
                  onClick={() => openPerson(person.registrationId)}
                  tabIndex={0} role="button"
                  aria-label={`View report for ${person.displayName || 'Unnamed'}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerson(person.registrationId); } }}>
                  <td>
                    <div className="rc-table__person">
                      <div className="rc-table__status-dot-wrap">
                        <span className={`rc-table__status-dot ${person.divisionInside ? 'rc-table__status-dot--inside' : ''}`} />
                      </div>
                      <Avatar url={person.photoUrl} name={person.displayName} size={34} />
                      <span className="rc-table__name">{person.displayName || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td><span className="rc-table__muted">{person.roleName || '—'}</span></td>
                  {selectionColumns.map(label => (
                    <td key={`sel-${person.registrationId}-${label}`} className="rc-table__muted">{selectionValueFor(person, label)}</td>
                  ))}
                  <td className="rc-table__muted">{person.payFrequencyLabel || '—'}</td>
                  <td><code className="rc-table__code">{person.registrationCode}</code></td>
                  <td className="rc-table__time">
                    {person.gateEntryAt
                      ? formatTime(person.gateEntryAt)
                      : person.activitySeenToday
                        ? <span className="rc-table__muted" title="Activity monitor sighting">{formatTime(person.lastActivitySeenAt)}</span>
                        : '—'}
                  </td>
                  <td className="rc-table__time">
                    {person.gateExitAt ? (
                      <span className="rc-table__time-stack">
                        <span>{formatTime(person.gateExitAt)}</span>
                        {istDateOf(person.gateExitAt) !== activityDate && (
                          <span className="rc-table__time-date" title="Exited on a different day (overnight shift)">
                            {formatShortDate(person.gateExitAt)}
                          </span>
                        )}
                      </span>
                    ) : person.divisionInside ? <span className="rc-badge-live">Active</span> : '—'}
                  </td>
                  <td className="rc-table__time">{calcDuration(person.gateEntryAt, person.gateExitAt || (person.divisionInside && isToday ? new Date() : null))}</td>
                  <td><StatusBadge inside={person.divisionInside} hadActivity={person.hadActivityToday} hadGateActivity={person.hadGateActivity} activitySeen={person.activitySeenToday} /></td>
                  <td>{person.shiftName ? <span className="badge badge-info">{person.shiftName}</span> : <span className="rc-table__muted">—</span>}</td>
                  <td>
                    <button className="rc-table__view-btn" onClick={e => { e.stopPropagation(); openPerson(person.registrationId); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <InfiniteScrollSentinel
            loaderRef={allPeopleWindow.loaderRef}
            hasMore={allPeopleWindow.hasMore}
            label={`Showing ${allPeopleWindow.visibleCount} of ${allPeopleWindow.totalCount}`}
          />
        </div>
      )}
    </div>
  );
}

function activityGroupStats(people = []) {
  return {
    total: people.length,
    enteredCount: people.filter((p) => p.hadEntry || p.gateEntryAt || p.hadGateActivity).length,
    inCount: people.filter((p) => p.currentlyIn || p.divisionInside).length,
    exitCount: people.filter((p) => p.hadExit || p.gateExitAt).length,
  };
}

const ACTIVITY_UNKNOWN_SCOPE = '__unknown__';
const ACTIVITY_PEOPLE_PAGE_SIZE = 50;

function activityScopeKey(id, name, fallback = ACTIVITY_UNKNOWN_SCOPE) {
  const normalizedId = id != null && id !== '' ? String(id) : '';
  if (normalizedId) return normalizedId;
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (normalizedName) return normalizedName;
  return fallback;
}

function personDepartmentScopeKey(person) {
  return activityScopeKey(
    person?.departmentId,
    person?.departmentName || person?.currentDepartmentName
  );
}

function personDivisionScopeKey(person) {
  return activityScopeKey(person?.divisionId, person?.divisionName);
}

function personMatchesDepartmentScope(person, drillDepartmentId) {
  if (drillDepartmentId == null || drillDepartmentId === '') return false;
  const target = String(drillDepartmentId);
  return personDepartmentScopeKey(person) === target
    || String(person?.departmentId || '') === target
    || String(person?.departmentName || '') === target
    || String(person?.currentDepartmentName || '') === target;
}

function personMatchesDivisionScope(person, drillDivisionId) {
  if (drillDivisionId == null || drillDivisionId === '') return false;
  const target = String(drillDivisionId);
  return personDivisionScopeKey(person) === target
    || String(person?.divisionId || '') === target
    || String(person?.divisionName || '') === target;
}

function personMatchesDeptDivisionScope(person, drillDepartmentId, drillDivisionId) {
  return personMatchesDepartmentScope(person, drillDepartmentId)
    && personMatchesDivisionScope(person, drillDivisionId);
}

/** Client-side windowing for large people lists — does not change stats/counts. */
function useInfiniteWindow(items, pageSize = ACTIVITY_PEOPLE_PAGE_SIZE, resetKey = '') {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const loaderRef = useRef(null);
  const itemsLength = Array.isArray(items) ? items.length : 0;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize, itemsLength]);

  const hasMore = visibleCount < itemsLength;
  const visibleItems = useMemo(
    () => (Array.isArray(items) ? items.slice(0, visibleCount) : []),
    [items, visibleCount]
  );

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, itemsLength));
  }, [pageSize, itemsLength]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0.1, rootMargin: '160px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visibleCount]);

  return { visibleItems, hasMore, loaderRef, visibleCount, totalCount: itemsLength };
}

function InfiniteScrollSentinel({ loaderRef, hasMore, label = 'Loading more…' }) {
  if (!hasMore) return null;
  return (
    <div ref={loaderRef} className="rc-infinite-sentinel" aria-hidden={false}>
      <Spinner size={14} />
      <span>{label}</span>
    </div>
  );
}

function compareHierarchyHighToLow(a, b) {
  const inDiff = (b.inCount || 0) - (a.inCount || 0);
  if (inDiff !== 0) return inDiff;
  const totalDiff = (b.total || 0) - (a.total || 0);
  if (totalDiff !== 0) return totalDiff;
  const enteredDiff = (b.enteredCount || 0) - (a.enteredCount || 0);
  if (enteredDiff !== 0) return enteredDiff;
  return (a.departmentName || a.divisionName || '').localeCompare(
    b.departmentName || b.divisionName || '',
    undefined,
    { sensitivity: 'base' }
  );
}

/** Flat department + division rows, departments and units sorted high → low by activity. */
function buildDepartmentDivisionActivityRows(people = [], departmentCatalog = [], { includeEmpty = true } = {}) {
  const deptMap = new Map();

  for (const person of people) {
    const deptId = personDepartmentScopeKey(person);
    const deptName = person.departmentName || person.currentDepartmentName || 'General / Unassigned';
    const divId = personDivisionScopeKey(person);
    const divName = person.divisionName || 'Main Division';
    if (!deptMap.has(deptId)) {
      deptMap.set(deptId, {
        departmentId: deptId,
        departmentName: deptName,
        units: new Map(),
        people: [],
      });
    }
    const dept = deptMap.get(deptId);
    dept.people.push(person);
    if (!dept.units.has(divId)) {
      dept.units.set(divId, {
        divisionId: divId,
        divisionName: divName,
        people: [],
      });
    }
    dept.units.get(divId).people.push(person);
  }

  if (includeEmpty) {
    for (const dept of departmentCatalog) {
      const catalogId = activityScopeKey(dept._id, dept.name);
      if (!deptMap.has(catalogId) && !deptMap.has(String(dept._id))) {
        deptMap.set(catalogId, {
          departmentId: catalogId,
          departmentName: dept.name,
          units: new Map(),
          people: [],
        });
      }
    }
  }

  const departments = [...deptMap.values()].map((dept) => {
    const deptStats = activityGroupStats(dept.people);
    let units = [...dept.units.values()].map((unit) => ({
      ...unit,
      departmentId: dept.departmentId,
      departmentName: dept.departmentName,
      ...activityGroupStats(unit.people),
    }));

    if (units.length === 0) {
      units = [{
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
        divisionId: null,
        divisionName: '—',
        people: [],
        ...activityGroupStats([]),
      }];
    }

    units.sort(compareHierarchyHighToLow);
    return { ...dept, units, ...deptStats };
  });

  departments.sort(compareHierarchyHighToLow);

  const rows = [];
  for (const dept of departments) {
    dept.units.forEach((unit, index) => {
      rows.push({
        rowKey: `${dept.departmentId || 'unknown'}::${unit.divisionId || 'none'}`,
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
        divisionId: unit.divisionId,
        divisionName: unit.divisionName,
        people: unit.people,
        enteredCount: unit.enteredCount,
        inCount: unit.inCount,
        exitCount: unit.exitCount,
        total: unit.total,
        departmentInCount: dept.inCount,
        departmentTotal: dept.total,
        isFirstInDepartment: index === 0,
        departmentRowSpan: dept.units.length,
        isClickable: Boolean(unit.total > 0),
      });
    });
  }

  return rows;
}

/** Group department activity rows by department, including catalog departments with zero activity. */
function groupDepartmentActivity(people = [], departmentCatalog = [], { includeEmpty = true } = {}) {
  const map = new Map();
  for (const person of people) {
    const id = personDepartmentScopeKey(person);
    const name = person.departmentName || person.currentDepartmentName || 'General / Unassigned';
    if (!map.has(id)) {
      map.set(id, {
        departmentId: id,
        departmentName: name,
        people: [],
      });
    }
    map.get(id).people.push(person);
  }
  if (includeEmpty) {
    for (const dept of departmentCatalog) {
      const id = activityScopeKey(dept._id, dept.name);
      if (!map.has(id) && !map.has(String(dept._id))) {
        map.set(id, {
          departmentId: id,
          departmentName: dept.name,
          people: [],
        });
      }
    }
  }
  return [...map.values()]
    .map((group) => ({ ...group, ...activityGroupStats(group.people) }))
    .sort(compareHierarchyHighToLow);
}

/** Group rows by division (organizational unit) within a department. */
function groupUnitActivity(people = []) {
  const map = new Map();
  for (const person of people) {
    const id = personDivisionScopeKey(person);
    const name = person.divisionName || 'Main Division';
    if (!map.has(id)) {
      map.set(id, {
        divisionId: id,
        divisionName: name,
        people: [],
      });
    }
    map.get(id).people.push(person);
  }
  return [...map.values()]
    .map((group) => ({ ...group, ...activityGroupStats(group.people) }))
    .sort(compareHierarchyHighToLow);
}

function DepartmentHierarchyStatCard({ label, value, sub, color = 'primary', loading, onClick, active }) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`rc-dept-hierarchy-card rc-dept-hierarchy-card--${color}${clickable ? ' rc-dept-hierarchy-card--clickable' : ''}${active ? ' rc-dept-hierarchy-card--active' : ''}`.trim()}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(active) : undefined}
    >
      <div className="rc-dept-hierarchy-card__value">
        {loading ? <span className="rc-skeleton rc-skeleton--sm" /> : fmt(value)}
      </div>
      <div className="rc-dept-hierarchy-card__label">{label}</div>
      {sub ? <div className="rc-dept-hierarchy-card__sub">{sub}</div> : null}
    </div>
  );
}

function DepartmentActivityHierarchyCards({ stats, loading, scopeLabel, onStatFilter, activeStatFilter }) {
  return (
    <section className="rc-dept-hierarchy" aria-label="Department activity summary">
      {scopeLabel ? <p className="rc-dept-hierarchy__scope">{scopeLabel}</p> : null}
      <div className="rc-dept-hierarchy__grid">
        <DepartmentHierarchyStatCard
          label="Departments"
          value={stats.departmentCount}
          sub={stats.departmentSub}
          color="primary"
          loading={loading}
        />
        <DepartmentHierarchyStatCard
          label="Units"
          value={stats.unitCount}
          sub={stats.unitSub}
          color="info"
          loading={loading}
        />
        <DepartmentHierarchyStatCard
          label="Employees"
          value={stats.total}
          sub={stats.employeeSub}
          color="warning"
          loading={loading}
          onClick={onStatFilter ? () => onStatFilter('all') : undefined}
          active={activeStatFilter === 'all'}
        />
        <DepartmentHierarchyStatCard
          label="Entered"
          value={stats.enteredCount}
          color="primary"
          loading={loading}
          onClick={onStatFilter ? () => onStatFilter('entered') : undefined}
          active={activeStatFilter === 'entered'}
        />
        <DepartmentHierarchyStatCard
          label="Currently In"
          value={stats.inCount}
          color="success"
          loading={loading}
          onClick={onStatFilter ? () => onStatFilter('inside') : undefined}
          active={activeStatFilter === 'inside'}
        />
        <DepartmentHierarchyStatCard
          label="Exited"
          value={stats.exitCount}
          color="danger"
          loading={loading}
          onClick={onStatFilter ? () => onStatFilter('exited') : undefined}
          active={activeStatFilter === 'exited'}
        />
      </div>
    </section>
  );
}

function DepartmentActivityPersonStatus({ person }) {
  if (person.currentlyIn) {
    return <span className="badge badge-success rc-status-badge">In</span>;
  }
  if (person.hadExit) {
    return <span className="badge badge-info rc-status-badge">Exited</span>;
  }
  return <span className="badge badge-info rc-status-badge">Entered</span>;
}

function DepartmentActivityPersonExit({ person, activityDate, isToday }) {
  if (person.exitAt) {
    return (
      <span className="rc-table__time-stack">
        <span>{formatTime(person.exitAt)}</span>
        {istDateOf(person.exitAt) !== activityDate && (
          <span className="rc-table__time-date" title="Exited on a different day">
            {formatShortDate(person.exitAt)}
          </span>
        )}
      </span>
    );
  }
  if (person.currentlyIn) {
    return <span className="rc-badge-live">In</span>;
  }
  return '—';
}

function DepartmentActivityPersonMobileCard({
  person,
  activityDate,
  isToday,
  onView,
  showDivision = false,
  showDepartment = false,
}) {
  const handleActivate = () => onView(person.registrationId, person.divisionId);

  return (
    <article
      className="rc-dept-person-card"
      onClick={handleActivate}
      tabIndex={0}
      role="button"
      aria-label={`View report for ${person.displayName || 'Unnamed'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="rc-dept-person-card__header">
        <div className="rc-dept-person-card__identity">
          <div className="rc-table__status-dot-wrap">
            <span className={`rc-table__status-dot ${person.currentlyIn ? 'rc-table__status-dot--inside' : ''}`} />
          </div>
          <Avatar url={person.photoUrl} name={person.displayName} size={40} />
          <div className="rc-dept-person-card__name-wrap">
            <span className="rc-dept-person-card__name">{person.displayName || 'Unnamed'}</span>
            <span className="rc-dept-person-card__meta">
              {person.roleName || '—'}
              {' · '}
              <code className="rc-table__code">{person.registrationCode}</code>
            </span>
            {(showDivision || showDepartment) && (
              <span className="rc-dept-person-card__location">
                {showDepartment && person.departmentName ? person.departmentName : null}
                {showDepartment && showDivision && person.departmentName && person.divisionName ? ' · ' : null}
                {showDivision && person.divisionName ? person.divisionName : null}
              </span>
            )}
          </div>
        </div>
        <DepartmentActivityPersonStatus person={person} />
      </div>

      <div className="rc-dept-person-card__metrics">
        <div className="rc-dept-person-card__metric">
          <span className="rc-dept-person-card__metric-label">Entry</span>
          <span className="rc-dept-person-card__metric-value">{person.entryAt ? formatTime(person.entryAt) : '—'}</span>
        </div>
        <div className="rc-dept-person-card__metric">
          <span className="rc-dept-person-card__metric-label">Exit</span>
          <span className="rc-dept-person-card__metric-value rc-dept-person-card__metric-value--exit">
            <DepartmentActivityPersonExit person={person} activityDate={activityDate} isToday={isToday} />
          </span>
        </div>
        <div className="rc-dept-person-card__metric">
          <span className="rc-dept-person-card__metric-label">Duration</span>
          <span className="rc-dept-person-card__metric-value">
            {calcDuration(
              person.entryAt,
              person.exitAt || (person.currentlyIn && isToday ? new Date() : null)
            )}
          </span>
        </div>
      </div>

      {person.remark ? (
        <p className="rc-dept-person-card__remark">{person.remark}</p>
      ) : null}

      <button
        type="button"
        className="rc-dept-person-card__view-btn"
        onClick={(e) => {
          e.stopPropagation();
          handleActivate();
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        View report
      </button>
    </article>
  );
}

function DepartmentActivityPeopleList({
  rows,
  sort,
  onSort,
  activityDate,
  isToday,
  onViewPerson,
  showDivision = false,
  showDepartment = false,
}) {
  const renderPersonRow = (person) => (
    <tr
      key={person.rowKey || `${person.registrationId}-${person.departmentId || 'div'}`}
      className="rc-table__row"
      onClick={() => onViewPerson(person.registrationId, person.divisionId)}
      tabIndex={0}
      role="button"
      aria-label={`View report for ${person.displayName || 'Unnamed'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewPerson(person.registrationId, person.divisionId);
        }
      }}
    >
      <td>
        <div className="rc-table__person">
          <div className="rc-table__status-dot-wrap">
            <span className={`rc-table__status-dot ${person.currentlyIn ? 'rc-table__status-dot--inside' : ''}`} />
          </div>
          <Avatar url={person.photoUrl} name={person.displayName} size={34} />
          <span className="rc-table__name">{person.displayName || 'Unnamed'}</span>
        </div>
      </td>
      <td><span className="rc-table__muted">{person.roleName || '—'}</span></td>
      <td><code className="rc-table__code">{person.registrationCode}</code></td>
      {showDivision && (
        <td><span className="rc-table__muted">{person.divisionName || '—'}</span></td>
      )}
      {showDepartment && (
        <td><span className="rc-table__muted">{person.departmentName || '—'}</span></td>
      )}
      <td className="rc-table__time">{person.entryAt ? formatTime(person.entryAt) : '—'}</td>
      <td className="rc-table__time">
        <DepartmentActivityPersonExit person={person} activityDate={activityDate} isToday={isToday} />
      </td>
      <td className="rc-table__time">
        {calcDuration(
          person.entryAt,
          person.exitAt || (person.currentlyIn && isToday ? new Date() : null)
        )}
      </td>
      <td>
        <DepartmentActivityPersonStatus person={person} />
      </td>
      <td className="rc-table__muted">{person.remark || '—'}</td>
      <td>
        <button
          className="rc-table__view-btn"
          onClick={(e) => { e.stopPropagation(); onViewPerson(person.registrationId, person.divisionId); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          View
        </button>
      </td>
    </tr>
  );

  return (
    <>
      <div className="rc-dept-person-cards hide-on-desktop">
        {rows.map((person) => (
          <DepartmentActivityPersonMobileCard
            key={person.rowKey || `${person.registrationId}-${person.departmentId || 'div'}`}
            person={person}
            activityDate={activityDate}
            isToday={isToday}
            onView={onViewPerson}
            showDivision={showDivision}
            showDepartment={showDepartment}
          />
        ))}
      </div>
      <div className="rc-table-wrap rc-dept-person-table-wrap hide-on-mobile">
        <table className="rc-table">
          <thead>
            <tr>
              <SortHeader label="Person" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              <SortHeader label="Role" columnKey="role" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              <SortHeader label="Code" columnKey="code" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              {showDivision && (
                <SortHeader label="Division" columnKey="division" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              )}
              {showDepartment && (
                <SortHeader label="Department" columnKey="department" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              )}
              <SortHeader label="Entry Time" columnKey="entry" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              <SortHeader label="Exit Time" columnKey="exit" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              <th>Duration</th>
              <SortHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
              <th>Remark</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => renderPersonRow(person))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DepartmentActivityStatsMetrics({ row }) {
  return (
    <div className="rc-dept-stats-card__metrics">
      <div className="rc-dept-stats-card__metric">
        <span className="rc-dept-stats-card__metric-label">Entered</span>
        <span className="rc-dept-stats-card__metric-value">{row.enteredCount}</span>
      </div>
      <div className="rc-dept-stats-card__metric">
        <span className="rc-dept-stats-card__metric-label">In</span>
        <span className="rc-dept-stats-card__metric-value rc-dept-stats-card__metric-value--in">{row.inCount}</span>
      </div>
      <div className="rc-dept-stats-card__metric">
        <span className="rc-dept-stats-card__metric-label">Exited</span>
        <span className="rc-dept-stats-card__metric-value">{row.exitCount}</span>
      </div>
      <div className="rc-dept-stats-card__metric">
        <span className="rc-dept-stats-card__metric-label">Total</span>
        <span className="rc-dept-stats-card__metric-value">{row.total}</span>
      </div>
    </div>
  );
}

function groupDepartmentDivisionRowsForMobile(rows = []) {
  const groups = [];
  for (const row of rows) {
    if (row.isFirstInDepartment || groups.length === 0) {
      groups.push({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        departmentInCount: row.departmentInCount,
        departmentTotal: row.departmentTotal,
        units: [row],
      });
    } else {
      groups[groups.length - 1].units.push(row);
    }
  }
  return groups;
}

function DepartmentActivityStatsMobileCard({
  row,
  onSelect,
  showDepartment = true,
  compact = false,
  ariaLabel,
}) {
  const handleActivate = () => {
    if (row.isClickable) onSelect(row);
  };

  return (
    <article
      className={`rc-dept-stats-card ${compact ? 'rc-dept-stats-card--nested' : ''} ${row.isClickable ? 'rc-dept-stats-card--clickable' : ''}`.trim()}
      onClick={handleActivate}
      tabIndex={row.isClickable ? 0 : -1}
      role={row.isClickable ? 'button' : undefined}
      aria-label={row.isClickable ? ariaLabel : undefined}
      onKeyDown={(e) => {
        if (!row.isClickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="rc-dept-stats-card__header">
        <div className="rc-dept-stats-card__titles">
          {compact ? (
            <div className="rc-dept-stats-card__title-row">
              <span className="rc-dept-stats-card__unit-title">{row.divisionName}</span>
              {row.inCount > 0 && (
                <span className="rc-dept-stats-card__live-pill">
                  <span className="rc-table__status-dot rc-table__status-dot--inside" />
                  {row.inCount} in
                </span>
              )}
            </div>
          ) : showDepartment ? (
            <>
              <span className="rc-dept-stats-card__dept">{row.departmentName}</span>
              <span className="rc-dept-stats-card__unit">{row.divisionName}</span>
            </>
          ) : (
            <span className="rc-dept-stats-card__dept">{row.divisionName}</span>
          )}
          {!compact && row.inCount > 0 && (
            <span className="rc-dept-stats-table__live">
              <span className="rc-table__status-dot rc-table__status-dot--inside" />
              {row.inCount} live
            </span>
          )}
        </div>
        {row.isClickable ? (
          <span className="rc-dept-stats-table__chevron" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </span>
        ) : null}
      </div>
      <div className="rc-dept-stats-card__inline-stats">
        <span className="rc-dept-stats-card__stat-item">
          Entered <strong className="rc-dept-stats-card__stat-val">{row.enteredCount}</strong>
        </span>
        <span className="rc-dept-stats-card__stat-sep">•</span>
        <span className="rc-dept-stats-card__stat-item">
          In <strong className="rc-dept-stats-card__stat-val rc-dept-stats-card__stat-val--in">{row.inCount}</strong>
        </span>
        <span className="rc-dept-stats-card__stat-sep">•</span>
        <span className="rc-dept-stats-card__stat-item">
          Exited <strong className="rc-dept-stats-card__stat-val">{row.exitCount}</strong>
        </span>
        <span className="rc-dept-stats-card__stat-sep">•</span>
        <span className="rc-dept-stats-card__stat-item">
          Total <strong className="rc-dept-stats-card__stat-val">{row.total}</strong>
        </span>
      </div>
    </article>
  );
}

function DepartmentDivisionActivityMobileList({ rows, onSelectRow }) {
  const groups = useMemo(() => groupDepartmentDivisionRowsForMobile(rows), [rows]);

  return (
    <div className="rc-dept-stats-cards hide-on-desktop">
      {groups.map((group) => (
        <section
          key={group.departmentId || group.departmentName}
          className="rc-dept-stats-group"
          aria-label={`${group.departmentName} activity`}
        >
          <div className="rc-dept-stats-group__panel">
            <header className="rc-dept-stats-group__header">
              <h3 className="rc-dept-stats-group__title">{group.departmentName}</h3>
              <div className="rc-dept-stats-group__meta">
                {group.departmentInCount > 0 && (
                  <span className="rc-dept-stats-group__pill rc-dept-stats-group__pill--live">
                    <span className="rc-table__status-dot rc-table__status-dot--inside" />
                    {group.departmentInCount} in
                  </span>
                )}
                {group.departmentTotal > 0 && (
                  <span className="rc-dept-stats-group__pill">{group.departmentTotal} total</span>
                )}
              </div>
            </header>
            <div className="rc-dept-stats-group__units">
              {group.units.map((row) => (
                <DepartmentActivityStatsMobileCard
                  key={row.rowKey}
                  row={row}
                  onSelect={onSelectRow}
                  showDepartment={false}
                  compact
                  ariaLabel={`View employees in ${group.departmentName} · ${row.divisionName}`}
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function DivisionOnlyActivityTable({ rows, onSelectRow, emptyTitle, emptyDesc }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title={emptyTitle}
        desc={emptyDesc}
      />
    );
  }

  return (
    <>
      <div className="rc-dept-stats-cards hide-on-desktop">
        {rows.map((row) => (
          <DepartmentActivityStatsMobileCard
            key={row.rowKey}
            row={row}
            onSelect={onSelectRow}
            showDepartment={false}
            ariaLabel={`View employees in ${row.divisionName}`}
          />
        ))}
      </div>
      <div className="rc-table-wrap rc-dept-stats-table-wrap hide-on-mobile">
      <table className="rc-table rc-dept-stats-table">
        <thead>
          <tr>
            <th>Division / Unit</th>
            <th>Entered</th>
            <th>Currently In</th>
            <th>Exited</th>
            <th>Total</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const handleActivate = () => {
              if (row.isClickable) onSelectRow(row);
            };
            return (
              <tr
                key={row.rowKey}
                className={`rc-table__row rc-dept-stats-table__row ${row.isClickable ? 'rc-dept-stats-table__row--clickable' : 'rc-dept-stats-table__row--static'}`.trim()}
                onClick={handleActivate}
                tabIndex={row.isClickable ? 0 : -1}
                role={row.isClickable ? 'button' : undefined}
                aria-label={row.isClickable ? `View employees in ${row.divisionName}` : undefined}
                onKeyDown={(e) => {
                  if (!row.isClickable) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivate();
                  }
                }}
              >
                <td>
                  <div className="rc-dept-stats-table__name">
                    <span className="rc-dept-stats-table__title">{row.divisionName}</span>
                    {row.inCount > 0 && (
                      <span className="rc-dept-stats-table__live">
                        <span className="rc-table__status-dot rc-table__status-dot--inside" />
                        {row.inCount} live
                      </span>
                    )}
                  </div>
                </td>
                <td className="rc-dept-stats-table__num">{row.enteredCount}</td>
                <td className="rc-dept-stats-table__num rc-dept-stats-table__num--in">{row.inCount}</td>
                <td className="rc-dept-stats-table__num">{row.exitCount}</td>
                <td className="rc-dept-stats-table__num">{row.total}</td>
                <td>
                  {row.isClickable ? (
                    <span className="rc-dept-stats-table__chevron" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}

function DepartmentActivityNavBar({ breadcrumbItems, onBack, backLabel = 'Back to stats' }) {
  if (!onBack && !breadcrumbItems?.length) return null;
  return (
    <div className="rc-dept-nav">
      {onBack ? (
        <button type="button" className="btn-secondary btn-sm rc-dept-nav__back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
          {backLabel}
        </button>
      ) : null}
      {breadcrumbItems?.length ? <DepartmentActivityBreadcrumb items={breadcrumbItems} /> : null}
    </div>
  );
}

function DepartmentDivisionActivityTable({ rows, onSelectRow, emptyTitle, emptyDesc }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
        title={emptyTitle}
        desc={emptyDesc}
      />
    );
  }

  return (
    <>
      <DepartmentDivisionActivityMobileList rows={rows} onSelectRow={onSelectRow} />
      <div className="rc-table-wrap rc-dept-stats-table-wrap hide-on-mobile">
      <table className="rc-table rc-dept-stats-table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Division / Unit</th>
            <th>Entered</th>
            <th>Currently In</th>
            <th>Exited</th>
            <th>Total</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const handleActivate = () => {
              if (row.isClickable) onSelectRow(row);
            };
            return (
              <tr
                key={row.rowKey}
                className={`rc-table__row rc-dept-stats-table__row ${row.isFirstInDepartment ? 'rc-dept-stats-table__row--dept-start' : ''} ${row.isClickable ? 'rc-dept-stats-table__row--clickable' : 'rc-dept-stats-table__row--static'}`.trim()}
                onClick={handleActivate}
                tabIndex={row.isClickable ? 0 : -1}
                role={row.isClickable ? 'button' : undefined}
                aria-label={row.isClickable ? `View employees in ${row.departmentName} · ${row.divisionName}` : undefined}
                onKeyDown={(e) => {
                  if (!row.isClickable) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivate();
                  }
                }}
              >
                {row.isFirstInDepartment && (
                  <td rowSpan={row.departmentRowSpan} className="rc-dept-stats-table__dept-cell">
                    <div className="rc-dept-stats-table__name">
                      <span className="rc-dept-stats-table__title">{row.departmentName}</span>
                      {row.departmentTotal > 0 && (
                        <span className="rc-dept-stats-table__dept-total">{row.departmentTotal} total</span>
                      )}
                      {row.departmentInCount > 0 && (
                        <span className="rc-dept-stats-table__live">
                          <span className="rc-table__status-dot rc-table__status-dot--inside" />
                          {row.departmentInCount} live
                        </span>
                      )}
                    </div>
                  </td>
                )}
                <td>
                  <div className="rc-dept-stats-table__name">
                    <span className="rc-dept-stats-table__unit">{row.divisionName}</span>
                    {row.inCount > 0 && (
                      <span className="rc-dept-stats-table__live">
                        <span className="rc-table__status-dot rc-table__status-dot--inside" />
                        {row.inCount} live
                      </span>
                    )}
                  </div>
                </td>
                <td className="rc-dept-stats-table__num">{row.enteredCount}</td>
                <td className="rc-dept-stats-table__num rc-dept-stats-table__num--in">{row.inCount}</td>
                <td className="rc-dept-stats-table__num">{row.exitCount}</td>
                <td className="rc-dept-stats-table__num">{row.total}</td>
                <td>
                  {row.isClickable ? (
                    <span className="rc-dept-stats-table__chevron" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}

function DepartmentActivityBreadcrumb({ items }) {
  if (!items.length) return null;
  return (
    <nav className="rc-dept-breadcrumb" aria-label="Department activity navigation">
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <span className="rc-dept-breadcrumb__sep" aria-hidden>/</span>}
          {item.onClick ? (
            <button type="button" className="rc-dept-breadcrumb__link" onClick={item.onClick}>
              {item.label}
            </button>
          ) : (
            <span className="rc-dept-breadcrumb__current">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/**
 * Department Activity — loads all department check-ins by default (All Status),
 * with optional division/department filters. Drill down: departments → units → employees.
 */
function DepartmentActivityTab({ onViewPerson, selectedDate, onDateChange, isActive = true }) {
  const activityDate = selectedDate || todayDateStringIst();
  const [rangeFrom, setRangeFrom] = useState(() => selectedDate || todayDateStringIst());
  const [rangeTo, setRangeTo] = useState(() => selectedDate || todayDateStringIst());
  const effectiveFrom = rangeFrom || activityDate;
  const effectiveTo = rangeTo || activityDate;
  const deptCacheKey = `department:${effectiveFrom}:${effectiveTo}`;

  const [data, setData] = useState(() => reportCacheGet(deptCacheKey));
  const [statsLoading, setStatsLoading] = useState(() => !reportCacheGet(deptCacheKey));
  const [peopleLoading, setPeopleLoading] = useState(() => !reportCacheGet(deptCacheKey));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [sort, setSort] = useState({ key: 'entry', dir: 'desc' });
  const [listTab, setListTab] = useState('department'); // 'department' | 'divisionOnly'
  const [drillDepartmentId, setDrillDepartmentId] = useState(null);
  const [drillDivisionId, setDrillDivisionId] = useState(null);
  const [divisionOnlyDrillId, setDivisionOnlyDrillId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const intervalRef = useRef(null);
  const loadSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const dataRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const isToday = activityDate === todayDateStringIst();
  const dayLabel = isToday ? 'Today' : formatDate(activityDate);
  const periodLabel = `${formatDate(effectiveFrom)} — ${formatDate(effectiveTo)}`;
  const peopleReady = Boolean(data && !data._statsOnly && !peopleLoading);
  const PEOPLE_FETCH_LIMIT = ACTIVITY_PEOPLE_PAGE_SIZE;

  const handleSort = useCallback((key) => {
    setSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    ));
  }, []);

  useEffect(() => {
    api.reports.divisions()
      .then((res) => setDivisions(Array.isArray(res?.divisions) ? res.divisions : []))
      .catch(() => setDivisions([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDepartments(true);
    const params = { isActive: 'true' };
    if (divisionFilter && divisionFilter !== 'all') params.divisionId = divisionFilter;
    api.departments.list(params)
      .then((list) => {
        if (!cancelled) setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDepartments(false);
      });
    return () => { cancelled = true; };
  }, [divisionFilter]);

  useEffect(() => {
    setDrillDepartmentId(null);
    setDrillDivisionId(null);
    setDivisionOnlyDrillId(null);
  }, [listTab]);

  const clearDepartmentDrill = useCallback(() => {
    setDrillDepartmentId(null);
    setDrillDivisionId(null);
  }, []);

  const clearDivisionOnlyDrill = useCallback(() => {
    setDivisionOnlyDrillId(null);
  }, []);

  const mergePeopleByKey = useCallback((existing = [], incoming = []) => {
    const map = new Map();
    for (const person of existing) {
      const key = person.rowKey || `${person.registrationId}-${person.departmentId || 'div'}`;
      map.set(key, person);
    }
    for (const person of incoming) {
      const key = person.rowKey || `${person.registrationId}-${person.departmentId || 'div'}`;
      map.set(key, { ...map.get(key), ...person });
    }
    return [...map.values()];
  }, []);

  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeqRef.current;
    if (!silent) {
      setStatsLoading(true);
      setPeopleLoading(true);
    }
    setError('');
    try {
      if (effectiveFrom > effectiveTo) {
        if (seq !== loadSeqRef.current) return;
        setError('From date cannot be after To date.');
        setData(null);
        setStatsLoading(false);
        setPeopleLoading(false);
        return;
      }
      const params = {
        dateFrom: effectiveFrom,
        dateTo: effectiveTo,
      };

      if (silent) {
        // Refresh counts + roster from lightweight stats; keep already-loaded details.
        const statsResult = await api.reports.departmentActivity({
          ...params,
          statsOnly: 'true',
        });
        if (seq !== loadSeqRef.current) return;
        setData((prev) => {
          if (!prev) {
            return { ...statsResult, _statsOnly: true, page: 1, hasMore: true };
          }
          return {
            ...prev,
            people: mergePeopleByKey(statsResult.people || [], prev.people || []),
            divisionOnlyPeople: mergePeopleByKey(
              statsResult.divisionOnlyPeople || [],
              prev.divisionOnlyPeople || []
            ),
            enteredCount: statsResult.enteredCount ?? prev.enteredCount,
            inCount: statsResult.inCount ?? prev.inCount,
            exitCount: statsResult.exitCount ?? prev.exitCount,
            divisionOnlyCount: statsResult.divisionOnlyCount ?? prev.divisionOnlyCount,
            total: Array.isArray(statsResult.people) ? statsResult.people.length : prev.total,
            divisionOnlyTotal: Array.isArray(statsResult.divisionOnlyPeople)
              ? statsResult.divisionOnlyPeople.length
              : prev.divisionOnlyTotal,
            date: statsResult.date || prev.date,
            dateFrom: statsResult.dateFrom || prev.dateFrom,
            dateTo: statsResult.dateTo || prev.dateTo,
          };
        });
        setPeopleLoading(false);
        setStatsLoading(false);
        return;
      }

      api.reports.departmentActivity({ ...params, statsOnly: 'true' })
        .then((statsResult) => {
          if (seq !== loadSeqRef.current) return;
          setData({
            ...statsResult,
            _statsOnly: true,
            // Full lightweight people stay available for stats + drill-down
            page: 1,
            hasMore: true,
          });
          setStatsLoading(false);
        })
        .catch((e) => {
          if (seq !== loadSeqRef.current) return;
          setError(e.message);
          setStatsLoading(false);
        });

      const peopleResult = await api.reports.departmentActivity({
        ...params,
        page: 1,
        limit: PEOPLE_FETCH_LIMIT,
      });
      if (seq !== loadSeqRef.current) return;
      setData((prev) => {
        const basePeople = prev?._statsOnly ? (prev.people || []) : [];
        const baseDivisionOnly = prev?._statsOnly ? (prev.divisionOnlyPeople || []) : [];
        const merged = {
          ...peopleResult,
          people: mergePeopleByKey(basePeople, peopleResult.people || []),
          divisionOnlyPeople: mergePeopleByKey(baseDivisionOnly, peopleResult.divisionOnlyPeople || []),
          enteredCount: peopleResult.enteredCount ?? prev?.enteredCount,
          inCount: peopleResult.inCount ?? prev?.inCount,
          exitCount: peopleResult.exitCount ?? prev?.exitCount,
          divisionOnlyCount: peopleResult.divisionOnlyCount ?? prev?.divisionOnlyCount,
          total: peopleResult.total ?? prev?.total,
          divisionOnlyTotal: peopleResult.divisionOnlyTotal ?? prev?.divisionOnlyTotal,
          hasMore: Boolean(peopleResult.hasMore),
          page: peopleResult.page || 1,
          _statsOnly: false,
          __cacheKey: `department:${effectiveFrom}:${effectiveTo}`,
        };
        reportCacheSet(`department:${effectiveFrom}:${effectiveTo}`, merged);
        return merged;
      });
      setPeopleLoading(false);
      setStatsLoading(false);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(e.message);
      setPeopleLoading(false);
      setStatsLoading(false);
    }
  }, [effectiveFrom, effectiveTo, PEOPLE_FETCH_LIMIT, mergePeopleByKey]);

  const loadMorePeople = useCallback(async () => {
    if (!data || data._statsOnly || peopleLoading || loadingMoreRef.current || !data.hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = (data.page || 1) + 1;
      const nextData = await api.reports.departmentActivity({
        dateFrom: effectiveFrom,
        dateTo: effectiveTo,
        page: nextPage,
        limit: PEOPLE_FETCH_LIMIT,
      });
      setData((prev) => {
        if (!prev) return nextData;
        const merged = {
          ...prev,
          ...nextData,
          people: mergePeopleByKey(prev.people || [], nextData.people || []),
          divisionOnlyPeople: mergePeopleByKey(
            prev.divisionOnlyPeople || [],
            nextData.divisionOnlyPeople || []
          ),
          // Keep authoritative totals from the server response
          enteredCount: nextData.enteredCount ?? prev.enteredCount,
          inCount: nextData.inCount ?? prev.inCount,
          exitCount: nextData.exitCount ?? prev.exitCount,
          divisionOnlyCount: nextData.divisionOnlyCount ?? prev.divisionOnlyCount,
          total: nextData.total ?? prev.total,
          divisionOnlyTotal: nextData.divisionOnlyTotal ?? prev.divisionOnlyTotal,
          page: nextData.page || nextPage,
          hasMore: Boolean(nextData.hasMore),
          _statsOnly: false,
        };
        reportCacheSet(`department:${effectiveFrom}:${effectiveTo}`, merged);
        return merged;
      });
    } catch (e) {
      setError(e.message || 'Failed to load more people');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [data, effectiveFrom, effectiveTo, peopleLoading, PEOPLE_FETCH_LIMIT, mergePeopleByKey]);

  useEffect(() => {
    const cacheKey = `department:${effectiveFrom}:${effectiveTo}`;
    const cached = reportCacheGet(cacheKey);
    const scopeChanged = dataRef.current
      && dataRef.current.__cacheKey
      && dataRef.current.__cacheKey !== cacheKey;
    if (scopeChanged) {
      dataRef.current = null;
    }

    if (!isActive) {
      if (!dataRef.current && cached) {
        const hydrated = { ...cached, __cacheKey: cacheKey };
        setData(hydrated);
        dataRef.current = hydrated;
        setStatsLoading(false);
        setPeopleLoading(false);
      }
      return undefined;
    }

    if (dataRef.current && dataRef.current.__cacheKey === cacheKey) {
      setStatsLoading(false);
      setPeopleLoading(false);
    } else if (cached) {
      const hydrated = { ...cached, __cacheKey: cacheKey };
      setData(hydrated);
      dataRef.current = hydrated;
      setStatsLoading(false);
      setPeopleLoading(false);
      load(true);
    } else {
      load();
    }
    if (effectiveFrom === todayDateStringIst() && effectiveTo === todayDateStringIst()) {
      intervalRef.current = setInterval(() => load(true), 30000);
    }
    return () => clearInterval(intervalRef.current);
  }, [load, effectiveFrom, effectiveTo, isActive]);

  const allPeople = data?.people || [];
  const divisionOnlyPeople = data?.divisionOnlyPeople || [];
  const selectedDivision = divisions.find((d) => d._id === divisionFilter);
  const selectedDivisionName = selectedDivision?.name || '';
  const selectedDepartment = departments.find((d) => d._id === departmentFilter)
    || (departmentFilter !== 'all' && data?.departmentName ? { name: data.departmentName } : null);
  const selectedDepartmentName = selectedDepartment?.name || '';

  const matchesFilters = (p) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (p.displayName || '').toLowerCase().includes(q)
      || (p.registrationCode || '').toLowerCase().includes(q)
      || (p.roleName || '').toLowerCase().includes(q)
      || (p.departmentName || '').toLowerCase().includes(q)
      || (p.divisionName || '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all'
      || (filterStatus === 'inside' && p.currentlyIn)
      || (filterStatus === 'exited' && p.hadExit && !p.currentlyIn)
      || (filterStatus === 'entered' && p.hadEntry);
    return matchSearch && matchStatus;
  };

  const sortPeople = useCallback((list) => [...list].sort((a, b) => {
    const valueFor = (person, key) => {
      switch (key) {
        case 'name': return person.displayName || '';
        case 'role': return person.roleName || '';
        case 'code': return person.registrationCode || '';
        case 'division': return person.divisionName || '';
        case 'department': return person.departmentName || '';
        case 'entry': return person.entryAt ? new Date(person.entryAt).getTime() : 0;
        case 'exit': return person.exitAt ? new Date(person.exitAt).getTime() : 0;
        case 'status': return person.currentlyIn ? 2 : person.hadExit ? 1 : 0;
        default: return '';
      }
    };
    const res = compareSortValues(valueFor(a, sort.key), valueFor(b, sort.key));
    return sort.dir === 'asc' ? res : -res;
  }), [sort]);

  const filtered = sortPeople(allPeople.filter(matchesFilters));
  const filteredDivisionOnly = sortPeople(divisionOnlyPeople.filter(matchesFilters));

  const tableIncludeEmpty = !search && filterStatus === 'all'
    && departmentFilter === 'all' && divisionFilter === 'all';

  const tablePeople = useMemo(() => {
    let people = filtered;
    if (departmentFilter !== 'all') {
      people = people.filter((p) => p.departmentId === departmentFilter);
    }
    if (divisionFilter !== 'all') {
      people = people.filter((p) => p.divisionId === divisionFilter);
    }
    return people;
  }, [filtered, departmentFilter, divisionFilter]);

  const divisionOnlyTablePeople = useMemo(() => {
    if (divisionFilter === 'all') return filteredDivisionOnly;
    return filteredDivisionOnly.filter((p) => p.divisionId === divisionFilter);
  }, [filteredDivisionOnly, divisionFilter]);

  const departmentSummaries = useMemo(
    () => groupDepartmentActivity(tablePeople, departments, {
      includeEmpty: tableIncludeEmpty,
    }),
    [tablePeople, departments, tableIncludeEmpty]
  );

  const departmentDivisionRows = useMemo(
    () => buildDepartmentDivisionActivityRows(tablePeople, departments, {
      includeEmpty: tableIncludeEmpty,
    }).map((row) => ({
      ...row,
      // Allow drill as soon as stats (lightweight people) are ready
      isClickable: Boolean(row.isClickable && (peopleReady || data?._statsOnly || (data?.people?.length > 0))),
    })),
    [tablePeople, departments, tableIncludeEmpty, peopleReady, data]
  );

  const divisionOnlyTableRows = useMemo(
    () => groupUnitActivity(divisionOnlyTablePeople).map((unit) => ({
      rowKey: unit.divisionId || `unit-${unit.divisionName}`,
      divisionId: unit.divisionId,
      divisionName: unit.divisionName,
      enteredCount: unit.enteredCount,
      inCount: unit.inCount,
      exitCount: unit.exitCount,
      total: unit.total,
      isClickable: Boolean(unit.divisionId && unit.total > 0 && (peopleReady || data?._statsOnly || (data?.divisionOnlyPeople?.length > 0))),
    })),
    [divisionOnlyTablePeople, peopleReady, data]
  );

  const drilledDepartment = useMemo(() => {
    if (!drillDepartmentId) return null;
    const people = filtered.filter((p) => personMatchesDepartmentScope(p, drillDepartmentId));
    return departmentSummaries.find((row) => String(row.departmentId) === String(drillDepartmentId))
      || {
        departmentId: drillDepartmentId,
        departmentName: people[0]?.departmentName || selectedDepartmentName || 'Department',
        people,
        ...activityGroupStats(people),
      };
  }, [drillDepartmentId, departmentSummaries, filtered, selectedDepartmentName]);

  const drilledUnit = useMemo(() => {
    if (!drillDivisionId) return null;
    const people = filtered.filter(
      (p) => personMatchesDeptDivisionScope(p, drillDepartmentId, drillDivisionId)
    );
    return {
      divisionId: drillDivisionId,
      divisionName: people[0]?.divisionName || selectedDivisionName || 'Unit',
      people,
      ...activityGroupStats(people),
    };
  }, [drillDivisionId, drillDepartmentId, filtered, selectedDivisionName]);

  const drilledDivisionOnly = useMemo(() => {
    if (!divisionOnlyDrillId) return null;
    const people = filteredDivisionOnly.filter((p) => personMatchesDivisionScope(p, divisionOnlyDrillId));
    return {
      divisionId: divisionOnlyDrillId,
      divisionName: people[0]?.divisionName || selectedDivisionName || 'Division',
      people,
      ...activityGroupStats(people),
    };
  }, [divisionOnlyDrillId, filteredDivisionOnly, selectedDivisionName]);

  const employeeRows = useMemo(() => {
    if (!drillDepartmentId || !drillDivisionId) return [];
    return sortPeople(filtered.filter(
      (p) => personMatchesDeptDivisionScope(p, drillDepartmentId, drillDivisionId)
    ));
  }, [drillDepartmentId, drillDivisionId, filtered, sortPeople]);

  const divisionOnlyEmployeeRows = useMemo(() => {
    if (!divisionOnlyDrillId) return [];
    return sortPeople(filteredDivisionOnly.filter((p) => personMatchesDivisionScope(p, divisionOnlyDrillId)));
  }, [divisionOnlyDrillId, filteredDivisionOnly, sortPeople]);

  const employeeWindow = useInfiniteWindow(
    employeeRows,
    ACTIVITY_PEOPLE_PAGE_SIZE,
    `dept-emp-${drillDepartmentId}-${drillDivisionId}-${filterStatus}-${search}-${employeeRows.length}`
  );
  const divisionOnlyEmployeeWindow = useInfiniteWindow(
    divisionOnlyEmployeeRows,
    ACTIVITY_PEOPLE_PAGE_SIZE,
    `dept-div-${divisionOnlyDrillId}-${filterStatus}-${search}-${divisionOnlyEmployeeRows.length}`
  );

  const isEmployeeDrill = Boolean(drillDepartmentId && drillDivisionId);
  const isDivisionOnlyEmployeeDrill = Boolean(divisionOnlyDrillId);

  // Progressively upgrade person details in the background. Stats stay stable because
  // the full lightweight roster from statsOnly is merged and never discarded.
  useEffect(() => {
    if (!isActive) return undefined;
    if (!data || data._statsOnly || !data.hasMore || peopleLoading || loadingMore) return undefined;
    const timer = window.setTimeout(() => {
      loadMorePeople();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [data?._statsOnly, data?.hasMore, data?.page, peopleLoading, loadingMore, loadMorePeople, isActive]);

  const breadcrumbItems = useMemo(() => {
    const items = [{
      key: 'departments',
      label: 'All Departments',
      onClick: isEmployeeDrill ? clearDepartmentDrill : null,
    }];
    if (drilledDepartment) {
      items.push({
        key: `dept-${drilledDepartment.departmentId}`,
        label: drilledDepartment.departmentName,
      });
    }
    if (drilledUnit) {
      items.push({
        key: `unit-${drilledUnit.divisionId}`,
        label: drilledUnit.divisionName,
      });
    }
    return items;
  }, [isEmployeeDrill, drilledDepartment, drilledUnit, clearDepartmentDrill]);

  const divisionOnlyBreadcrumbItems = useMemo(() => {
    if (!isDivisionOnlyEmployeeDrill || !drilledDivisionOnly) return [];
    return [{
      key: 'divisions',
      label: 'All Divisions',
      onClick: clearDivisionOnlyDrill,
    }, {
      key: `div-${drilledDivisionOnly.divisionId}`,
      label: drilledDivisionOnly.divisionName,
    }];
  }, [isDivisionOnlyEmployeeDrill, drilledDivisionOnly, clearDivisionOnlyDrill]);

  const globalUnitSummaries = useMemo(
    () => groupUnitActivity(tablePeople),
    [tablePeople]
  );

  const hierarchyStats = useMemo(() => {
    if (isEmployeeDrill && drilledUnit) {
      return {
        scopeLabel: `${drilledDepartment?.departmentName || 'Department'} · ${drilledUnit.divisionName}`,
        departmentCount: 1,
        departmentSub: drilledDepartment?.departmentName,
        unitCount: 1,
        unitSub: drilledUnit.divisionName,
        employeeSub: 'In this unit',
        ...activityGroupStats(drilledUnit.people),
      };
    }
    const activeDepartments = departmentSummaries.filter((row) => row.total > 0).length;
    const activeUnits = globalUnitSummaries.filter((row) => row.total > 0).length;
    return {
      scopeLabel: departmentFilter !== 'all'
        ? (selectedDepartmentName || 'Filtered department')
        : 'All Departments',
      departmentCount: activeDepartments,
      departmentSub: `${departmentSummaries.length} total`,
      unitCount: activeUnits,
      unitSub: `${globalUnitSummaries.length} total`,
      employeeSub: 'All check-ins',
      ...activityGroupStats(tablePeople),
    };
  }, [
    isEmployeeDrill,
    drilledDepartment,
    drilledUnit,
    departmentFilter,
    selectedDepartmentName,
    departmentSummaries,
    globalUnitSummaries,
    tablePeople,
  ]);

  const divisionOnlyStats = useMemo(() => {
    if (isDivisionOnlyEmployeeDrill && drilledDivisionOnly) {
      return {
        scopeLabel: drilledDivisionOnly.divisionName,
        departmentCount: 0,
        departmentSub: 'No department check-in',
        unitCount: 1,
        unitSub: drilledDivisionOnly.divisionName,
        employeeSub: 'In this division',
        ...activityGroupStats(drilledDivisionOnly.people),
      };
    }
    const activeUnits = divisionOnlyTableRows.filter((row) => row.total > 0).length;
    return {
      scopeLabel: 'Division only (no department check-in)',
      departmentCount: 0,
      departmentSub: 'No department',
      unitCount: activeUnits,
      unitSub: `${divisionOnlyTableRows.length} total`,
      employeeSub: 'Gate entry only',
      ...activityGroupStats(divisionOnlyTablePeople),
    };
  }, [
    isDivisionOnlyEmployeeDrill,
    drilledDivisionOnly,
    divisionOnlyTableRows,
    divisionOnlyTablePeople,
  ]);

  const enteredCount = hierarchyStats.enteredCount;
  const inCount = hierarchyStats.inCount;
  const exitCount = hierarchyStats.exitCount;
  const isDivisionOnlyTab = listTab === 'divisionOnly';

  const handleSelectDepartmentDivision = useCallback((row) => {
    if (!row?.isClickable) return;
    if (!row.departmentId || !row.divisionId) return;
    setDrillDepartmentId(row.departmentId);
    setDrillDivisionId(row.divisionId);
  }, []);

  const handleSelectDivisionOnly = useCallback((row) => {
    if (!row?.divisionId) return;
    setDivisionOnlyDrillId(row.divisionId);
  }, []);

  const handleStatFilter = useCallback((nextStatus) => {
    setFilterStatus(nextStatus === 'entered' ? 'entered' : nextStatus === 'exited' ? 'exited' : nextStatus === 'inside' ? 'inside' : 'all');
  }, []);

  const openPerson = (registrationId, personDivisionId) => {
    const divisionId = personDivisionId
      || (divisionFilter !== 'all' ? divisionFilter : '');
    if (effectiveFrom === todayDateStringIst() && effectiveTo === todayDateStringIst()) {
      onViewPerson(registrationId, divisionId);
    } else {
      onViewPerson(registrationId, divisionId, effectiveFrom, effectiveTo);
    }
  };

  return (
    <div>
      {/* Mobile toolbar — search + filter toggle + refresh */}
      <div className="hide-on-desktop rc-mobile-toolbar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="rc-search-wrap" style={{ flex: 1, minWidth: 0 }}>
          <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="rc-search-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={statsLoading && !data}
          />
        </div>
        <button
          type="button"
          className={`btn-secondary btn-sm ${showFilters ? 'btn-primary' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          style={{ padding: '0 8px', flexShrink: 0 }}
          aria-label="Toggle Filters"
          aria-expanded={showFilters}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => load()}
          disabled={statsLoading && !data}
          style={{ padding: '0 8px', flexShrink: 0 }}
          aria-label="Refresh"
        >
          {statsLoading && !data ? <Spinner size={14} /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          )}
        </button>
      </div>

      <div className={`rc-filters-bar rc-filters-bar--dept-grid ${!showFilters ? 'hide-on-mobile' : ''}`}>
        <div className="rc-filters-bar__left">
          <div className="rc-filters-bar__cell rc-filters-bar__cell--full">
            <ActivityDatePicker
              value={activityDate}
              onChange={onDateChange}
              displayLabel={isToday ? `Today · ${formatDate(activityDate)}` : formatDate(activityDate)}
              className="rc-activity-date--filter"
            />
          </div>
          <div className="rc-filters-bar__cell">
            <input type="date" className="rc-select" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} aria-label="From date" />
          </div>
          <div className="rc-filters-bar__cell">
            <input type="date" className="rc-select" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} aria-label="To date" />
          </div>
          <div className="rc-filters-bar__cell rc-filters-bar__cell--full hide-on-mobile">
            <div className="rc-search-wrap" style={{ width: '100%' }}>
              <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                className="rc-search-input"
                placeholder="Search name, code, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
              />
            </div>
          </div>
          <div className="rc-filters-bar__cell">
            <SearchableSelect
              options={divisions.map((d) => d.name)}
              value={selectedDivisionName}
              onChange={(name) => {
                if (!name) {
                  setDivisionFilter('all');
                  return;
                }
                const selected = divisions.find((d) => d.name === name);
                setDivisionFilter(selected?._id || 'all');
              }}
              placeholder="All Divisions"
              emptyValue=""
              className="rc-select"
            />
          </div>
          <div className="rc-filters-bar__cell">
            <SearchableSelect
              options={departments.map((d) => d.name)}
              value={selectedDepartmentName}
              onChange={(name) => {
                if (!name) {
                  setDepartmentFilter('all');
                  return;
                }
                const selected = departments.find((d) => d.name === name);
                setDepartmentFilter(selected?._id || 'all');
              }}
              placeholder={loadingDepartments ? 'Loading…' : 'All Departments'}
              emptyValue=""
              className="rc-select"
              disabled={loadingDepartments}
            />
          </div>
          <div className="rc-filters-bar__cell rc-filters-bar__cell--full">
            <select
              className="rc-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              <option value="inside">Currently In</option>
              <option value="entered">Entered</option>
              <option value="exited">Exited</option>
            </select>
          </div>
        </div>
        <div className="rc-filters-bar__right">
          <span className="rc-filter-pill">
            <span className="daily-pass-dot daily-pass-dot--inside" />
            {enteredCount} Entered
          </span>
          <span className="rc-filter-pill">
            <span className="daily-pass-dot daily-pass-dot--inside" />
            {inCount} In
          </span>
          <span className="rc-filter-pill rc-filter-pill--muted">
            {exitCount} Exit
          </span>
          <span className="rc-filter-pill rc-filter-pill--muted hide-on-mobile">{periodLabel}</span>
          <button
            className="btn-secondary btn-sm hide-on-mobile"
            onClick={() => load()}
            disabled={statsLoading && !data}
          >
            {statsLoading && !data ? <Spinner size={14} /> : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div className="rc-tab-nav" style={{ marginBottom: '1rem' }} role="tablist" aria-label="Department activity views">
        <button
          type="button"
          role="tab"
          aria-selected={!isDivisionOnlyTab}
          className={`rc-tab-btn ${!isDivisionOnlyTab ? 'rc-tab-btn--active' : ''}`}
          onClick={() => setListTab('department')}
        >
          Department Activity
          <span className="rc-filter-pill" style={{ margin: 0, padding: '0 8px', fontSize: '0.75rem' }}>
            {filtered.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isDivisionOnlyTab}
          className={`rc-tab-btn ${isDivisionOnlyTab ? 'rc-tab-btn--active' : ''}`}
          onClick={() => setListTab('divisionOnly')}
        >
          Division Only
          <span className="rc-filter-pill" style={{ margin: 0, padding: '0 8px', fontSize: '0.75rem' }}>
            {filteredDivisionOnly.length}
          </span>
        </button>
      </div>

      <DepartmentActivityHierarchyCards
        stats={isDivisionOnlyTab ? divisionOnlyStats : hierarchyStats}
        loading={statsLoading && !data}
        scopeLabel={isDivisionOnlyTab ? divisionOnlyStats.scopeLabel : hierarchyStats.scopeLabel}
        onStatFilter={handleStatFilter}
        activeStatFilter={filterStatus === 'entered' ? 'entered' : filterStatus === 'exited' ? 'exited' : filterStatus === 'inside' ? 'inside' : 'all'}
      />

      {peopleLoading && data?._statsOnly && (
        <p className="rc-table-meta rc-dept-people-loading">
          Stats loaded — loading employee details…
        </p>
      )}

      {statsLoading && !data ? (
        <div className="rc-table-loading">
          {[...Array(5)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : isDivisionOnlyTab ? (
        isDivisionOnlyEmployeeDrill ? (
          divisionOnlyEmployeeRows.length === 0 ? (
            <>
              <DepartmentActivityNavBar
                breadcrumbItems={divisionOnlyBreadcrumbItems}
                onBack={clearDivisionOnlyDrill}
                backLabel="Back to divisions"
              />
              <EmptyState
                icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
                title="No matching employees"
                desc="Try adjusting your search or filters."
              />
            </>
          ) : (
            <>
              <DepartmentActivityNavBar
                breadcrumbItems={divisionOnlyBreadcrumbItems}
                onBack={clearDivisionOnlyDrill}
                backLabel="Back to divisions"
              />
              <div className="rc-table-meta">
                {drilledDivisionOnly?.divisionName || 'Division'}
                {' · '}
                {divisionOnlyEmployeeRows.length} employee{divisionOnlyEmployeeRows.length === 1 ? '' : 's'}
                {' · '}
                Gate entry only (no department check-in)
              </div>
              <DepartmentActivityPeopleList
                rows={divisionOnlyEmployeeWindow.visibleItems}
                sort={sort}
                onSort={handleSort}
                activityDate={activityDate}
                isToday={isToday}
                onViewPerson={openPerson}
              />
              <InfiniteScrollSentinel
                loaderRef={divisionOnlyEmployeeWindow.loaderRef}
                hasMore={divisionOnlyEmployeeWindow.hasMore}
                label={`Showing ${divisionOnlyEmployeeWindow.visibleCount} of ${divisionOnlyEmployeeRows.length}`}
              />
            </>
          )
        ) : divisionOnlyTableRows.length === 0 ? (
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            title={
              search || filterStatus !== 'all'
                ? 'No matching divisions'
                : `No division-only activity ${isToday ? 'today' : `on ${dayLabel}`}`
            }
            desc={
              search || filterStatus !== 'all'
                ? 'Try adjusting your search or filters.'
                : `Everyone with division entry also checked into a department ${isToday ? 'today' : 'on this date'}.`
            }
          />
        ) : (
          <DivisionOnlyActivityTable
            rows={divisionOnlyTableRows}
            onSelectRow={handleSelectDivisionOnly}
            emptyTitle={`No division-only activity ${isToday ? 'today' : `on ${dayLabel}`}`}
            emptyDesc={`Everyone with division entry also checked into a department ${isToday ? 'today' : 'on this date'}.`}
          />
        )
      ) : isEmployeeDrill ? (
        employeeRows.length === 0 ? (
          <>
            <DepartmentActivityNavBar
              breadcrumbItems={breadcrumbItems}
              onBack={clearDepartmentDrill}
              backLabel="Back to department stats"
            />
            <EmptyState
              icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
              title="No matching employees"
              desc="Try adjusting your search or filters."
            />
          </>
        ) : (
          <>
            <DepartmentActivityNavBar
              breadcrumbItems={breadcrumbItems}
              onBack={clearDepartmentDrill}
              backLabel="Back to department stats"
            />
            <div className="rc-table-meta">
              {drilledDepartment?.departmentName || 'Department'}
              {' · '}
              {drilledUnit?.divisionName || 'Unit'}
              {' · '}
              {employeeRows.length} employee{employeeRows.length === 1 ? '' : 's'}
            </div>
            <DepartmentActivityPeopleList
              rows={employeeWindow.visibleItems}
              sort={sort}
              onSort={handleSort}
              activityDate={activityDate}
              isToday={isToday}
              onViewPerson={openPerson}
            />
            <InfiniteScrollSentinel
              loaderRef={employeeWindow.loaderRef}
              hasMore={employeeWindow.hasMore}
              label={`Showing ${employeeWindow.visibleCount} of ${employeeRows.length}`}
            />
          </>
        )
      ) : (
        <DepartmentDivisionActivityTable
          rows={departmentDivisionRows}
          onSelectRow={handleSelectDepartmentDivision}
          emptyTitle={
            search || filterStatus !== 'all'
              ? 'No matching departments'
              : `No department activity ${isToday ? 'today' : `on ${dayLabel}`}`
          }
          emptyDesc={
            search || filterStatus !== 'all'
              ? 'Try adjusting your search or filters.'
              : `No department check-ins recorded ${isToday ? 'today' : 'on this date'} yet.`
          }
        />
      )}
    </div>
  );
}

function parseDateForPdf(dateStr) {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00+05:30`);
  }
  return new Date();
}

/** Opens the native date calendar on click (showPicker) and updates activity date. */
function ActivityDatePicker({ value, onChange, className = '', displayLabel }) {
  const inputRef = useRef(null);
  const today = todayDateStringIst();

  const openCalendar = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = inputRef.current;
    if (!el) return;
    // Prefer the native calendar popup (Chrome/Edge/Safari)
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Falls through if the browser blocks showPicker
      }
    }
    // Fallback: focus + click the real date input
    el.style.pointerEvents = 'auto';
    el.style.opacity = '0.01';
    el.focus();
    el.click();
    // Restore after the picker interaction window
    window.setTimeout(() => {
      if (!inputRef.current) return;
      inputRef.current.style.pointerEvents = 'none';
      inputRef.current.style.opacity = '0';
    }, 1000);
  }, []);

  const handleChange = useCallback((e) => {
    const next = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) onChange?.(next);
  }, [onChange]);

  return (
    <div className={`rc-activity-date ${className}`.trim()}>
      <button
        type="button"
        className="rc-activity-date__btn"
        onClick={openCalendar}
        title="Change activity date — click to open calendar"
        aria-label="Change activity date"
      >
        <svg className="rc-activity-date__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="rc-activity-date__label">{displayLabel || value}</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        className="rc-activity-date__input"
        value={value || today}
        max={today}
        onChange={handleChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function getMonthRange(monthValue) {
  if (!monthValue) return { dateFrom: '', dateTo: '' };
  const [year, month] = monthValue.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom: from, dateTo: to };
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeIsoWeekValue(weekValue) {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(weekValue || '');
  if (!match) return '';
  return `${match[1]}-W${String(Number(match[2])).padStart(2, '0')}`;
}

function getWeekRange(weekValue) {
  const normalized = normalizeIsoWeekValue(weekValue);
  const match = /^(\d{4})-W(\d{2})$/.exec(normalized);
  if (!match) return { dateFrom: '', dateTo: '' };

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const monday = new Date(weekOneMonday);
  monday.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);

  // Shift to start on Saturday instead of Monday
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() - 2);

  const friday = new Date(saturday);
  friday.setUTCDate(saturday.getUTCDate() + 6);

  const toIso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: toIso(saturday), dateTo: toIso(friday) };
}

function isoWeekFromDate(date) {
  const local = date instanceof Date ? new Date(date) : new Date(date);
  // Shift the date forward by 2 days so that Saturday and Sunday fall into the next ISO week,
  // matching our custom Saturday-to-Friday getWeekRange calculation.
  local.setDate(local.getDate() + 2);
  const utc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const day = utc.getUTCDay() || 7;
  const monday = new Date(utc);
  monday.setUTCDate(utc.getUTCDate() - day + 1);

  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const week = Math.floor((monday.getTime() - weekOneMonday.getTime()) / (7 * 86400000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function currentIsoWeekValue() {
  return isoWeekFromDate(new Date());
}

function formatWeekLabel(weekValue) {
  const { dateFrom, dateTo } = getWeekRange(weekValue);
  if (!dateFrom || !dateTo) return '';
  return `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;
}

function shiftWeek(weekValue, delta) {
  const { dateFrom } = getWeekRange(weekValue);
  if (!dateFrom) return weekValue;
  const next = new Date(`${dateFrom}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta * 7);
  return isoWeekFromDate(next);
}

function WeekRangePicker({ value, onChange }) {
  const normalizedValue = normalizeIsoWeekValue(value) || currentIsoWeekValue();
  const weekNumber = normalizedValue.match(/W(\d{2})$/)?.[1];
  const label = formatWeekLabel(normalizedValue);

  useEffect(() => {
    if (normalizedValue && normalizedValue !== value) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, value, onChange]);

  return (
    <div className="rc-week-picker">
      <button
        type="button"
        className="rc-week-picker__btn"
        onClick={() => onChange(shiftWeek(normalizedValue, -1))}
        aria-label="Previous week"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Prev</span>
      </button>
      <label className="rc-week-picker__display">
        <span className="rc-week-picker__title">
          {weekNumber ? `Week ${Number(weekNumber)}` : 'Week'}
        </span>
        {label && <span className="rc-week-picker__range">{label}</span>}
        <input
          type="week"
          className="rc-week-picker__input"
          value={normalizedValue}
          onChange={(e) => {
            const next = normalizeIsoWeekValue(e.target.value);
            if (next) onChange(next);
          }}
          aria-label={`Choose week. ${label || 'No week selected'}`}
        />
      </label>
      <button
        type="button"
        className="rc-week-picker__btn"
        onClick={() => onChange(shiftWeek(normalizedValue, 1))}
        aria-label="Next week"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Next</span>
      </button>
      <button
        type="button"
        className="rc-week-picker__today"
        onClick={() => onChange(currentIsoWeekValue())}
      >
        This week
      </button>
    </div>
  );
}

function formatCellHours(hours) {
  if (hours == null || Number(hours) <= 0) return null;
  const totalMinutes = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Returns the next calendar date string (YYYY-MM-DD) for an overnight shift row.
 * Used to display "7/19 – 7/20" in the Date column when a shift crosses midnight.
 */
function nextIstDateStr(dateStr) {
  const base = new Date(`${dateStr}T12:00:00+05:30`);
  base.setTime(base.getTime() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

/**
 * True when the shift's endTime is on the next calendar day (e.g. 11 PM – 3 AM).
 */
function isOvernightDay(day) {
  if (!day?.shiftStartTime || !day?.shiftEndTime) return false;
  const toMins = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const s = toMins(day.shiftStartTime);
  const e = toMins(day.shiftEndTime);
  return s !== null && e !== null && e <= s;
}

function AttendanceCell({ day, onSelect }) {
  const lockedClass = day?.payLocked ? ' rc-att-cell--pay-locked' : '';
  if (!day || day.status === 'blank') {
    return (
      <td
        className={`rc-att-cell rc-att-cell--blank${lockedClass}`}
        aria-label={day?.payLocked ? 'Pay locked' : 'Not registered'}
      >
        {day?.payLocked ? <PayLockMark /> : null}
      </td>
    );
  }

  const cls = `rc-att-cell rc-att-cell--${day.status.toLowerCase()} rc-att-cell--clickable${lockedClass}`;
  const hoursLabel = formatCellHours(day.activityHours);
  const lockedLabel = day.payLocked ? ', pay locked' : '';

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(day);
  };

  if (day.status === 'A') {
    return (
      <td className={cls} aria-label={`Absent${lockedLabel}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__code rc-att-cell__code--plain">A</span>
        {day.payLocked && <PayLockMark />}
      </td>
    );
  }

  if (day.status === 'HD' || day.status === 'FH' || day.status === 'SH') {
    const halfLabel =
      day.status === 'FH' ? 'First Half' : day.status === 'SH' ? 'Second Half' : 'Half Day';
    return (
      <td className={cls} aria-label={`${halfLabel}${hoursLabel ? `, ${hoursLabel}` : ''}${lockedLabel}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">{day.code || day.status}</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
        {day.payLocked && <PayLockMark />}
      </td>
    );
  }

  if (day.status === 'PT') {
    return (
      <td className={cls} aria-label={`Hours Worked${hoursLabel ? `, ${hoursLabel}` : ''}${lockedLabel}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">PT</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
        {day.payLocked && <PayLockMark />}
      </td>
    );
  }

  if (day.status === 'P') {
    return (
      <td className={cls} aria-label={`Present${hoursLabel ? `, ${hoursLabel}` : ''}${lockedLabel}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">P</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
        {day.payLocked && <PayLockMark />}
      </td>
    );
  }

  return (
    <td className={cls} aria-label={`${day.label || day.code || ''}${lockedLabel}`} onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
      <span className="rc-att-cell__badge">{day.code}</span>
      {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
      {day.payLocked && <PayLockMark />}
    </td>
  );
}

function AttendanceDayDialog({ employee, day, onClose }) {
  if (!employee || !day) return null;

  const statusLabel = day.label || day.code || '—';
  const lastActivityLabel = day.lastActivityType === 'exit' ? 'Exit' : 'Entry';
  const hasPresence = day.status === 'P' || day.status === 'HD' || day.status === 'FH' || day.status === 'SH' || day.status === 'PT';
  const halfSideLabel =
    day.halfSide === 'first' ? 'First Half' : day.halfSide === 'second' ? 'Second Half' : null;
  const activityHoursLabel =
    day.activityHours != null && day.activityHours > 0
      ? `${day.activityHours}h`
      : null;
  const dayRate = employee.payAmount != null ? Number(employee.payAmount) : null;
  const earned =
    dayRate != null && typeof day.payFactor === 'number' && day.payFactor > 0
      ? Math.round(dayRate * day.payFactor * 100) / 100
      : null;
  const payBreakdown =
    earned == null
      ? null
      : day.status === 'P'
        ? `Full day × ${formatCurrency(dayRate)}`
        : day.status === 'HD' || day.status === 'FH' || day.status === 'SH'
          ? `Half day × ${formatCurrency(dayRate)}`
          : day.activityHours != null &&
            day.shiftTotalHours != null &&
            day.shiftTotalHours > 0
            ? `${day.activityHours}h / ${day.shiftTotalHours}h × ${formatCurrency(dayRate)}`
            : null;

  return (
    <div className="rc-dialog-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Day attendance details">
      <div className="rc-dialog rc-dialog--day" onClick={e => e.stopPropagation()}>
        <div className="rc-dialog__header">
          <div className="rc-dialog__header-info">
            <Avatar url={employee.photoUrl} name={employee.displayName} size={44} />
            <div>
              <h2 className="rc-dialog__title">{employee.displayName || '—'}</h2>
              <p className="rc-dialog__subtitle">
                {formatDate(day.date)} · {statusLabel}
                {day.payLocked ? ' · Pay locked' : ''}
              </p>
            </div>
          </div>
          <button className="rc-dialog__close" onClick={onClose} aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rc-dialog__body">
          <div className="rc-att-day-detail">
            <div className="rc-att-day-detail__status">
              <span className={`badge rc-att-day-detail__badge rc-att-day-detail__badge--${day.status?.toLowerCase()}`}>
                {day.code}
              </span>
              <span className="rc-att-day-detail__status-label">{statusLabel}</span>
              {day.payLocked && <span className="rc-pay-lock-chip">Pay locked</span>}
            </div>
            {day.payLocked && (
              <p className="rc-att-day-detail__empty" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                This day is included in a generated pay slip and will not be paid again.
              </p>
            )}
            {hasPresence || day.checkIn ? (
              <div className="rc-att-day-detail__grid rc-att-day-detail__grid--two">
                <div className="rc-att-day-detail__item">
                  <span className="rc-att-day-detail__label">Gate In Time</span>
                  <span className="rc-att-day-detail__value rc-color-success">{formatTime(day.checkIn)}</span>
                </div>
                <div className="rc-att-day-detail__item">
                  <span className="rc-att-day-detail__label">Last Activity ({lastActivityLabel})</span>
                  <span className={`rc-att-day-detail__value ${day.lastActivityType === 'exit' ? 'rc-color-danger' : ''}`}>
                    {formatTime(day.lastActivityAt)}
                  </span>
                </div>
                {activityHoursLabel && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Activity Hours</span>
                    <span className="rc-att-day-detail__value">{activityHoursLabel}</span>
                  </div>
                )}
                {day.breakHours > 0 && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Division Break</span>
                    <span className="rc-att-day-detail__value">
                      {formatCellHours(day.breakHours)}
                      {Array.isArray(day.breaks) && day.breaks.length > 0 && (
                        <span className="rc-att-day-detail__label" style={{ display: 'block', marginTop: '0.25rem', fontWeight: 400 }}>
                          {day.breaks
                            .map((b) => `${formatTime(b.from)} – ${formatTime(b.to)}`)
                            .join(', ')}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {halfSideLabel && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Nearest Half</span>
                    <span className="rc-att-day-detail__value">{halfSideLabel}</span>
                  </div>
                )}
                {(day.firstOverlapHours != null || day.secondOverlapHours != null) && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Half Overlap (1st / 2nd)</span>
                    <span className="rc-att-day-detail__value">
                      {day.firstOverlapHours ?? 0}h / {day.secondOverlapHours ?? 0}h
                    </span>
                  </div>
                )}
                {day.shiftName && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Shift</span>
                    <span className="rc-att-day-detail__value">{day.shiftName}</span>
                  </div>
                )}
                {day.shiftTotalHours != null && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Working Hours</span>
                    <span className="rc-att-day-detail__value">{day.shiftTotalHours}h</span>
                  </div>
                )}
                {(day.shiftStartTime || day.shiftEndTime) && day.shiftTotalHours == null && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Shift Timing</span>
                    <span className="rc-att-day-detail__value">
                      {formatShiftWindow(day.shiftStartTime, day.shiftEndTime) || '—'}
                    </span>
                  </div>
                )}
                {(day.halfDayMinHours != null || day.fullDayMinHours != null) && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Min Hours (Half / Full)</span>
                    <span className="rc-att-day-detail__value">
                      {day.halfDayMinHours ?? '—'} / {day.fullDayMinHours ?? '—'}
                    </span>
                  </div>
                )}
                {earned != null && (
                  <div className="rc-att-day-detail__item">
                    <span className="rc-att-day-detail__label">Day Amount</span>
                    <span className="rc-att-day-detail__value">{formatCurrency(earned)}</span>
                    {payBreakdown && (
                      <span className="rc-att-day-detail__label" style={{ marginTop: '0.25rem', fontWeight: 400 }}>
                        {payBreakdown}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="rc-att-day-detail__empty">No check-in or check-out recorded for this day.</p>
            )}
            {day.status === 'A' && activityHoursLabel && (
              <p className="rc-att-day-detail__empty" style={{ marginTop: '0.75rem' }}>
                Activity was {activityHoursLabel}, which is below the required minimum of 1 hour
                {day.halfDayMinHours != null ? ` (half-day minimum ${day.halfDayMinHours}h)` : ''}.
              </p>
            )}
            {day.status === 'PT' && activityHoursLabel && (
              <p className="rc-att-day-detail__empty" style={{ marginTop: '0.75rem' }}>
                Below half-day minimum
                {day.halfDayMinHours != null ? ` (${day.halfDayMinHours}h)` : ''}
                {halfSideLabel ? `, nearest ${halfSideLabel.toLowerCase()}` : ''}
                , paid for hours worked.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceAbstractTable({
  employees,
  onViewPerson,
  selectionColumns = [],
  pinSortDir,
  onPinSort,
}) {
  return (
    <div className="rc-table-wrap">
      <table className="rc-table rc-att-abstract-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Person</th>
            <th>Role</th>
            <SortHeader
              label="PIN / ID"
              columnKey="code"
              activeKey="code"
              dir={pinSortDir}
              onSort={onPinSort}
            />
            <th>Phone</th>
            {selectionColumns.map(label => (
              <th key={`abs-sel-head-${label}`}>{label}</th>
            ))}
            <th>Total Days</th>
            <th>Present Days</th>
            <th>Partial Days</th>
            <th>Absent Days</th>
            <th>Pay Frequency</th>
            <th>Pay Amount (per day)</th>
            <th>Payment Days</th>
            <th>Calculated Amount</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, idx) => (
            <tr key={`${emp.registrationId || 'emp'}-${idx}`} className="rc-table__row"
              onClick={() => onViewPerson(emp.registrationId)}
              tabIndex={0} role="button"
              aria-label={`View history for ${emp.displayName || 'Unnamed'}`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewPerson(emp.registrationId); } }}>
              <td className="rc-att-abstract-table__index hide-on-mobile" data-label="#">{idx + 1}</td>
              <td data-label="Person" className="rc-att-abstract-table__person-cell">
                <div className="rc-table__person">
                  <Avatar url={emp.photoUrl} name={emp.displayName} size={38} />
                  <div className="rc-table__person-info">
                    <span className="rc-table__name">
                      {emp.displayName || 'Unnamed'}
                      {emp.lockedDayCount > 0 && <PayLockMark className="rc-pay-lock-mark--inline" />}
                    </span>
                    <span className="rc-table__mobile-pin hide-on-desktop">{emp.registrationCode}</span>
                  </div>
                </div>
              </td>
              <td data-label="Role"><span className="rc-table__muted">{emp.roleName || '—'}</span></td>
              <td data-label="PIN / ID" className="hide-on-mobile"><code className="rc-table__code">{emp.registrationCode}</code></td>
              <td data-label="Phone" className="rc-table__muted">{emp.displayPhone || '—'}</td>
              {selectionColumns.map(label => (
                <td key={`abs-sel-${emp.registrationId}-${label}`} className="rc-table__muted" data-label={label}>{selectionValueFor(emp, label)}</td>
              ))}
              <td data-label="Total Days" className="rc-att-abstract-table__num">{emp.summary.totalDays}</td>
              <td data-label="Present Days" className="rc-att-abstract-table__num rc-att-abstract-table__num--present">{emp.summary.present}</td>
              <td data-label="Partial Days" className="rc-att-abstract-table__num">{emp.summary.halfDay ?? 0}</td>
              <td data-label="Absent Days" className="rc-att-abstract-table__num rc-att-abstract-table__num--absent">{emp.summary.absent}</td>
              <td data-label="Pay Frequency" className="rc-table__muted">{emp.payFrequencyLabel || '—'}</td>
              <td data-label="Pay Amount" className="rc-att-abstract-table__num">{emp.payAmount != null ? formatCurrency(emp.payAmount) : '—'}</td>
              <td data-label="Payment Days" className="rc-att-abstract-table__num">{emp.payment?.paymentDays ?? '—'}</td>
              <td data-label="Calculated Amount" className="rc-att-abstract-table__num rc-att-abstract-table__num--pay">
                {emp.payment ? formatCurrency(emp.payment.totalAmount) : '—'}
                {emp.lockedDayCount > 0 && emp.unlockedPayment != null && (
                  <div className="rc-table__muted">Remaining {formatCurrency(emp.unlockedPayment.totalAmount)}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — ATTENDANCE HISTORY
════════════════════════════════════════════════════════════════ */
function AttendanceHistoryTab({ onViewPerson, onPrintReady, isActive = true }) {
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rangeMode, setRangeMode] = useState('month');
  const [viewMode, setViewMode] = useState('abstract');
  const [selectedDay, setSelectedDay] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [showBulkPaySlips, setShowBulkPaySlips] = useState(false);
  const [search, setSearch] = useState('');
  const [pinSortDir, setPinSortDir] = useState('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    month: currentMonthValue(),
    week: currentIsoWeekValue(),
    dateFrom: '',
    dateTo: '',
    roleId: '',
    divisionId: '',
    payFrequency: '',
    shiftName: '',
  });
  const [selectionFilters, setSelectionFilters] = useState({});
  const [renderPage, setRenderPage] = useState(1);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const loaderRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setRenderPage(1);
  }, [search, selectionFilters, filters]);

  useEffect(() => {
    api.roles.list().then((list) => setRoles(Array.isArray(list) ? list : [])).catch(() => setRoles([]));
    api.reports.divisions()
      .then((res) => setDivisions(Array.isArray(res?.divisions) ? res.divisions : []))
      .catch(() => setDivisions([]));
    api.shifts.list()
      .then((list) => setShiftOptions(Array.isArray(list) ? list : []))
      .catch(() => setShiftOptions([]));
  }, []);

  const resolveDateRange = useCallback(() => {
    if (rangeMode === 'week') return getWeekRange(filters.week);
    if (rangeMode === 'month') return getMonthRange(filters.month);
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  }, [rangeMode, filters.week, filters.month, filters.dateFrom, filters.dateTo]);

  const HISTORY_PAGE_SIZE = 50;

  const fetchHistoryPage = useCallback(async ({ dateFrom, dateTo, roleId, divisionId, payFrequency, shiftName, selectionFilters, page = 1, search = '' }) => {
    const params = { 
      dateFrom, 
      dateTo, 
      limit: HISTORY_PAGE_SIZE, 
      page,
      search,
      payFrequency,
      shiftName,
      selectionFilters: JSON.stringify(selectionFilters || {})
    };
    if (roleId) params.roleId = roleId;
    if (divisionId) params.divisionId = divisionId;
    
    return await api.reports.attendanceHistory(params);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { dateFrom, dateTo } = resolveDateRange();
      if (!dateFrom || !dateTo) {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
        return;
      }
      if (dateFrom > dateTo) {
        if (!cancelled) {
          setError('From date cannot be after To date.');
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setError('');
        setSuccess('');
        loadingMoreRef.current = false;
      }

      try {
        const result = await fetchHistoryPage({
          dateFrom,
          dateTo,
          roleId: filters.roleId,
          divisionId: filters.divisionId,
          payFrequency: filters.payFrequency,
          shiftName: filters.shiftName,
          selectionFilters,
          search,
          page: 1,
        });
        if (cancelled) return;
        setData(result);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load attendance history');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [resolveDateRange, filters, selectionFilters, search, fetchHistoryPage]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    const { dateFrom, dateTo } = resolveDateRange();
    if (!dateFrom || !dateTo) return null;
    if (dateFrom > dateTo) return null;

    if (!silent) {
      setLoading(true);
      setError('');
      setSuccess('');
      loadingMoreRef.current = false;
    }

    try {
      const result = await fetchHistoryPage({
        dateFrom,
        dateTo,
        roleId: filters.roleId,
        divisionId: filters.divisionId,
        payFrequency: filters.payFrequency,
        shiftName: filters.shiftName,
        selectionFilters,
        search,
        page: 1,
      });
      setData(result);
      if (silent) setError('');
      return result;
    } catch (e) {
      setError(e.message || 'Failed to load attendance history');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [resolveDateRange, filters, selectionFilters, search, fetchHistoryPage]);

  const handleLoadMore = useCallback(async () => {
    if (!data?.hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = (data.page || 1) + 1;
      const { dateFrom, dateTo } = resolveDateRange();
      const nextData = await fetchHistoryPage({
        dateFrom,
        dateTo,
        roleId: filters.roleId,
        divisionId: filters.divisionId,
        payFrequency: filters.payFrequency,
        shiftName: filters.shiftName,
        selectionFilters,
        search,
        page: nextPage,
      });
      setData((prev) => {
        const existing = prev?.employees || [];
        const seen = new Set(existing.map((emp) => emp.registrationId));
        const appended = (nextData.employees || []).filter((emp) => emp?.registrationId && !seen.has(emp.registrationId));
        return {
          ...nextData,
          employees: [...existing, ...appended],
        };
      });
    } catch (e) {
      setError(e.message || 'Failed to load more');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [data, fetchHistoryPage, resolveDateRange, filters, selectionFilters, search]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && data?.hasMore && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    const currentLoader = loaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }
    return () => {
      if (currentLoader) observer.unobserve(currentLoader);
    };
  }, [data?.hasMore, loadingMore, handleLoadMore]);

  const allEmployees = uniqueEmployeesById(data?.employees || []);
  const selectionColumns = data?.selectionOptions ? Object.keys(data.selectionOptions) : collectSelectionColumns(allEmployees);
  // Union of configured shifts and shift names seen in the loaded range (covers deleted shifts)
  const shiftNameOptions = [...new Set([
    ...shiftOptions.map((s) => s.name),
    ...allEmployees.flatMap((emp) => (emp.days || []).map((d) => d.shiftName)),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const searchQ = search.trim().toLowerCase();
  const employees = allEmployees.filter((emp) => {
    for (const [label, val] of Object.entries(selectionFilters)) {
      if (selectionFilterHasActiveValue(val)) {
        const sel = (emp.selections || []).find((s) => s.label === label);
        if (!sel || !selectionFilterMatches(sel.value, val)) return false;
      }
    }
    if (filters.payFrequency && emp.payFrequency !== filters.payFrequency) return false;
    if (filters.shiftName) {
      const dayShiftNames = (emp.days || []).map((d) => d.shiftName).filter(Boolean);
      if (filters.shiftName === '__none__') {
        if (dayShiftNames.length > 0) return false;
      } else if (!dayShiftNames.includes(filters.shiftName)) {
        return false;
      }
    }
    if (!searchQ) return true;
    return (
      (emp.displayName || '').toLowerCase().includes(searchQ) ||
      (emp.registrationCode || '').toLowerCase().includes(searchQ) ||
      (emp.roleName || '').toLowerCase().includes(searchQ) ||
      (emp.displayPhone || '').toLowerCase().includes(searchQ)
    );
  }).sort((a, b) => {
    const result = compareSortValues(a.registrationCode, b.registrationCode);
    if (result !== 0) return pinSortDir === 'asc' ? result : -result;
    return compareSortValues(a.displayName, b.displayName);
  });

  const handleRecalculate = useCallback(() => {
    const { dateFrom, dateTo } = resolveDateRange();
    if (!dateFrom || !dateTo) {
      setError('Select a date range before recalculating.');
      return;
    }
    if (dateFrom > dateTo) {
      setError('From date cannot be after To date.');
      return;
    }
    setRecalcConfirmOpen(true);
  }, [resolveDateRange]);

  const executeRecalculate = useCallback(async () => {
    const { dateFrom, dateTo } = resolveDateRange();
    setRecalcConfirmOpen(false);
    setRecalculating(true);
    setError('');
    setSuccess('');

    try {
      const payload = { 
        dateFrom, 
        dateTo, 
        limit: HISTORY_PAGE_SIZE, 
        page: 1,
        search,
        payFrequency: filters.payFrequency,
        shiftName: filters.shiftName,
        selectionFilters: JSON.stringify(selectionFilters),
        registrationIds: employees.map(e => e.registrationId)
      };
      if (filters.roleId) payload.roleId = filters.roleId;
      if (filters.divisionId) payload.divisionId = filters.divisionId;

      const result = await api.reports.recalculateAttendanceHistory(payload);
      setData(result);
      setRecalculating(false);

      const meta = result?.recalculation;
      if (meta) {
        const payLabel =
          meta.totalPayroll != null
            ? formatCurrency(meta.totalPayroll)
            : '—';
        setSuccess(
          `Recalculated ${meta.employeeCount ?? 0} people using current shift rules` +
          ` (${meta.shiftsApplied ?? 0} shifts, ${meta.passesUpdated ?? 0} day passes updated).` +
          ` Present ${meta.presentDays ?? 0}, Partial ${meta.partialDays ?? 0}, Absent ${meta.absentDays ?? 0}.` +
          ` Payroll total: ${payLabel}.`
        );
      } else {
        setSuccess('Attendance and payroll recalculated from current shift settings.');
      }

      // Wait for backend to reload
      await loadHistory({ silent: true });
    } catch (e) {
      setError(e.message || 'Failed to recalculate attendance');
    } finally {
      setRecalculating(false);
    }
  }, [resolveDateRange, filters, search, selectionFilters, employees, loadHistory]);

  const handleRangeModeChange = (mode) => {
    setRangeMode(mode);
    if (mode === 'week' && !filters.week) {
      setFilters((f) => ({ ...f, week: currentIsoWeekValue() }));
    }
    if (mode === 'custom' && (!filters.dateFrom || !filters.dateTo)) {
      const { dateFrom, dateTo } = getMonthRange(filters.month);
      setFilters((f) => ({ ...f, dateFrom, dateTo }));
    }
  };


  const displayedEmployees = employees.slice(0, renderPage * 50);
  const dates = data?.dates || [];
  const hasLockedDays = employees.some((emp) => (emp.lockedDayCount || 0) > 0);

  const handlePinSort = useCallback(() => {
    setPinSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }, []);

  const handleViewPerson = useCallback((registrationId) => {
    const { dateFrom, dateTo } = resolveDateRange();
    onViewPerson({ registrationId, dateFrom, dateTo });
  }, [onViewPerson, resolveDateRange]);

  const handlePrintPdf = useCallback(async () => {
    const { dateFrom, dateTo } = resolveDateRange();
    if (!dateFrom || !dateTo) {
      setError('Select a date range before printing.');
      return;
    }
    setPrinting(true);
    try {
      const { downloadAttendanceHistoryPdf } = await import('@/lib/pdfReportCenter');
      await downloadAttendanceHistoryPdf(employees, { dateFrom, dateTo });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to generate PDF');
    } finally {
      setPrinting(false);
    }
  }, [employees, resolveDateRange]);

  useEffect(() => {
    if (!isActive) {
      onPrintReady?.(null);
      return undefined;
    }
    onPrintReady?.(handlePrintPdf);
    return () => onPrintReady?.(null);
  }, [handlePrintPdf, onPrintReady, isActive]);

  const busy = loading || recalculating || printing;

  return (
    <div>
      {/* Desktop Toggle */}
      <div className="hide-on-desktop" style={{ marginBottom: '1rem', display: 'none' }}></div>

      {/* Mobile Inline Toolbar */}
      <div className="hide-on-desktop rc-mobile-toolbar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="rc-search-wrap" style={{ flex: 1, minWidth: 0 }}>
          <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="rc-search-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={recalculating || printing}
          />
        </div>
        <button type="button" className={`btn-secondary btn-sm ${showFilters ? 'btn-primary' : ''}`} onClick={() => setShowFilters(!showFilters)} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Toggle Filters">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => loadHistory()} disabled={busy} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={handlePrintPdf} disabled={printing} style={{ padding: '0 8px', flexShrink: 0 }} aria-label="Print">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        </button>
      </div>

      <div className={`rc-filter-panel rc-filter-panel--inline ${!showFilters ? 'hide-on-mobile' : ''}`}>
        <div className="rc-filter-panel__inline">
          <div className="form-group rc-filter-inline__item">
            <label>Range Type</label>
            <select value={rangeMode} onChange={e => handleRangeModeChange(e.target.value)} disabled={busy}>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="custom">From – To</option>
            </select>
          </div>

          {rangeMode === 'week' ? (
            <div className="form-group rc-filter-inline__item rc-filter-inline__item--week">
              <label>Week</label>
              <WeekRangePicker
                value={filters.week}
                onChange={(week) => setFilters((f) => ({ ...f, week }))}
              />
            </div>
          ) : rangeMode === 'month' ? (
            <div className="form-group rc-filter-inline__item">
              <label>Month</label>
              <input type="month" value={filters.month}
                onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
                disabled={busy} />
            </div>
          ) : (
            <>
              <div className="form-group rc-filter-inline__item">
                <label>From Date</label>
                <input type="date" value={filters.dateFrom}
                  onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  disabled={busy} />
              </div>
              <div className="form-group rc-filter-inline__item">
                <label>To Date</label>
                <input type="date" value={filters.dateTo}
                  onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                  disabled={busy} />
              </div>
            </>
          )}

          <div className="form-group rc-filter-inline__item">
            <label>View</label>
            <select value={viewMode} onChange={e => setViewMode(e.target.value)} disabled={busy}>
              <option value="abstract">Abstract</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="form-group rc-filter-inline__item rc-filter-inline__item--search hide-on-mobile">
            <label htmlFor="att-history-search-desktop">Search</label>
            <div className="rc-search-wrap">
              <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="att-history-search-desktop"
                type="search"
                className="rc-search-input"
                placeholder="Search name, code, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={recalculating || printing}
                aria-label="Search attendance history"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="form-group rc-filter-inline__item">
            <label>Role</label>
            <select value={filters.roleId} onChange={e => setFilters(f => ({ ...f, roleId: e.target.value }))} disabled={busy}>
              <option value="">All Roles</option>
              {roles.map(role => (
                <option key={role._id || role.id} value={role._id || role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          {divisions.length > 0 && (
            <div className="form-group rc-filter-inline__item">
              <label>Division</label>
              <select value={filters.divisionId} onChange={e => setFilters(f => ({ ...f, divisionId: e.target.value }))} disabled={busy}>
                <option value="">All Divisions</option>
                {divisions.map(d => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group rc-filter-inline__item">
            <label>Shift</label>
            <select value={filters.shiftName} onChange={e => setFilters(f => ({ ...f, shiftName: e.target.value }))} disabled={busy}>
              <option value="">All Shifts</option>
              <option value="__none__">No Shift</option>
              {shiftNameOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="form-group rc-filter-inline__item">
            <label>Pay Frequency</label>
            <select value={filters.payFrequency} onChange={e => setFilters(f => ({ ...f, payFrequency: e.target.value }))} disabled={busy}>
              <option value="">All Pay Frequencies</option>
              {PAY_FREQUENCY_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {selectionColumns.map((label) => {
            const options = data?.selectionOptions?.[label] || selectionValueOptions(allEmployees, label);
            const val = selectionFilters[label] || 'all';
            const allowMultiple = options.length > 1;

            return (
              <div key={label} className="form-group rc-filter-inline__item">
                <label>{label}</label>
                {allowMultiple ? (
                  <SearchableSelect
                    options={options}
                    value={val}
                    multiple={true}
                    onChange={(newVal) => setSelectionFilters({ ...selectionFilters, [label]: newVal })}
                    placeholder={`All ${label}s`}
                    disabled={busy}
                  />
                ) : (
                  <select
                    value={val}
                    onChange={(e) => setSelectionFilters({ ...selectionFilters, [label]: e.target.value })}
                    disabled={busy}
                  >
                    <option value="all">All {label}s</option>
                    {options.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}

          <div className="form-group rc-filter-inline__item rc-filter-inline__item--action" style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRecalculate}
                disabled={busy}
                title="Recalculate attendance and payroll from current shift timings and minimum hours"
              >
                {recalculating ? 'Recalculating…' : 'Recalculate'}
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn-enterprise-primary"
                onClick={() => setShowBulkPaySlips(true)}
                disabled={busy}
                title="Print generated pay slips for the current date range"
              >
                Pay Slips
              </button>
            </div>
          </div>

          {(loading || loadingMore || recalculating) && (
            <div className="rc-filter-inline__loading" aria-live="polite">
              <Spinner size={16} />
              <span>
                {recalculating
                  ? 'Recalculating from current shifts…'
                  : loadingMore
                    ? `Loading more… ${data?.employees?.length || 0}/${data?.total || '—'}`
                    : 'Updating…'}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <p className="error-msg" style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => loadHistory()}
            disabled={busy}
          >
            Retry
          </button>
        </div>
      )}
      {success && <p className="success-msg" style={{ marginBottom: '1rem' }}>{success}</p>}

      {loading && !data ? (
        <div className="rc-table-loading">
          {[...Array(6)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
          title={error && !data ? 'Could not load attendance' : search.trim() ? 'No matching people' : 'No employees found'}
          desc={error && !data
            ? `${error} Click Retry above after the backend is ready.`
            : search.trim()
              ? `No registered people match “${search.trim()}” for the selected filters.`
              : 'No registered people match the selected filters.'}
        />
      ) : viewMode === 'abstract' ? (
        <div className="rc-att-abstract-wrap">
          <div className="rc-table-meta rc-att-grid-meta">
            <span>{fmt(employees.length)} employees</span>
            <span className="rc-att-grid-meta__legend">
              {hasLockedDays && <span className="rc-pay-lock-legend">Amber highlight = pay locked</span>}
              {data?.dateFrom && data?.dateTo && (
                <span className="rc-att-grid-meta__range">
                  {formatDate(data.dateFrom)} — {formatDate(data.dateTo)}
                </span>
              )}
            </span>
          </div>
          <AttendanceAbstractTable
            employees={employees}
            onViewPerson={handleViewPerson}
            selectionColumns={selectionColumns}
            pinSortDir={pinSortDir}
            onPinSort={handlePinSort}
          />
        </div>
      ) : (
        <div className="rc-att-grid-wrap">
          <div className="rc-table-meta rc-att-grid-meta">
            <span>{fmt(employees.length)} employees</span>
            <span className="rc-att-grid-meta__legend">
              {hasLockedDays && <span className="rc-pay-lock-legend">Amber highlight = pay locked</span>}
              {data?.dateFrom && data?.dateTo && (
                <span className="rc-att-grid-meta__range">
                  {formatDate(data.dateFrom)} — {formatDate(data.dateTo)}
                </span>
              )}
            </span>
          </div>
          <div className="rc-att-grid-scroll">
            <table className="rc-att-grid">
              <thead>
                <tr>
                  <th className="rc-att-grid__sticky rc-att-grid__index">#</th>
                  <SortHeader
                    label="Employee / PIN"
                    columnKey="code"
                    activeKey="code"
                    dir={pinSortDir}
                    onSort={handlePinSort}
                    className="rc-att-grid__sticky rc-att-grid__employee"
                  />
                  {dates.map(col => (
                    <th key={col.date} className="rc-att-grid__day">
                      <span className="rc-att-grid__day-num">{col.day}</span>
                      <span className="rc-att-grid__day-wd">{col.weekday}</span>
                    </th>
                  ))}
                  <th className="rc-att-grid__summary rc-att-grid__summary--present">Present</th>
                  <th className="rc-att-grid__summary rc-att-grid__summary--present">Partial</th>
                  <th className="rc-att-grid__summary rc-att-grid__summary--absent">Absent</th>
                  <th className="rc-att-grid__summary rc-att-grid__summary--pay">Per Day</th>
                  <th className="rc-att-grid__summary rc-att-grid__summary--pay">Pay Days</th>
                  <th className="rc-att-grid__summary rc-att-grid__summary--pay">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayedEmployees.map((emp, idx) => (
                  <tr key={`${emp.registrationId || 'emp'}-${idx}`} className="rc-att-grid__row">
                    <td className="rc-att-grid__sticky rc-att-grid__index">{idx + 1}</td>
                    <td className="rc-att-grid__sticky rc-att-grid__employee rc-att-grid__employee--clickable"
                      onClick={() => handleViewPerson(emp.registrationId)}
                      tabIndex={0} role="button"
                      aria-label={`View history for ${emp.displayName || 'Unnamed'}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewPerson(emp.registrationId); } }}>
                      <div className="rc-att-grid__person">
                        <Avatar url={emp.photoUrl} name={emp.displayName} size={32} />
                        <div className="rc-att-grid__person-info">
                          <span className="rc-att-grid__person-name">
                            {emp.displayName || 'Unnamed'}
                            {emp.lockedDayCount > 0 && <PayLockMark className="rc-pay-lock-mark--inline" />}
                          </span>
                          <span className="rc-att-grid__person-code">#{emp.registrationCode}</span>
                          {emp.registeredAt && (
                            <span className="rc-att-grid__person-joined">Joined {formatDate(emp.registeredAt)}</span>
                          )}
                          {selectionColumns.map(label => {
                            const val = selectionValueFor(emp, label);
                            if (val === '—') return null;
                            return (
                              <span key={`grid-sel-${emp.registrationId}-${label}`} className="rc-att-grid__person-joined">
                                {label}: {val}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    {emp.days.map(day => (
                      <AttendanceCell
                        key={`${emp.registrationId}-${day.date}`}
                        day={day}
                        onSelect={(selected) => setSelectedDay({ employee: emp, day: selected })}
                      />
                    ))}
                    <td className="rc-att-grid__total rc-att-grid__total--present">{emp.summary.present}</td>
                    <td className="rc-att-grid__total rc-att-grid__total--present">{emp.summary.halfDay ?? 0}</td>
                    <td className="rc-att-grid__total rc-att-grid__total--absent">{emp.summary.absent}</td>
                    <td className="rc-att-grid__total rc-att-grid__total--pay">
                      {emp.payAmount != null ? formatCurrency(emp.payAmount) : '—'}
                    </td>
                    <td className="rc-att-grid__total rc-att-grid__total--pay">
                      {emp.payment?.paymentDays ?? '—'}
                    </td>
                    <td className="rc-att-grid__total rc-att-grid__total--pay">
                      {emp.payment ? formatCurrency(emp.payment.totalAmount) : '—'}
                      {emp.lockedDayCount > 0 && emp.unlockedPayment != null && (
                        <div className="rc-table__muted">Rem. {formatCurrency(emp.unlockedPayment.totalAmount)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {data?.hasMore && (
        <div 
          ref={loaderRef}
          style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '1rem', padding: '1rem' }}
        >
          <div className="rc-spinner" style={{ display: 'inline-block', width: '24px', height: '24px' }}></div>
          <p className="rc-table__muted" style={{ marginTop: '0.5rem', margin: 0 }}>
            {loadingMore ? 'Loading...' : `Scroll to load more (${data.total - employees.length} remaining)`}
          </p>
        </div>
      )}
      {selectedDay && (
        <AttendanceDayDialog
          employee={selectedDay.employee}
          day={selectedDay.day}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {recalcConfirmOpen && (
        <PortalWrapper>
          <div className="rc-dialog-overlay" onClick={() => setRecalcConfirmOpen(false)}>
            <div className="rc-dialog" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
              <div className="rc-dialog__header">
                <h2 className="rc-dialog__title" style={{ marginTop: 0 }}>Confirm Recalculation</h2>
                <button className="rc-dialog__close" onClick={() => setRecalcConfirmOpen(false)} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="rc-dialog__body">
                <p style={{ marginTop: 0 }}>
                  Are you sure you want to recalculate attendance for the <strong>{employees.length}</strong> selected employees based on your active search and filters?
                </p>
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setRecalcConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" onClick={executeRecalculate}>
                    Yes, Recalculate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalWrapper>
      )}
      {showBulkPaySlips && (
        <PortalWrapper>
          <BulkPaySlipsDialog
            dateFrom={resolveDateRange().dateFrom}
            dateTo={resolveDateRange().dateTo}
            onClose={() => setShowBulkPaySlips(false)}
          />
        </PortalWrapper>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — ANALYTICS
════════════════════════════════════════════════════════════════ */
function MiniBarChart({ data = [], labels = [], color = '#2563EB' }) {
  const max = Math.max(...data, 1);
  return (
    <div className="rc-bar-chart">
      {data.map((v, i) => (
        <div key={i} className="rc-bar-chart__col">
          <div className="rc-bar-chart__bar-wrap">
            <div className="rc-bar-chart__bar"
              style={{ height: `${(v / max) * 100}%`, background: color }} />
          </div>
          {labels[i] && <div className="rc-bar-chart__label">{labels[i]}</div>}
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ gateLogs = [], registrations = [] }) {
  const today = new Date().toDateString();
  const todayLogs = gateLogs.filter(l => new Date(l.createdAt).toDateString() === today);
  const todayEntry = todayLogs.filter(l => l.eventType === 'entry' && l.matched).length;
  const todayExit = todayLogs.filter(l => l.eventType === 'exit' && l.matched).length;

  const [divisionsData, setDivisionsData] = useState([]);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [vehicleData, setVehicleData] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  const [showAllDivisions, setShowAllDivisions] = useState(false);
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.reports.dailyPasses({ date: todayDateStringIst() }).catch(() => null),
      api.reports.departmentActivity({ statsOnly: 'true', date: todayDateStringIst() }).catch(() => null),
      api.vehicles.movements({ limit: 50 }).catch(() => null),
    ]).then(([dailyRes, deptRes, vehicleRes]) => {
      if (cancelled) return;

      // Division Activity Summary
      if (dailyRes?.roles) {
        const divMap = new Map();
        for (const r of dailyRes.roles) {
          for (const p of r.people || []) {
            const divName = p.divisionName || p.divisionInside || 'General Division';
            if (!divMap.has(divName)) {
              divMap.set(divName, { divisionName: divName, enteredCount: 0, inCount: 0, exitCount: 0, total: 0 });
            }
            const item = divMap.get(divName);
            item.total++;
            if (p.hadGateActivity || p.gateEntryAt) item.enteredCount++;
            if (p.divisionInside) item.inCount++;
            if (p.gateExitAt) item.exitCount++;
          }
        }
        setDivisionsData(Array.from(divMap.values()).sort((a, b) => b.total - a.total));
      }

      // Department Activity Summary
      if (deptRes?.departments) {
        const list = deptRes.departments.map(d => ({
          departmentName: d.departmentName || d.name,
          divisionName: d.divisionName || '',
          enteredCount: d.enteredCount || 0,
          inCount: d.currentlyIn || d.inCount || 0,
          exitCount: d.exitedCount || d.exitCount || 0,
          total: d.totalEmployees || d.total || 0,
        })).sort((a, b) => b.total - a.total);
        setDepartmentsData(list);
      }

      // Vehicle Activity
      if (Array.isArray(vehicleRes)) {
        setVehicleData(vehicleRes);
      } else if (Array.isArray(vehicleRes?.movements)) {
        setVehicleData(vehicleRes.movements);
      }
    }).finally(() => {
      if (!cancelled) setLoadingExtra(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Hourly distribution
  const entryByHour = Array(24).fill(0);
  const exitByHour = Array(24).fill(0);
  todayLogs.forEach(l => {
    const h = new Date(l.createdAt).getHours();
    if (l.eventType === 'entry' && l.matched) entryByHour[h]++;
    else if (l.eventType === 'exit' && l.matched) exitByHour[h]++;
  });

  // Working hours (6-22 range)
  const workEntries = entryByHour.slice(6, 22);
  const workExits = exitByHour.slice(6, 22);
  const hourLabels = Array.from({ length: 16 }, (_, i) => `${i + 6}h`);
  const peakEntryHour = workEntries.indexOf(Math.max(...workEntries));
  const peakExitHour = workExits.indexOf(Math.max(...workExits));

  // Role distribution
  const roleMap = {};
  registrations.forEach(r => { const n = r.roleName || 'Unknown'; roleMap[n] = (roleMap[n] || 0) + 1; });
  const topRoles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxRole = Math.max(...topRoles.map(r => r[1]), 1);

  // Registration status
  const verified = registrations.filter(r => r.status === 'verified').length;
  const pending = registrations.filter(r => r.status === 'pending_verification').length;
  const rejected = registrations.filter(r => r.status === 'rejected').length;

  // Accuracy
  const scored = gateLogs.filter(l => l.matched && l.matchScore);
  const avgAcc = scored.length ? Math.round(scored.reduce((s, l) => s + l.matchScore * 100, 0) / scored.length) : 99;

  // Weekly trend (last 7 days)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toDateString();
    return gateLogs.filter(l => new Date(l.createdAt).toDateString() === ds && l.eventType === 'entry' && l.matched).length;
  });
  const weekLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  });

  const PREVIEW_LIMIT = 5;
  const visibleDivisions = showAllDivisions ? divisionsData : divisionsData.slice(0, PREVIEW_LIMIT);
  const visibleDepartments = showAllDepartments ? departmentsData : departmentsData.slice(0, PREVIEW_LIMIT);
  const visibleVehicles = showAllVehicles ? vehicleData : vehicleData.slice(0, PREVIEW_LIMIT);

  const StatCard = ({ label, value, sub, color = '#2563EB' }) => (
    <div className="rc-analytics-stat">
      <div className="rc-analytics-stat__value" style={{ color }}>{value}</div>
      <div className="rc-analytics-stat__label">{label}</div>
      {sub && <div className="rc-analytics-stat__sub">{sub}</div>}
    </div>
  );

  return (
    <div className="rc-analytics">
      {/* Summary row */}
      <div className="rc-analytics__summary-row">
        <StatCard label="Today's Entries" value={fmt(todayEntry)} color="#2563EB" />
        <StatCard label="Today's Exits" value={fmt(todayExit)} color="#10B981" />
        <StatCard label="Total Logs" value={fmt(gateLogs.length)} color="#6B7280" />
        <StatCard label="AI Accuracy" value={`${avgAcc}%`} color="#F59E0B"
          sub={`${scored.length} scored scans`} />
        <StatCard label="Total Registered" value={fmt(registrations.length)} color="#3B82F6" />
        <StatCard label="Verified" value={fmt(verified)} color="#10B981" sub={`${pending} pending`} />
      </div>

      <div className="rc-analytics__grid">
        {/* Hourly Entry Trend */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Hourly Entry Trend</h3>
            <span className="rc-analytics-panel__meta">Today · Peak at {peakEntryHour + 6}:00</span>
          </div>
          <MiniBarChart data={workEntries} labels={hourLabels} color="#2563EB" />
        </div>

        {/* Hourly Exit Trend */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Hourly Exit Trend</h3>
            <span className="rc-analytics-panel__meta">Today · Peak at {peakExitHour + 6}:00</span>
          </div>
          <MiniBarChart data={workExits} labels={hourLabels} color="#10B981" />
        </div>

        {/* Weekly Activity */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Weekly Entry Activity</h3>
            <span className="rc-analytics-panel__meta">Last 7 days</span>
          </div>
          <MiniBarChart data={weeklyData} labels={weekLabels} color="#3B82F6" />
        </div>

        {/* Registration Status */}
        <div className="rc-analytics-panel">
          <div className="rc-analytics-panel__header">
            <h3>Registration Status</h3>
            <span className="rc-analytics-panel__meta">{registrations.length} total</span>
          </div>
          <div className="rc-status-bars">
            {[
              { label: 'Verified', value: verified, total: registrations.length, color: '#10B981' },
              { label: 'Pending', value: pending, total: registrations.length, color: '#F59E0B' },
              { label: 'Rejected', value: rejected, total: registrations.length, color: '#EF4444' },
            ].map(item => (
              <div key={item.label} className="rc-status-bar-row">
                <span className="rc-status-bar-row__label">{item.label}</span>
                <div className="rc-status-bar-row__track">
                  <div className="rc-status-bar-row__fill"
                    style={{ width: `${item.total ? (item.value / item.total) * 100 : 0}%`, background: item.color }} />
                </div>
                <span className="rc-status-bar-row__value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Role Distribution */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Role Distribution</h3>
            <span className="rc-analytics-panel__meta">Top {topRoles.length} roles</span>
          </div>
          <div className="rc-role-dist">
            {topRoles.map(([name, count]) => (
              <div key={name} className="rc-role-dist__row">
                <span className="rc-role-dist__name">{name}</span>
                <div className="rc-role-dist__track">
                  <div className="rc-role-dist__fill"
                    style={{ width: `${(count / maxRole) * 100}%` }} />
                </div>
                <span className="rc-role-dist__count">{count}</span>
              </div>
            ))}
            {topRoles.length === 0 && <p className="rc-analytics__empty">No registration data available.</p>}
          </div>
        </div>

        {/* Division Activity Summary */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Division Activity Summary</h3>
            <span className="rc-analytics-panel__meta">{divisionsData.length} divisions</span>
          </div>
          <div className="rc-analytics-list">
            {visibleDivisions.map((div) => (
              <div key={div.divisionName} className="rc-analytics-row">
                <span className="rc-analytics-row__name">{div.divisionName}</span>
                <div className="rc-analytics-row__pills">
                  {div.inCount > 0 && <span className="rc-filter-pill"><span className="rc-table__status-dot rc-table__status-dot--inside" />{div.inCount} in</span>}
                  <span className="rc-filter-pill rc-filter-pill--muted">Entered: {div.enteredCount}</span>
                  <span className="rc-filter-pill rc-filter-pill--muted">Exited: {div.exitCount}</span>
                  <span className="rc-filter-pill rc-filter-pill--muted">Total: {div.total}</span>
                </div>
              </div>
            ))}
            {divisionsData.length === 0 && !loadingExtra && <p className="rc-analytics__empty">No division activity data available.</p>}
            {divisionsData.length > PREVIEW_LIMIT && (
              <button type="button" className="btn-secondary btn-sm rc-analytics__view-more" onClick={() => setShowAllDivisions(!showAllDivisions)}>
                {showAllDivisions ? 'Show Less' : `View More (${divisionsData.length - PREVIEW_LIMIT} more)`}
              </button>
            )}
          </div>
        </div>

        {/* Department Activity Summary */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Department Activity Summary</h3>
            <span className="rc-analytics-panel__meta">{departmentsData.length} departments</span>
          </div>
          <div className="rc-analytics-list">
            {visibleDepartments.map((dept) => (
              <div key={dept.departmentName} className="rc-analytics-row">
                <div>
                  <strong className="rc-analytics-row__name">{dept.departmentName}</strong>
                  {dept.divisionName && <span className="rc-analytics-row__sub"> · {dept.divisionName}</span>}
                </div>
                <div className="rc-analytics-row__pills">
                  {dept.inCount > 0 && <span className="rc-filter-pill"><span className="rc-table__status-dot rc-table__status-dot--inside" />{dept.inCount} in</span>}
                  <span className="rc-filter-pill rc-filter-pill--muted">Entered: {dept.enteredCount}</span>
                  <span className="rc-filter-pill rc-filter-pill--muted">Exited: {dept.exitCount}</span>
                  <span className="rc-filter-pill rc-filter-pill--muted">Total: {dept.total}</span>
                </div>
              </div>
            ))}
            {departmentsData.length === 0 && !loadingExtra && <p className="rc-analytics__empty">No department activity data available.</p>}
            {departmentsData.length > PREVIEW_LIMIT && (
              <button type="button" className="btn-secondary btn-sm rc-analytics__view-more" onClick={() => setShowAllDepartments(!showAllDepartments)}>
                {showAllDepartments ? 'Show Less' : `View More (${departmentsData.length - PREVIEW_LIMIT} more)`}
              </button>
            )}
          </div>
        </div>

        {/* Vehicle Activity Summary */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Vehicle Activity Summary</h3>
            <span className="rc-analytics-panel__meta">{vehicleData.length} recent movements</span>
          </div>
          <div className="rc-analytics-list">
            {visibleVehicles.map((move, i) => (
              <div key={move._id || i} className="rc-analytics-row">
                <div>
                  <strong className="rc-analytics-row__name">{move.vehicleNumber || move.registrationNo || move.registrationId?.vehicleNumber || 'Vehicle'}</strong>
                  <span className="rc-analytics-row__sub"> · {move.vehicleType || move.type || 'Standard'}</span>
                </div>
                <div className="rc-analytics-row__pills">
                  <span className={`badge ${move.direction === 'IN' || move.movementType === 'ENTRY' ? 'badge-success' : 'badge-info'}`}>
                    {move.direction || move.movementType || 'ENTRY'}
                  </span>
                  <span className="rc-analytics-row__sub">{formatDateTime(move.createdAt || move.timestamp)}</span>
                </div>
              </div>
            ))}
            {vehicleData.length === 0 && !loadingExtra && <p className="rc-analytics__empty">No vehicle movement data available.</p>}
            {vehicleData.length > PREVIEW_LIMIT && (
              <button type="button" className="btn-secondary btn-sm rc-analytics__view-more" onClick={() => setShowAllVehicles(!showAllVehicles)}>
                {showAllVehicles ? 'Show Less' : `View More (${vehicleData.length - PREVIEW_LIMIT} more)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE — REPORT CENTER
════════════════════════════════════════════════════════════════ */
const REPORT_TABS = [
  { id: 'today', label: "Today's Activity" },
  { id: 'division', label: 'Division Activity' },
  { id: 'department', label: 'Department Activity' },
  { id: 'history', label: 'Attendance History' },
  { id: 'analytics', label: 'Analytics' },
];

function ReportsContent() {
  const now = useNow();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = REPORT_TABS.find(t => t.id === tabParam) ? tabParam : 'today';
  const dateSelectable = tab === 'today' || tab === 'division' || tab === 'department';

  const [selectedDate, setSelectedDate] = useState(() => todayDateStringIst());
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [gateLogs, setGateLogs] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(() => new Set([tab]));
  const tabPrintRef = useRef(null);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  const registerTabPrint = useCallback((fn) => {
    tabPrintRef.current = fn;
  }, []);

  const handleHeaderPrint = useCallback(async () => {
    if (typeof tabPrintRef.current === 'function') {
      setPrinting(true);
      try {
        await tabPrintRef.current();
      } finally {
        setPrinting(false);
      }
      return;
    }
    printReportCenterFallback();
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [logs, regs] = await Promise.all([
        api.gate.logs({ limit: 200 }).catch(() => []),
        api.reports.listRegistrations({ limit: 500 }).catch(() => []),
      ]);
      setGateLogs(Array.isArray(logs) ? logs : []);
      setRegistrations(Array.isArray(regs) ? regs : []);
    } finally {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const displayDate = dateSelectable ? selectedDate : todayDateStringIst(now);
  const dateStr = parseDateForPdf(displayDate).toLocaleDateString('en-GB', {
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const handleViewPerson = useCallback((registrationId, divisionId, dateFrom, dateTo) => {
    setSelectedPerson({ registrationId, divisionId, dateFrom, dateTo });
  }, []);

  const tabLabel = REPORT_TABS.find(t => t.id === tab)?.label ?? 'Reports';

  return (
    <div className="page-shell admin-fade-in rc-print-root" style={{ overflow: 'hidden' }}>
      {/* ── Report Center Header ── */}
      <div className="rc-page-header">
        <div className="rc-page-header__left">
          <div className="rc-page-header__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
          <div>
            <h1 className="rc-page-header__title">Report Center — {tabLabel}</h1>
            <p className="rc-page-header__subtitle">Monitor attendance, access history, analytics and export reports.</p>
          </div>
        </div>
        <div className="rc-page-header__right no-print">
          <div className="rc-page-header__clock">
            {dateSelectable ? (
              <ActivityDatePicker
                value={selectedDate}
                onChange={setSelectedDate}
                displayLabel={dateStr}
                className="rc-activity-date--header"
              />
            ) : (
              <span className="rc-page-header__date">{dateStr}</span>
            )}
            <span className="rc-page-header__time">{timeStr}</span>
          </div>
          <button className="btn-secondary btn-sm hide-on-mobile" onClick={loadData} title="Refresh all data" aria-label="Refresh">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
          <button
            className="btn-secondary btn-sm hide-on-mobile"
            onClick={handleHeaderPrint}
            disabled={printing}
            title={tab === 'today' || tab === 'division' || tab === 'history' ? 'Download professional PDF report' : 'Print current report'}
            aria-label="Print"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            {printing ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>

      <div className="rc-body">
        {/* Keep visited tabs mounted so switching does not remount + refetch */}
        <div className="rc-tab-content">
          {mountedTabs.has('today') && (
            <div
              className={`rc-tab-panel${tab === 'today' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'today'}
              aria-hidden={tab !== 'today'}
            >
              <TodayActivityTab
                isActive={tab === 'today'}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onViewPerson={handleViewPerson}
                onPrintReady={registerTabPrint}
              />
            </div>
          )}
          {mountedTabs.has('division') && (
            <div
              className={`rc-tab-panel${tab === 'division' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'division'}
              aria-hidden={tab !== 'division'}
            >
              <TodayActivityTab
                isActive={tab === 'division'}
                divisionRequired
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onViewPerson={handleViewPerson}
                onPrintReady={registerTabPrint}
              />
            </div>
          )}
          {mountedTabs.has('department') && (
            <div
              className={`rc-tab-panel${tab === 'department' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'department'}
              aria-hidden={tab !== 'department'}
            >
              <DepartmentActivityTab
                isActive={tab === 'department'}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onViewPerson={handleViewPerson}
              />
            </div>
          )}
          {mountedTabs.has('history') && (
            <div
              className={`rc-tab-panel${tab === 'history' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'history'}
              aria-hidden={tab !== 'history'}
            >
              <AttendanceHistoryTab
                isActive={tab === 'history'}
                onViewPerson={setSelectedPerson}
                onPrintReady={registerTabPrint}
              />
            </div>
          )}
          {mountedTabs.has('analytics') && (
            <div
              className={`rc-tab-panel${tab === 'analytics' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'analytics'}
              aria-hidden={tab !== 'analytics'}
            >
              <AnalyticsTab gateLogs={gateLogs} registrations={registrations} />
            </div>
          )}
          {mountedTabs.has('export') && (
            <div
              className={`rc-tab-panel${tab === 'export' ? ' rc-tab-panel--active admin-fade-in' : ''}`}
              hidden={tab !== 'export'}
              aria-hidden={tab !== 'export'}
            >
              <ExportCenterTab />
            </div>
          )}
        </div>
      </div>

      {selectedPerson && (
        <PortalWrapper>
          <PersonDetailDialog
            registrationId={selectedPerson.registrationId}
            dateFrom={selectedPerson.dateFrom}
            dateTo={selectedPerson.dateTo}
            divisionId={selectedPerson.divisionId}
            onClose={() => setSelectedPerson(null)}
          />
        </PortalWrapper>
      )}
    </div>
  );
}

function BulkPaySlipsDialog({ dateFrom, dateTo, onClose }) {
  const [paySlips, setPaySlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const loadPaySlips = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.payroll.getPaySlips({ fromDate: dateFrom, toDate: dateTo });
      const list = Array.isArray(res) ? res : [];
      setPaySlips(list);
      setSelectedIds(new Set());
    } catch (e) {
      setError(e.message || 'Failed to load pay slips');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadPaySlips();
  }, [loadPaySlips]);

  const slipId = (ps) => String(ps?._id || ps?.id || '');
  const allIds = paySlips.map(slipId).filter(Boolean);
  const selectedCount = selectedIds.size;
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggleSlip = (id) => {
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (allIds.length > 0 && allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  };

  const handlePrint = async () => {
    const selected = paySlips.filter((ps) => selectedIds.has(slipId(ps)));
    if (!selected.length) {
      setError('Select at least one person to print.');
      return;
    }
    setPrinting(true);
    setError('');
    try {
      const detailsList = [];
      for (const slip of selected) {
        const details = await api.payroll.getPaySlipDetails(slipId(slip));
        detailsList.push(details);
      }
      const { downloadPaySlipsPdf } = await import('@/lib/pdfPaySlips');
      await downloadPaySlipsPdf(detailsList, { dateFrom, dateTo });
    } catch (e) {
      setError(e.message || 'Failed to print pay slips.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="rc-dialog-overlay" onClick={onClose} role="dialog" aria-modal>
      <div className="rc-dialog rc-dialog--person-wide" onClick={e => e.stopPropagation()}>
        <div className="rc-dialog__header">
          <div className="rc-dialog__header-info">
            <h2 className="rc-dialog__title">Print Pay Slips</h2>
            <p className="rc-dialog__subtitle">{formatDate(dateFrom)} — {formatDate(dateTo)}</p>
          </div>
          <button className="rc-dialog__close" onClick={onClose} aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rc-dialog__body" style={{ padding: '1rem' }}>
          {error && <p className="error-msg">{error}</p>}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><Spinner size={24} /></div>
          ) : paySlips.length === 0 ? (
            <EmptyState
              title="No generated pay slips"
              desc="No pay slips have been generated for this date range yet."
            />
          ) : (
            <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'hidden' }}>
              <table className="rc-att-grid">
                <thead>
                  <tr>
                    <th style={{ width: 42, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all people"
                      />
                    </th>
                    <th className="rc-att-grid__sticky">Employee</th>
                    <th>Period</th>
                    <th className="rc-att-grid__summary--pay">Hours</th>
                    <th className="rc-att-grid__summary--pay">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paySlips.map((ps) => {
                    const id = slipId(ps);
                    const checked = selectedIds.has(id);
                    return (
                      <tr
                        key={id}
                        onClick={() => toggleSlip(id)}
                        style={{ cursor: 'pointer', background: checked ? 'rgba(37, 99, 235, 0.06)' : undefined }}
                      >
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSlip(id)}
                            aria-label={`Select ${ps.registrationName || ps.registrationCode || 'person'}`}
                          />
                        </td>
                        <td className="rc-att-grid__sticky">
                          <div>
                            <strong>{ps.registrationName}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {ps.registrationCode}
                          </div>
                        </td>
                        <td>{formatDate(ps.fromDate)} to {formatDate(ps.toDate)}</td>
                        <td className="rc-att-grid__summary--pay">{ps.totalHours || 0}</td>
                        <td className="rc-att-grid__summary--pay">{formatCurrency(ps.amount || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="rc-dialog__footer">
          <span className="rc-table__muted" style={{ marginRight: 'auto' }}>
            {paySlips.length > 0 ? `${selectedCount} of ${paySlips.length} selected` : ''}
          </span>
          <button
            type="button"
            className="btn-enterprise-primary"
            onClick={handlePrint}
            disabled={printing || selectedCount === 0}
          >
            {printing ? 'Preparing PDF…' : `Print Pay Slips (${selectedCount})`}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={printing}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}
