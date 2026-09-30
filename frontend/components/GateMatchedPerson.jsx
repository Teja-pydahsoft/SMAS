'use client';

import { Fragment, useState, useEffect } from 'react';
import { resolvePhotoUrl } from '@/lib/photoUrl';

export function formatVisitTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatVisitDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function calcElapsed(fromTime, toTime = null) {
  if (!fromTime) return '';
  const start = new Date(fromTime).getTime();
  const end = toTime ? new Date(toTime).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  const totalMins = Math.floor((end - start) / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function isJattuRegistration(registration) {
  const slug = String(registration?.roleId?.slug || '').toLowerCase();
  const name = String(registration?.roleId?.name || '').toLowerCase();
  return slug === 'jattu' || name === 'jattu' || name.includes('jattu');
}

/**
 * Normalise logs from result.todayLogs or synthesize from sessionState
 */
function buildTodayLogsSequence({ sessionState, activeDivision, activeDepartment, result, personPhotoUrl, hideDepartment }) {
  const divisionName = activeDivision?.divisionName || sessionState?.divisionName || null;
  const logs = [];
  const seenIds = new Set();

  // If the backend returned todayLogs, use them as primary source of truth
  const rawLogs = Array.isArray(result?.todayLogs) ? result.todayLogs : [];

  if (rawLogs.length > 0) {
    rawLogs.forEach((item, idx) => {
      // Exclude any denied logs
      if (item.accessGranted === false) return;

      const isDept = item.scanType === 'department';
      if (isDept && hideDepartment) return;

      const isEntry = (item.eventType || '').toLowerCase() === 'entry';
      const targetName = isDept
        ? (item.departmentName || 'Department')
        : (item.gateName || item.divisionName || divisionName || 'Division Gate');
      const actionLabel = isDept
        ? (isEntry ? 'Dept Check-in' : 'Dept Check-out')
        : (isEntry ? 'Gate Entry' : 'Gate Exit');
      const label = isDept
        ? (isEntry ? 'DEPT IN' : 'DEPT OUT')
        : (isEntry ? 'GATE IN' : 'GATE OUT');

      const logId = item.id || `backend-log-${item.at}-${idx}`;
      seenIds.add(logId);

      logs.push({
        id: logId,
        at: item.at,
        formattedTime: formatVisitTime(item.at),
        formattedDate: formatVisitDate(item.at),
        scanType: item.scanType,
        eventType: item.eventType,
        label,
        targetName,
        actionLabel,
        nameColorClass: isDept ? 'name-badge--dept' : 'name-badge--div',
        actionColorClass: isEntry ? 'action-tag--entry' : 'action-tag--exit',
        icon: isDept ? '🏬' : '🏢',
        location: targetName,
        divisionName: item.divisionName || divisionName,
        departmentName: item.departmentName,
        gateName: item.gateName,
        photoUrl: resolvePhotoUrl(item.photoUrl) || null,
        matchScore: item.matchScore,
        scannedByName: item.scannedByName || null,
        scannedByUsername: item.scannedByUsername || null,
        remark: item.remark || '',
        isLatest: false,
      });
    });
  } else {
    // Fallback: build from sessionState
    if (sessionState?.gateEntryAt) {
      const targetName = divisionName || 'Division Gate';
      logs.push({
        id: `gate-in-${sessionState.gateEntryAt}`,
        at: sessionState.gateEntryAt,
        formattedTime: formatVisitTime(sessionState.gateEntryAt),
        formattedDate: formatVisitDate(sessionState.gateEntryAt),
        scanType: 'gate',
        eventType: 'entry',
        label: 'GATE IN',
        targetName,
        actionLabel: 'Gate Entry',
        nameColorClass: 'name-badge--div',
        actionColorClass: 'action-tag--entry',
        icon: '🏢',
        location: targetName,
        divisionName,
        photoUrl: null,
        isLatest: false,
      });
    }

    if (!hideDepartment) {
      const visits = Array.isArray(sessionState?.departmentVisits) ? sessionState.departmentVisits : [];
      visits.forEach((visit, index) => {
        const targetName = visit.departmentName || 'Department';
        if (visit.entryAt) {
          logs.push({
            id: `dept-in-${visit.entryAt}-${index}`,
            at: visit.entryAt,
            formattedTime: formatVisitTime(visit.entryAt),
            formattedDate: formatVisitDate(visit.entryAt),
            scanType: 'department',
            eventType: 'entry',
            label: 'DEPT IN',
            targetName,
            actionLabel: 'Dept Check-in',
            nameColorClass: 'name-badge--dept',
            actionColorClass: 'action-tag--entry',
            icon: '🏬',
            location: targetName,
            departmentName: targetName,
            photoUrl: null,
            remark: visit.remark || '',
            isLatest: false,
          });
        }
        if (visit.exitAt) {
          logs.push({
            id: `dept-out-${visit.exitAt}-${index}`,
            at: visit.exitAt,
            formattedTime: formatVisitTime(visit.exitAt),
            formattedDate: formatVisitDate(visit.exitAt),
            scanType: 'department',
            eventType: 'exit',
            label: 'DEPT OUT',
            targetName,
            actionLabel: 'Dept Check-out',
            nameColorClass: 'name-badge--dept',
            actionColorClass: 'action-tag--exit',
            icon: '🏬',
            location: targetName,
            departmentName: targetName,
            photoUrl: null,
            remark: visit.remark || '',
            isLatest: false,
          });
        }
      });
    }

    if (sessionState?.gateExitAt) {
      const targetName = divisionName || 'Division Gate';
      logs.push({
        id: `gate-out-${sessionState.gateExitAt}`,
        at: sessionState.gateExitAt,
        formattedTime: formatVisitTime(sessionState.gateExitAt),
        formattedDate: formatVisitDate(sessionState.gateExitAt),
        scanType: 'gate',
        eventType: 'exit',
        label: 'GATE OUT',
        targetName,
        actionLabel: 'Gate Exit',
        nameColorClass: 'name-badge--div',
        actionColorClass: 'action-tag--exit',
        icon: '🏢',
        location: targetName,
        divisionName,
        photoUrl: null,
        isLatest: false,
      });
    }
  }

  // Ensure current scan log from result is incorporated ONLY IF GRANTED.
  // Denied scan attempts (e.g. cooldown blocked exit) must NOT be shown as completed movements.
  const isCurrentScanGranted = !result?.denied && result?.log?.accessGranted !== false && result?.accessGranted !== false;
  if (result?.log?.createdAt && isCurrentScanGranted) {
    const logTime = result.log.createdAt;
    const existingIndex = logs.findIndex((l) => new Date(l.at).getTime() === new Date(logTime).getTime());
    if (existingIndex === -1) {
      const isDept = result.log.scanType === 'department';
      if (!isDept || !hideDepartment) {
        const isEntry = result.log.eventType === 'entry';
        const targetName = isDept
          ? (result.log.departmentName || 'Department')
          : (result.log.divisionName || result.log.gateName || divisionName || 'Division Gate');
        const actionLabel = isDept
          ? (isEntry ? 'Dept Check-in' : 'Dept Check-out')
          : (isEntry ? 'Gate Entry' : 'Gate Exit');
        const nameColorClass = isDept ? 'name-badge--dept' : 'name-badge--div';
        const actionColorClass = isEntry ? 'action-tag--entry' : 'action-tag--exit';
        const icon = isDept ? '🏬' : '🏢';
        const label = isDept ? (isEntry ? 'DEPT IN' : 'DEPT OUT') : (isEntry ? 'GATE IN' : 'GATE OUT');

        const currentPhoto = resolvePhotoUrl(result.photoUrl || result.log.photoPath) || null;

        logs.push({
          id: `current-scan-${result.log._id || logTime}`,
          at: logTime,
          formattedTime: formatVisitTime(logTime),
          formattedDate: formatVisitDate(logTime),
          scanType: result.log.scanType,
          eventType: result.log.eventType,
          label,
          targetName,
          actionLabel,
          nameColorClass,
          actionColorClass,
          icon,
          location: targetName,
          divisionName: result.log.divisionName || divisionName,
          departmentName: result.log.departmentName,
          gateName: result.log.gateName,
          photoUrl: currentPhoto,
          matchScore: result.matchScore,
          scannedByName: result.log.scannedByName || null,
          remark: result.log.remark || '',
          isLatest: true,
        });
      }
    } else if (result.photoUrl && !logs[existingIndex].photoUrl) {
      logs[existingIndex].photoUrl = resolvePhotoUrl(result.photoUrl);
    }
  }

  // Sort chronologically
  logs.sort((a, b) => new Date(a.at) - new Date(b.at));

  // Mark latest log
  if (logs.length > 0) {
    logs.forEach((l) => { l.isLatest = false; });
    logs[logs.length - 1].isLatest = true;
  }

  // Fallback missing photoUrl to personPhotoUrl if no photo captured
  logs.forEach((l) => {
    if (!l.photoUrl && personPhotoUrl) {
      l.photoUrl = personPhotoUrl;
      l.isFallbackPhoto = true;
    }
  });

  return logs;
}

/**
 * Lightbox modal for full-size scan photo and detailed info
 */
function ScanDetailLightboxModal({ entry, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) return null;
  const isEntry = (entry.eventType || '').toLowerCase() === 'entry';
  const isDept = entry.scanType === 'department';
  const kind = isDept ? 'Department' : 'Gate';
  const action = entry.actionLabel || (isDept ? (isEntry ? 'Dept Check-in' : 'Dept Check-out') : (isEntry ? 'Gate Entry' : 'Gate Exit'));
  const at = entry.at;

  const detailRows = [];
  if (entry.targetName) detailRows.push({ label: isDept ? 'Department' : 'Gate / Division', value: entry.targetName });
  if (entry.divisionName) detailRows.push({ label: 'Division / Unit', value: entry.divisionName });
  if (entry.scannedByName || entry.scannedByUsername) {
    detailRows.push({ label: 'Scanned By', value: entry.scannedByName || entry.scannedByUsername });
  }
  if (entry.matchScore != null) {
    detailRows.push({ label: 'Face Match', value: `${Math.round(Number(entry.matchScore) * 100)}%` });
  }
  if (entry.remark?.trim()) {
    detailRows.push({ label: 'Remark', value: entry.remark.trim() });
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
          {entry.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.photoUrl} alt={action} className="rc-scan-lightbox__photo rc-scan-photo--lg" />
          ) : (
            <div className="rc-scan-photo rc-scan-photo--empty rc-scan-photo--lg">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          )}
        </div>
        <div className="rc-scan-lightbox__body">
          <div className="rc-scan-lightbox__badges">
            <span className={`badge ${isEntry ? 'badge-success' : 'badge-info'}`}>{action}</span>
            <span className="badge badge-secondary">{kind}</span>
            {entry.isLatest && (
              <span className="badge badge-primary">LATEST SCAN</span>
            )}
          </div>
          <div className="rc-scan-lightbox__datetime">
            <time className="rc-scan-lightbox__date-line" dateTime={at || undefined}>
              {entry.formattedDate || '—'}
            </time>
            <time className="rc-scan-lightbox__time-line" dateTime={at || undefined}>
              {entry.formattedTime || '—'}
            </time>
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

export default function GateMatchedPerson({
  registration,
  matchScore,
  sessionState,
  activeDepartment,
  activeDivision,
  hasGateEntry,
  hideDepartmentActivity = false,
  result,
}) {
  const [selectedLog, setSelectedLog] = useState(null);

  if (!registration) return null;

  const photoUrl = resolvePhotoUrl(registration.photoUrl || registration.photoPath);
  const hideDepartment = hideDepartmentActivity || isJattuRegistration(registration);

  const todayLogs = buildTodayLogsSequence({
    sessionState,
    activeDivision,
    activeDepartment,
    result,
    personPhotoUrl: photoUrl,
    hideDepartment,
  });

  // Calculate labour live status
  const isInsideDivision = Boolean(sessionState?.divisionInside);
  const currentDept = activeDepartment?.departmentName || sessionState?.currentDepartmentName || null;
  const isDeptActive = Boolean(currentDept && !hideDepartment);

  // Time elapsed inside division
  const divisionEntryTime = sessionState?.gateEntryAt;
  const divisionDuration = divisionEntryTime ? calcElapsed(divisionEntryTime, isInsideDivision ? null : sessionState?.gateExitAt) : '';

  // Time elapsed in active department
  let deptEntryTime = null;
  if (isDeptActive && Array.isArray(sessionState?.departmentVisits)) {
    const openVisit = sessionState.departmentVisits.find((v) => v.departmentName === currentDept && !v.exitAt);
    if (openVisit?.entryAt) deptEntryTime = openVisit.entryAt;
  }
  const deptDuration = deptEntryTime ? calcElapsed(deptEntryTime) : '';

  // Shift info
  const shiftName = sessionState?.shiftName || result?.shiftName || null;
  const totalHours = sessionState?.totalHours ?? result?.totalHours ?? null;

  return (
    <div className="gate-matched-person">
      {/* 1. PERSON PROFILE HEADER */}
      <div className="gate-matched-person__header">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="gate-matched-person__photo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.nextSibling) {
                e.currentTarget.nextSibling.style.display = 'flex';
              }
            }}
          />
        ) : null}
        <div
          className="gate-matched-person__photo gate-matched-person__photo--placeholder"
          style={{ display: photoUrl ? 'none' : 'flex' }}
        >
          No Photo
        </div>
        <div>
          <p className="gate-matched-person__name">{registration.displayName || 'Unnamed'}</p>
          <p className="gate-matched-person__role">{registration.roleId?.name || '—'}</p>
          {registration.registrationCode && (
            <p className="gate-matched-person__code">Code: {registration.registrationCode}</p>
          )}
          {typeof matchScore === 'number' && (
            <p className="gate-matched-person__score">Match: {(matchScore * 100).toFixed(1)}%</p>
          )}
        </div>
      </div>

      {/* 2. LABOUR CURRENT SESSION STATUS PILLS */}
      <div className="gate-matched-person__session-badges">
        {/* Division Inside / Outside */}
        <div className={`gate-session-badge ${isInsideDivision ? 'gate-session-badge--inside' : 'gate-session-badge--outside'}`}>
          <span className="gate-session-badge__icon">{isInsideDivision ? '●' : '○'}</span>
          <div className="gate-session-badge__content">
            <span className="gate-session-badge__label">DIVISION STATUS</span>
            <span className="gate-session-badge__val">
              {isInsideDivision ? 'INSIDE DIVISION' : 'OUTSIDE DIVISION'}
              {divisionDuration ? ` · ${divisionDuration}` : ''}
            </span>
            {divisionEntryTime && (
              <span className="gate-session-badge__sub">
                Gate In: {formatVisitTime(divisionEntryTime)}
                {sessionState?.gateExitAt ? ` · Gate Out: ${formatVisitTime(sessionState.gateExitAt)}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Department Status */}
        {!hideDepartment && (
          <div className={`gate-session-badge ${isDeptActive ? 'gate-session-badge--dept-active' : 'gate-session-badge--dept-none'}`}>
            <span className="gate-session-badge__icon">🏬</span>
            <div className="gate-session-badge__content">
              <span className="gate-session-badge__label">DEPARTMENT STATUS</span>
              <span className="gate-session-badge__val">
                {isDeptActive ? `CHECKED IN: ${currentDept}` : (isInsideDivision ? 'FREE / IN TRANSIT' : 'NONE')}
                {deptDuration ? ` · ${deptDuration}` : ''}
              </span>
              {deptEntryTime && (
                <span className="gate-session-badge__sub">Since: {formatVisitTime(deptEntryTime)}</span>
              )}
            </div>
          </div>
        )}

        {/* Shift Badge */}
        {shiftName && (
          <div className="gate-session-badge gate-session-badge--shift">
            <span className="gate-session-badge__icon">⏱</span>
            <div className="gate-session-badge__content">
              <span className="gate-session-badge__label">SHIFT</span>
              <span className="gate-session-badge__val">{shiftName}{totalHours != null ? ` (${totalHours}h)` : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. TODAY'S SESSION TIMELINE TRACK (Horizontal track matching Attendance History page) */}
      {todayLogs.length > 0 && (
        <div className="gate-today-timeline">
          <div className="gate-today-timeline__header">
            <span className="gate-today-timeline__title">
              TODAY&apos;S ACTIVITY FLOW ({todayLogs.length} {todayLogs.length === 1 ? 'LOG' : 'LOGS'})
            </span>
            {isInsideDivision ? (
              <span className="rc-day-track__status-hint" style={{ color: '#16a34a', fontWeight: 700 }}>
                ● Still inside division
              </span>
            ) : (
              <span className="rc-day-track__status-hint">Gate session complete</span>
            )}
          </div>

          <div className="rc-day-track">
            <div className="rc-day-track__flow">
              {todayLogs.map((logItem, idx) => (
                <Fragment key={logItem.id || idx}>
                  {idx > 0 && (
                    <div
                      className={`rc-day-track__seg ${logItem.eventType === 'exit' ? 'rc-day-track__seg--exit' : 'rc-day-track__seg--entry'}`}
                    />
                  )}
                  <div
                    className={`rc-day-track__node ${logItem.isLatest ? 'rc-day-track__node--latest' : 'rc-day-track__node--step'}`}
                    title={`${logItem.actionLabel} at ${logItem.targetName} (${logItem.formattedTime}) — Click to view photo`}
                    onClick={() => setSelectedLog(logItem)}
                    style={{ cursor: 'pointer' }}
                  >
                    {logItem.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logItem.photoUrl}
                        alt=""
                        className={`rc-day-track__photo-img ${logItem.isLatest ? 'rc-day-track__photo' : 'rc-day-track__step-photo'} ${logItem.eventType === 'entry' ? 'rc-day-track__photo-img--entry' : 'rc-day-track__photo-img--exit'}`}
                      />
                    ) : (
                      <div className="rc-day-track__photo-img rc-day-track__photo-img--placeholder">
                        {logItem.label}
                      </div>
                    )}
                    <span className={`rc-day-track__node-label ${logItem.isLatest ? 'rc-day-track__node-label--latest' : logItem.eventType === 'entry' ? 'rc-day-track__node-label--start' : 'rc-day-track__node-label--end'}`}>
                      {logItem.label}
                    </span>
                    <span className="rc-day-track__node-time">
                      {logItem.formattedTime}
                    </span>
                    <span
                      className="rc-day-track__location-name"
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginTop: '2px',
                        textAlign: 'center',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        maxWidth: '90px',
                      }}
                    >
                      {logItem.targetName}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. ALL TODAY'S LOGS & HIGHLIGHTS LIST (LATEST FIRST) */}
      {todayLogs.length > 0 && (
        <div className="gate-today-logs-list">
          <div className="gate-today-logs-list__title">ALL TODAY&apos;S LOGS & HIGHLIGHTS</div>
          <ul className="gate-today-logs-list__items">
            {[...todayLogs].reverse().map((logItem, idx) => (
              <li
                key={logItem.id || idx}
                className={`gate-today-log-item ${logItem.isLatest ? 'gate-today-log-item--latest' : ''}`}
                onClick={() => setSelectedLog(logItem)}
                style={{ cursor: 'pointer' }}
              >
                <div className="gate-today-log-item__left">
                  {logItem.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logItem.photoUrl}
                      alt=""
                      className={`gate-today-log-item__thumb ${logItem.eventType === 'entry' ? 'gate-today-log-item__thumb--entry' : 'gate-today-log-item__thumb--exit'}`}
                    />
                  ) : (
                    <div className="gate-today-log-item__thumb gate-today-log-item__thumb--placeholder">
                      {logItem.icon}
                    </div>
                  )}
                  <span className={`name-badge ${logItem.nameColorClass}`}>
                    <span className="name-badge__icon">{logItem.icon}</span>
                    <strong>{logItem.targetName}</strong>
                  </span>
                  <span className={`action-tag ${logItem.actionColorClass}`}>
                    {logItem.actionLabel}
                  </span>
                </div>
                <div className="gate-today-log-item__right">
                  <span className="gate-today-log-item__time">
                    <strong>{logItem.formattedTime}</strong>
                  </span>
                  {typeof logItem.matchScore === 'number' && (
                    <span className="badge badge-secondary" style={{ fontSize: '10px' }}>
                      {(logItem.matchScore * 100).toFixed(0)}%
                    </span>
                  )}
                  {logItem.isLatest && (
                    <span className="badge badge--primary" style={{ fontSize: '10px' }}>LATEST</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. FORM REGISTRATION DETAILS */}
      {(registration.formDetails || []).length > 0 && (
        <div className="gate-matched-person__details">
          {registration.formDetails.slice(0, 4).map((d) => (
            <div key={`${d.label}-${d.value}`} className="pass-meta-row">
              <span className="pass-meta-label">{d.label}</span>
              <span className="pass-meta-value">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* 6. LIGHTBOX MODAL FOR CLICKED PHOTO/LOG */}
      {selectedLog && (
        <ScanDetailLightboxModal
          entry={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
