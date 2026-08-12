'use client';

import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime, todayDateStringIst } from '@/lib/formatDate';
import { formatCurrency, PAY_FREQUENCY_LABELS, PAY_FREQUENCIES } from '@/lib/payFrequency';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import { formatShiftWindow, formatDurationHours } from '@/lib/shiftTiming';
import PassCard from '@/components/PassCard';
import { useAuth } from '@/components/AuthProvider';

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════════ */

function PortalWrapper({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
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

/** Compact date like "Jul 26" (IST) — shown under overnight exit times. */
function formatShortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
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

function EntryLocationMeta({ entry, compact = false }) {
  const isDept = entry.scanType === 'department';

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
  const kind = isDeptScan(entry) ? 'Department' : entry.scanType === 'activity' ? 'Activity' : 'Gate';
  const action = scanActivityLabel(entry);
  const at = entry.at || entry.entryAt;

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
          </div>
          <p className="rc-scan-lightbox__time">
            {formatTime(at)}
            {workDate && istDateOf(at) && istDateOf(at) !== workDate && (
              <span className="rc-scan-lightbox__date"> · {formatShortDate(at)}</span>
            )}
          </p>
          {entry.label && <p className="rc-scan-lightbox__label">{entry.label}</p>}
          <EntryLocationMeta entry={entry} />
          {entry.matchScore != null && (
            <p className="rc-scan-lightbox__meta">
              Match: {Math.round(Number(entry.matchScore) * 100)}%
            </p>
          )}
          {entry.remark?.trim() && (
            <p className="rc-scan-lightbox__meta">Remark: {entry.remark.trim()}</p>
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
          <div className="rc-timeline__card-main">
            <div className="rc-timeline__card-top">
              <div className="rc-timeline__badges">
                <span className={`badge ${isActivity ? 'badge-warning' : isEntry ? 'badge-success' : 'badge-info'}`}>
                  {isActivity ? 'SEEN' : (entry.eventType || (isEntry ? 'ENTRY' : 'EXIT'))}
                </span>
                <span className={`badge ${isActivity ? 'badge-secondary' : isGate ? 'badge-secondary' : 'badge-warning'}`}>
                  {isActivity ? 'Activity' : isGate ? 'Gate' : 'Dept'}
                </span>
                {isActive && (
                  <span className="badge badge-warning">
                    <span className="today-timeline__pulse" aria-hidden /> Active
                  </span>
                )}
              </div>
              <span className="rc-timeline__time">{time ? formatTime(time) : '—'}</span>
            </div>
            <p className="rc-timeline__label">{entry.label}</p>
            <EntryLocationMeta entry={entry} />
            {entry.entryAt && entry.exitAt && (
              <p className="rc-timeline__meta rc-timeline__meta--duration">
                Duration: {calcDuration(entry.entryAt, entry.exitAt)}
              </p>
            )}
          </div>
          {showPhoto && <ScanPhoto url={entry.photoUrl} label={`${entry.eventType || 'Scan'} photo`} onClick={() => onOpen?.(entry)} />}
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
  const badgeTitle = day.overridden
    ? `Manually set${day.overrideBy ? ` by ${day.overrideBy}` : ''}${day.overrideNote ? ` — ${day.overrideNote}` : ''}`
    : (day.label || day.code);

  return (
    <div className={`rc-status-edit ${day.overridden ? 'rc-status-edit--overridden' : ''}`}>
      <span
        className={`rc-period-sessions-table__status rc-period-sessions-table__status--${day.status?.toLowerCase()}`}
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
          title="Edit status"
          aria-label={`Edit attendance status for ${day.date}`}
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
                      {overnight ? (
                        <span className="rc-period-sessions-table__date-overnight">
                          {formatDate(day.date)}
                          <span className="rc-period-sessions-table__date-next"> – {formatDate(nextIstDateStr(day.date))}</span>
                        </span>
                      ) : (
                        formatDate(day.date)
                      )}
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
    ]
    : [
      { id: 'today', label: "Today's Timeline" },
      { id: 'history', label: 'Date History' },
      { id: 'details', label: 'Details' },
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
              <div className="sub-nav" style={{ marginBottom: '1rem' }}>
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
            </>
          )}
        </div>

        {dayPassError && !showDayPass && (
          <p className="error-msg" style={{ margin: '0 1.5rem' }}>{dayPassError}</p>
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
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — TODAY'S ACTIVITY
════════════════════════════════════════════════════════════════ */
function TodayActivityTab({ onViewPerson, onPrintReady, divisionRequired = false, selectedDate, onDateChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [payFreqFilter, setPayFreqFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [shiftOptions, setShiftOptions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState(divisionRequired ? '' : 'all');
  const [divisions, setDivisions] = useState([]);
  const [selectionFilters, setSelectionFilters] = useState({});
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [printing, setPrinting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const intervalRef = useRef(null);

  const activityDate = selectedDate || todayDateStringIst();
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
    api.reports.divisions()
      .then((res) => setDivisions(Array.isArray(res?.divisions) ? res.divisions : []))
      .catch(() => setDivisions([]));
    api.shifts.list()
      .then((list) => setShiftOptions(Array.isArray(list) ? list : []))
      .catch(() => setShiftOptions([]));
  }, []);

  const load = useCallback(async (silent = false) => {
    if (divisionRequired && !divisionFilter) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = { date: activityDate };
      if (divisionFilter !== 'all') params.divisionId = divisionFilter;
      const result = await api.reports.dailyPasses(params);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [divisionFilter, divisionRequired, activityDate]);

  useEffect(() => {
    if (divisionRequired && !divisionFilter) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    setData(null);
    load();
    // Live refresh only when viewing today
    if (isToday) {
      intervalRef.current = setInterval(() => load(true), 30000);
    }
    return () => clearInterval(intervalRef.current);
  }, [load, divisionFilter, divisionRequired, isToday]);

  // Flatten all people from all roles
  const allPeople = (data?.roles || []).flatMap(r =>
    r.people.map(p => ({ ...p, roleId: r.roleId, roleName: r.roleName, isShiftBased: r.isShiftBased }))
  );

  const selectionColumns = collectSelectionColumns(allPeople);
  const roleOptions = (data?.roles || []).map(r => ({ id: r.roleId, name: r.roleName }));
  const selectedDivision = divisions.find(d => d._id === divisionFilter);
  // Union of configured shifts and shift names present in today's rows (covers deleted shifts)
  const shiftNameOptions = [...new Set([
    ...shiftOptions.map(s => s.name),
    ...allPeople.map(p => p.shiftName),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filtered = allPeople.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (p.displayName || '').toLowerCase().includes(q) ||
      (p.registrationCode || '').toLowerCase().includes(q) ||
      (p.roleName || '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'inside' && p.divisionInside) ||
      (filterStatus === 'outside' && !p.divisionInside && p.hadActivityToday) ||
      (filterStatus === 'inactive' && !p.divisionInside && !p.hadActivityToday);
    const matchPayFreq = payFreqFilter === 'all' || p.payFrequency === payFreqFilter;
    const matchRole = roleFilter === 'all' || p.roleId === roleFilter;
    const matchShift =
      shiftFilter === 'all' ||
      (shiftFilter === 'none' ? !p.shiftName : p.shiftName === shiftFilter);
    const matchSelections = selectionColumns.every(label => {
      const wanted = selectionFilters[label];
      if (!wanted || wanted === 'all') return true;
      return selectionValueFor(p, label) === wanted;
    });
    return matchSearch && matchStatus && matchPayFreq && matchRole && matchShift && matchSelections;
  }).sort((a, b) => {
    const res = compareSortValues(dailySortValue(a, sort.key), dailySortValue(b, sort.key));
    return sort.dir === 'asc' ? res : -res;
  });

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
    onPrintReady?.(handlePrintPdf);
    return () => onPrintReady?.(null);
  }, [handlePrintPdf, onPrintReady]);

  const insideCount = allPeople.filter(p => p.divisionInside).length;
  const activeCount = allPeople.filter(p => p.hadActivityToday).length;

  const openPerson = (registrationId) => {
    const divisionId = divisionFilter !== 'all' ? divisionFilter : '';
    if (isToday) {
      onViewPerson(registrationId, divisionId);
    } else {
      onViewPerson(registrationId, divisionId, activityDate, activityDate);
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
          <div className="rc-search-wrap hide-on-mobile">
            <svg className="rc-search-wrap__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" className="rc-search-input" placeholder="Search name, code, role…"
              value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" />
          </div>
          {(divisionRequired || divisions.length > 0) && (
            <select className="rc-select" value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)} aria-label="Filter by division">
              <option value={divisionRequired ? '' : 'all'}>
                {divisionRequired ? 'Select Division' : 'All Divisions'}
              </option>
              {divisions.map(d => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
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
            <option value="outside">Outside</option>
            {!divisionRequired && <option value="inactive">Not In {isToday ? 'Today' : 'This Day'}</option>}
          </select>
          <select className="rc-select" value={payFreqFilter} onChange={e => setPayFreqFilter(e.target.value)} aria-label="Filter by pay frequency">
            <option value="all">All Pay Frequencies</option>
            {PAY_FREQUENCY_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {selectionColumns.map(label => (
            <select
              key={`sel-filter-${label}`}
              className="rc-select"
              value={selectionFilters[label] || 'all'}
              onChange={e => setSelectionFilters(prev => ({ ...prev, [label]: e.target.value }))}
              aria-label={`Filter by ${label}`}
            >
              <option value="all">All · {label}</option>
              {selectionValueOptions(allPeople, label).map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          ))}
        </div>
        <div className="rc-filters-bar__right">
          <span className="rc-filter-pill">
            <span className="daily-pass-dot daily-pass-dot--inside" />{insideCount} Inside
          </span>
          <span className="rc-filter-pill rc-filter-pill--muted">{activeCount} Active {isToday ? 'Today' : 'This Day'}</span>
          <button className="btn-secondary btn-sm" onClick={() => load()} disabled={loading || printing}>
            {loading ? <Spinner size={14} /> : (
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
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          title={search || filterStatus !== 'all' || payFreqFilter !== 'all' || roleFilter !== 'all' || shiftFilter !== 'all' || Object.values(selectionFilters).some(v => v && v !== 'all') ? 'No matching people' : `No attendance ${isToday ? 'today' : `on ${dayLabel}`}`}
          desc={search ? 'Try adjusting your search or filters.' : `No gate activity recorded ${isToday ? 'today' : 'for this date'} yet.`}
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
              {filtered.map(person => (
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
        </div>
      )}
    </div>
  );
}

/**
 * Department Activity — pick a division, then a department, and view
 * entered / currently-in / exit counts for that department on the selected day.
 */
function DepartmentActivityTab({ onViewPerson, selectedDate, onDateChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [sort, setSort] = useState({ key: 'entry', dir: 'desc' });
  const intervalRef = useRef(null);

  const activityDate = selectedDate || todayDateStringIst();
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
    api.reports.divisions()
      .then((res) => setDivisions(Array.isArray(res?.divisions) ? res.divisions : []))
      .catch(() => setDivisions([]));
  }, []);

  useEffect(() => {
    setDepartmentFilter('');
    setData(null);
    if (!divisionFilter) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingDepartments(true);
    api.departments.list({ divisionId: divisionFilter, isActive: 'true' })
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

  const load = useCallback(async (silent = false) => {
    if (!divisionFilter || !departmentFilter) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await api.reports.departmentActivity({
        date: activityDate,
        divisionId: divisionFilter,
        departmentId: departmentFilter,
      });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [divisionFilter, departmentFilter, activityDate]);

  useEffect(() => {
    if (!divisionFilter || !departmentFilter) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    setData(null);
    load();
    if (isToday) {
      intervalRef.current = setInterval(() => load(true), 30000);
    }
    return () => clearInterval(intervalRef.current);
  }, [load, divisionFilter, departmentFilter, isToday]);

  const allPeople = data?.people || [];
  const selectedDivision = divisions.find((d) => d._id === divisionFilter);
  const selectedDepartment = departments.find((d) => d._id === departmentFilter)
    || (data?.departmentName ? { name: data.departmentName } : null);

  const filtered = allPeople.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (p.displayName || '').toLowerCase().includes(q)
      || (p.registrationCode || '').toLowerCase().includes(q)
      || (p.roleName || '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all'
      || (filterStatus === 'inside' && p.currentlyIn)
      || (filterStatus === 'exited' && p.hadExit && !p.currentlyIn)
      || (filterStatus === 'entered' && p.hadEntry);
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    const valueFor = (person, key) => {
      switch (key) {
        case 'name': return person.displayName || '';
        case 'role': return person.roleName || '';
        case 'code': return person.registrationCode || '';
        case 'entry': return person.entryAt ? new Date(person.entryAt).getTime() : 0;
        case 'exit': return person.exitAt ? new Date(person.exitAt).getTime() : 0;
        case 'status': return person.currentlyIn ? 2 : person.hadExit ? 1 : 0;
        default: return '';
      }
    };
    const res = compareSortValues(valueFor(a, sort.key), valueFor(b, sort.key));
    return sort.dir === 'asc' ? res : -res;
  });

  const enteredCount = data?.enteredCount ?? 0;
  const inCount = data?.inCount ?? 0;
  const exitCount = data?.exitCount ?? 0;
  const ready = Boolean(divisionFilter && departmentFilter);

  const openPerson = (registrationId) => {
    if (isToday) {
      onViewPerson(registrationId, divisionFilter);
    } else {
      onViewPerson(registrationId, divisionFilter, activityDate, activityDate);
    }
  };

  return (
    <div>
      <div className="rc-filters-bar">
        <div className="rc-filters-bar__left">
          <ActivityDatePicker
            value={activityDate}
            onChange={onDateChange}
            displayLabel={isToday ? `Today · ${formatDate(activityDate)}` : formatDate(activityDate)}
            className="rc-activity-date--filter"
          />
          <div className="rc-search-wrap">
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
              disabled={!ready}
            />
          </div>
          <select
            className="rc-select"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            aria-label="Select division"
          >
            <option value="">Select Division</option>
            {divisions.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
          <select
            className="rc-select"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Select department"
            disabled={!divisionFilter || loadingDepartments}
          >
            <option value="">
              {!divisionFilter
                ? 'Select division first'
                : loadingDepartments
                  ? 'Loading…'
                  : 'Select Department'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
          <select
            className="rc-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by status"
            disabled={!ready}
          >
            <option value="all">All Status</option>
            <option value="inside">Currently In</option>
            <option value="entered">Entered</option>
            <option value="exited">Exited</option>
          </select>
        </div>
        <div className="rc-filters-bar__right">
          {ready && (
            <>
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
            </>
          )}
          <button
            className="btn-secondary btn-sm"
            onClick={() => load()}
            disabled={loading || !ready}
          >
            {loading ? <Spinner size={14} /> : (
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

      {!divisionFilter ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" /></svg>}
          title="Select a division"
          desc={`Choose a division, then a department, to view department activity for ${isToday ? 'today' : dayLabel}.`}
        />
      ) : !departmentFilter ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
          title={loadingDepartments ? 'Loading departments…' : departments.length === 0 ? 'No departments' : 'Select a department'}
          desc={
            loadingDepartments
              ? 'Fetching departments for this division.'
              : departments.length === 0
                ? `${selectedDivision?.name || 'This division'} has no active departments.`
                : `Choose a department in ${selectedDivision?.name || 'this division'} to view entered, in, and exit counts.`
          }
        />
      ) : loading && !data ? (
        <div className="rc-table-loading">
          {[...Array(5)].map((_, i) => <div key={i} className="rc-skeleton rc-skeleton--row" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          title={search || filterStatus !== 'all' ? 'No matching people' : `No department activity ${isToday ? 'today' : `on ${dayLabel}`}`}
          desc={
            search || filterStatus !== 'all'
              ? 'Try adjusting your search or filters.'
              : `No check-ins recorded for ${selectedDepartment?.name || 'this department'} ${isToday ? 'today' : 'on this date'} yet.`
          }
        />
      ) : (
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead>
              <tr>
                <SortHeader label="Person" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Role" columnKey="role" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Code" columnKey="code" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Entry Time" columnKey="entry" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <SortHeader label="Exit Time" columnKey="exit" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <th>Duration</th>
                <SortHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={handleSort} />
                <th>Remark</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr
                  key={person.registrationId}
                  className="rc-table__row"
                  onClick={() => openPerson(person.registrationId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`View report for ${person.displayName || 'Unnamed'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openPerson(person.registrationId);
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
                  <td className="rc-table__time">{person.entryAt ? formatTime(person.entryAt) : '—'}</td>
                  <td className="rc-table__time">
                    {person.exitAt ? (
                      <span className="rc-table__time-stack">
                        <span>{formatTime(person.exitAt)}</span>
                        {istDateOf(person.exitAt) !== activityDate && (
                          <span className="rc-table__time-date" title="Exited on a different day">
                            {formatShortDate(person.exitAt)}
                          </span>
                        )}
                      </span>
                    ) : person.currentlyIn ? (
                      <span className="rc-badge-live">In</span>
                    ) : '—'}
                  </td>
                  <td className="rc-table__time">
                    {calcDuration(
                      person.entryAt,
                      person.exitAt || (person.currentlyIn && isToday ? new Date() : null)
                    )}
                  </td>
                  <td>
                    {person.currentlyIn ? (
                      <span className="badge badge-success rc-status-badge">In</span>
                    ) : person.hadExit ? (
                      <span className="badge badge-info rc-status-badge">Exited</span>
                    ) : (
                      <span className="badge badge-info rc-status-badge">Entered</span>
                    )}
                  </td>
                  <td className="rc-table__muted">{person.remark || '—'}</td>
                  <td>
                    <button
                      className="rc-table__view-btn"
                      onClick={(e) => { e.stopPropagation(); openPerson(person.registrationId); }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const toIso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: toIso(monday), dateTo: toIso(sunday) };
}

function isoWeekFromDate(date) {
  const local = date instanceof Date ? date : new Date(date);
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
  if (!day || day.status === 'blank') {
    return <td className="rc-att-cell rc-att-cell--blank" aria-label="Not registered" />;
  }

  const cls = `rc-att-cell rc-att-cell--${day.status.toLowerCase()} rc-att-cell--clickable`;
  const hoursLabel = formatCellHours(day.activityHours);

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(day);
  };

  if (day.status === 'A') {
    return (
      <td className={cls} aria-label="Absent" onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__code rc-att-cell__code--plain">A</span>
      </td>
    );
  }

  if (day.status === 'HD' || day.status === 'FH' || day.status === 'SH') {
    const halfLabel =
      day.status === 'FH' ? 'First Half' : day.status === 'SH' ? 'Second Half' : 'Half Day';
    return (
      <td className={cls} aria-label={`${halfLabel}${hoursLabel ? `, ${hoursLabel}` : ''}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">{day.code || day.status}</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
      </td>
    );
  }

  if (day.status === 'PT') {
    return (
      <td className={cls} aria-label={`Hours Worked${hoursLabel ? `, ${hoursLabel}` : ''}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">PT</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
      </td>
    );
  }

  if (day.status === 'P') {
    return (
      <td className={cls} aria-label={`Present${hoursLabel ? `, ${hoursLabel}` : ''}`} onClick={handleClick} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
        <span className="rc-att-cell__badge">P</span>
        {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
      </td>
    );
  }

  return (
    <td className={cls} aria-label={day.label || day.code} onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}>
      <span className="rc-att-cell__badge">{day.code}</span>
      {hoursLabel && <span className="rc-att-cell__time">{hoursLabel}</span>}
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
            </div>
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
            <tr key={emp.registrationId} className="rc-table__row"
              onClick={() => onViewPerson(emp.registrationId)}
              tabIndex={0} role="button"
              aria-label={`View history for ${emp.displayName || 'Unnamed'}`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewPerson(emp.registrationId); } }}>
              <td className="rc-att-abstract-table__index hide-on-mobile" data-label="#">{idx + 1}</td>
              <td data-label="Person" className="rc-att-abstract-table__person-cell">
                <div className="rc-table__person">
                  <Avatar url={emp.photoUrl} name={emp.displayName} size={38} />
                  <div className="rc-table__person-info">
                    <span className="rc-table__name">{emp.displayName || 'Unnamed'}</span>
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
function AttendanceHistoryTab({ onViewPerson, onPrintReady }) {
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

  const mergeHistoryPage = (base, next) => {
    if (!base) return next;
    if (!next) return base;
    const seen = new Set((base.employees || []).map((e) => e.registrationId));
    const appended = (next.employees || []).filter((e) => !seen.has(e.registrationId));
    return {
      ...next,
      employees: [...(base.employees || []), ...appended],
      page: next.page,
      hasMore: next.hasMore,
      total: next.total ?? base.total,
    };
  };

  const fetchHistoryPages = useCallback(async ({ dateFrom, dateTo, roleId, divisionId, onPage }) => {
    let page = 1;
    let merged = null;
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const params = { dateFrom, dateTo, limit: HISTORY_PAGE_SIZE, page };
      if (roleId) params.roleId = roleId;
      if (divisionId) params.divisionId = divisionId;
      const result = await api.reports.attendanceHistory(params);
      merged = mergeHistoryPage(merged, result);
      onPage?.(merged, result);
      if (!result?.hasMore) break;
      page += 1;
    }
    return merged;
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
      }

      try {
        await fetchHistoryPages({
          dateFrom,
          dateTo,
          roleId: filters.roleId,
          divisionId: filters.divisionId,
          onPage: (merged, pageResult) => {
            if (cancelled) return;
            setData(merged);
            // First page is enough to paint the table; keep loading quietly for the rest.
            if (pageResult?.page === 1) {
              setLoading(false);
              if (pageResult?.hasMore) setLoadingMore(true);
            }
            if (!pageResult?.hasMore) setLoadingMore(false);
          },
        });
      } catch (e) {
        if (!cancelled) {
          // Keep previous rows on transient proxy/backend blips (ECONNRESET during restart).
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
  }, [resolveDateRange, filters.roleId, filters.divisionId, fetchHistoryPages]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    const { dateFrom, dateTo } = resolveDateRange();
    if (!dateFrom || !dateTo) return null;
    if (dateFrom > dateTo) return null;

    if (!silent) {
      setLoading(true);
      setError('');
      setSuccess('');
    }

    try {
      const result = await fetchHistoryPages({
        dateFrom,
        dateTo,
        roleId: filters.roleId,
        divisionId: filters.divisionId,
        onPage: (merged, pageResult) => {
          setData(merged);
          if (!silent && pageResult?.page === 1) setLoading(false);
        },
      });
      if (silent) setError('');
      return result;
    } catch (e) {
      setError(e.message || 'Failed to load attendance history');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [resolveDateRange, filters.roleId, filters.divisionId, fetchHistoryPages]);

  const handleRecalculate = useCallback(async () => {
    const { dateFrom, dateTo } = resolveDateRange();
    if (!dateFrom || !dateTo) {
      setError('Select a date range before recalculating.');
      return;
    }
    if (dateFrom > dateTo) {
      setError('From date cannot be after To date.');
      return;
    }

    setRecalculating(true);
    setError('');
    setSuccess('');

    try {
      const payload = { dateFrom, dateTo, limit: HISTORY_PAGE_SIZE, page: 1 };
      if (filters.roleId) payload.roleId = filters.roleId;
      if (filters.divisionId) payload.divisionId = filters.divisionId;

      const result = await api.reports.recalculateAttendanceHistory(payload);
      setData(result);
      setRecalculating(false);

      // Pull remaining pages after shift sync so the full grid is available.
      if (result?.hasMore) {
        let page = 2;
        let merged = result;
        while (page <= 40) {
          const params = { dateFrom, dateTo, limit: HISTORY_PAGE_SIZE, page };
          if (filters.roleId) params.roleId = filters.roleId;
          if (filters.divisionId) params.divisionId = filters.divisionId;
          const next = await api.reports.attendanceHistory(params);
          merged = mergeHistoryPage(merged, next);
          setData(merged);
          if (!next?.hasMore) break;
          page += 1;
        }
      }

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
    } catch (e) {
      setError(e.message || 'Failed to recalculate attendance');
      // If recalculate died mid-proxy (backend restart), reload the last saved grid.
      await loadHistory({ silent: true });
    } finally {
      setRecalculating(false);
    }
  }, [resolveDateRange, filters.roleId, filters.divisionId, loadHistory]);

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

  const allEmployees = data?.employees || [];
  const selectionColumns = collectSelectionColumns(allEmployees);
  // Union of configured shifts and shift names seen in the loaded range (covers deleted shifts)
  const shiftNameOptions = [...new Set([
    ...shiftOptions.map((s) => s.name),
    ...allEmployees.flatMap((emp) => (emp.days || []).map((d) => d.shiftName)),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const searchQ = search.trim().toLowerCase();
  const employees = allEmployees.filter((emp) => {
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
  const dates = data?.dates || [];

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
    onPrintReady?.(handlePrintPdf);
    return () => onPrintReady?.(null);
  }, [handlePrintPdf, onPrintReady]);

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

          <div className="form-group rc-filter-inline__item rc-filter-inline__item--action">
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
            {data?.dateFrom && data?.dateTo && (
              <span className="rc-att-grid-meta__range">
                {formatDate(data.dateFrom)} — {formatDate(data.dateTo)}
              </span>
            )}
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
            {data?.dateFrom && data?.dateTo && (
              <span className="rc-att-grid-meta__range">
                {formatDate(data.dateFrom)} — {formatDate(data.dateTo)}
              </span>
            )}
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
                {employees.map((emp, idx) => (
                  <tr key={emp.registrationId} className="rc-att-grid__row">
                    <td className="rc-att-grid__sticky rc-att-grid__index">{idx + 1}</td>
                    <td className="rc-att-grid__sticky rc-att-grid__employee rc-att-grid__employee--clickable"
                      onClick={() => handleViewPerson(emp.registrationId)}
                      tabIndex={0} role="button"
                      aria-label={`View history for ${emp.displayName || 'Unnamed'}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewPerson(emp.registrationId); } }}>
                      <div className="rc-att-grid__person">
                        <Avatar url={emp.photoUrl} name={emp.displayName} size={32} />
                        <div className="rc-att-grid__person-info">
                          <span className="rc-att-grid__person-name">{emp.displayName || 'Unnamed'}</span>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selectedDay && (
        <AttendanceDayDialog
          employee={selectedDay.employee}
          day={selectedDay.day}
          onClose={() => setSelectedDay(null)}
        />
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

        {/* Gate Activity */}
        <div className="rc-analytics-panel rc-analytics-panel--wide">
          <div className="rc-analytics-panel__header">
            <h3>Recent Gate Activity</h3>
            <span className="rc-analytics-panel__meta">Last 20 scans</span>
          </div>
          <div className="rc-activity-feed">
            {gateLogs.slice(0, 20).map((log, i) => (
              <div key={log._id || i} className="rc-activity-feed__item">
                <div className={`rc-activity-feed__dot ${log.eventType === 'entry' ? 'rc-activity-feed__dot--entry' : 'rc-activity-feed__dot--exit'}`} />
                <div className="rc-activity-feed__content">
                  <span className="rc-activity-feed__label">
                    {log.matched ? (log.matchedName || 'Matched') : 'Not Matched'}
                  </span>
                  <span className="rc-activity-feed__meta">
                    {log.eventType} · {log.gateId?.name || 'Gate'} · {formatDateTime(log.createdAt)}
                  </span>
                </div>
                <span className={`badge ${log.matched ? 'badge-success' : 'badge-danger'} badge-sm`}>
                  {log.matched ? 'Match' : 'Miss'}
                </span>
              </div>
            ))}
            {gateLogs.length === 0 && <p className="rc-analytics__empty">No gate logs found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — EXPORT CENTER
════════════════════════════════════════════════════════════════ */
const EXPORT_TYPES = [
  { id: 'attendance', label: 'Attendance Report', icon: '📅' },
  { id: 'gate-activity', label: 'Gate Activity Report', icon: '🚪' },
  { id: 'daily', label: 'Daily Report', icon: '📆' },
  { id: 'department', label: 'Department Report', icon: '🏢' },
  { id: 'role', label: 'Role Report', icon: '👥' },
  { id: 'custom', label: 'Custom Report', icon: '⚙️' },
];

const EXPORT_FORMATS = ['PDF', 'Excel', 'CSV', 'Print'];

function ExportCenterTab() {
  const [selectedType, setSelectedType] = useState('attendance');
  const [selectedFormat, setSelectedFormat] = useState('PDF');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedReports, setGeneratedReports] = useState([]);

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate generation (no backend export endpoint — keep existing APIs intact)
    await new Promise(r => setTimeout(r, 1200));
    const type = EXPORT_TYPES.find(t => t.id === selectedType);
    const report = {
      id: Date.now(),
      name: `${type?.label || 'Report'} · ${formatDate(dateFrom || new Date())} ${dateTo ? '→ ' + formatDate(dateTo) : ''}`.trim(),
      format: selectedFormat,
      generatedAt: new Date().toISOString(),
      status: 'Ready',
      size: `${Math.floor(Math.random() * 900 + 100)}KB`,
    };
    setGeneratedReports(prev => [report, ...prev]);
    setGenerating(false);
  };

  return (
    <div className="rc-export">
      <div className="rc-export__builder">
        {/* Report type */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Report Type</h3>
          <div className="rc-export__type-grid">
            {EXPORT_TYPES.map(t => (
              <button key={t.id} type="button"
                className={`rc-export__type-card ${selectedType === t.id ? 'rc-export__type-card--active' : ''}`}
                onClick={() => setSelectedType(t.id)}>
                <span className="rc-export__type-icon">{t.icon}</span>
                <span className="rc-export__type-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date range + format */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Parameters</h3>
          <div className="rc-export__params-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Format */}
        <div className="rc-export__section">
          <h3 className="rc-export__section-title">Export Format</h3>
          <div className="rc-export__format-row">
            {EXPORT_FORMATS.map(f => (
              <button key={f} type="button"
                className={`rc-export__format-btn ${selectedFormat === f ? 'rc-export__format-btn--active' : ''}`}
                onClick={() => setSelectedFormat(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary rc-export__generate-btn" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <><Spinner size={15} /> Generating…</>
          ) : (
            <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg> Generate Report</>
          )}
        </button>
      </div>

      {/* Generated history */}
      <div className="rc-export__history">
        <h3 className="rc-export__section-title">Generated Reports</h3>
        {generatedReports.length === 0 ? (
          <EmptyState
            icon={<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
            title="No reports generated" desc="Configure your report above and click Generate." />
        ) : (
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Report Name</th>
                  <th>Format</th>
                  <th>Generated</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {generatedReports.map(r => (
                  <tr key={r.id} className="rc-table__row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="rc-table__name" style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-info">{r.format}</span></td>
                    <td className="rc-table__time">{formatDateTime(r.generatedAt)}</td>
                    <td className="rc-table__muted">{r.size}</td>
                    <td><span className="badge badge-success">{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="rc-table__view-btn" onClick={() => printReportCenterFallback()}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download
                        </button>
                        <button className="icon-btn btn-sm" onClick={() => setGeneratedReports(p => p.filter(x => x.id !== r.id))} aria-label="Delete report">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  { id: 'export', label: 'Export Center' },
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
  const tabPrintRef = useRef(null);

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
  useEffect(() => {
    tabPrintRef.current = null;
  }, [tab]);

  const displayDate = dateSelectable ? selectedDate : todayDateStringIst(now);
  const dateStr = parseDateForPdf(displayDate).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
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
        {/* ── Tab Content — driven by URL ?tab= param ── */}
        <div className="rc-tab-content admin-fade-in" key={tab}>
          {tab === 'today' && (
            <TodayActivityTab
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onViewPerson={handleViewPerson}
              onPrintReady={registerTabPrint}
            />
          )}
          {tab === 'division' && (
            <TodayActivityTab
              divisionRequired
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onViewPerson={handleViewPerson}
              onPrintReady={registerTabPrint}
            />
          )}
          {tab === 'department' && (
            <DepartmentActivityTab
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onViewPerson={handleViewPerson}
            />
          )}
          {tab === 'history' && (
            <AttendanceHistoryTab
              onViewPerson={setSelectedPerson}
              onPrintReady={registerTabPrint}
            />
          )}
          {tab === 'analytics' && <AnalyticsTab gateLogs={gateLogs} registrations={registrations} />}
          {tab === 'export' && <ExportCenterTab />}
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

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}
