'use client';

import { useState } from 'react';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'today', label: 'Today' },
  { id: 'history', label: 'History' },
];

function StatusBadge({ valid, expired, inactive }) {
  if (valid) {
    return <span className="badge badge-success pass-verify-status">Valid</span>;
  }
  if (expired) {
    return <span className="badge badge-warning pass-verify-status">Expired</span>;
  }
  if (inactive) {
    return <span className="badge badge-danger pass-verify-status">Inactive</span>;
  }
  return <span className="badge badge-info pass-verify-status">Unverified</span>;
}

function EntryRow({ entry, showActive, onPhotoClick }) {
  return (
    <div className="pass-verify-entry" style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'flex-start' }}>
      {entry.photoUrl && (
        <img 
          src={resolvePhotoUrl(entry.photoUrl)} 
          alt="Scan Photo" 
          className="pass-verify-entry__photo" 
          style={{ cursor: 'pointer' }}
          onClick={() => onPhotoClick(entry.photoUrl, entry.label)}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pass-verify-entry__header">
          <span className={`badge ${entry.scanType === 'department' ? 'badge-info' : 'badge-success'}`}>
            {entry.scanType === 'department' ? 'Department' : 'Gate'}
          </span>
          {showActive && entry.status === 'Active' && (
            <span className="badge badge-warning">Active</span>
          )}
          <span className="pass-verify-entry__time">
            {entry.at ? formatDateTime(entry.at) : entry.entryAt ? formatDateTime(entry.entryAt) : '—'}
          </span>
        </div>
        <p className="pass-verify-entry__label">{entry.label}</p>
        {entry.divisionName && (
          <p className="pass-verify-entry__meta">Division: {entry.divisionName}</p>
        )}
        {entry.departmentName && entry.scanType !== 'department' && (
          <p className="pass-verify-entry__meta">Department: {entry.departmentName}</p>
        )}
        {entry.entryAt && entry.exitAt && (
          <p className="pass-verify-entry__meta">
            {formatDateTime(entry.entryAt)} → {formatDateTime(entry.exitAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function DetailsTab({ details, valid, expired, inactive, sessionState, showPassFields = true }) {
  return (
    <div className="pass-verify-details">
      <div className="pass-verify-details__hero card">
        <div className="pass-verify-details__profile">
          {details.holderPhotoUrl ? (
            <img
              src={resolvePhotoUrl(details.holderPhotoUrl)}
              alt=""
              className="pass-verify-details__photo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextSibling) {
                  e.currentTarget.nextSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="pass-verify-details__photo pass-verify-details__photo--placeholder"
            style={{ display: details.holderPhotoUrl ? 'none' : 'flex' }}
          >
            No Photo
          </div>
          <div>
            <h2 className="pass-verify-details__name">{details.holderName || '—'}</h2>
            <p className="pass-verify-details__role">{details.roleName}</p>
            <p className="pass-verify-details__code">{details.registrationCode}</p>
            {showPassFields ? (
              <StatusBadge valid={valid} expired={expired} inactive={inactive} />
            ) : (
              <span className={`badge ${sessionState?.divisionInside ? 'badge-success' : 'badge-info'}`}>
                {sessionState?.divisionInside ? 'Inside division' : 'Outside division'}
              </span>
            )}
          </div>
        </div>

        <div className="pass-verify-details__meta-grid">
          {showPassFields && details.passCode && details.passType !== 'registration' && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Pass ID</span>
              <span className="pass-meta-value">{details.passCode}</span>
            </div>
          )}
          {showPassFields && details.passTitle && details.passType !== 'registration' && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Pass type</span>
              <span className="pass-meta-value">{details.passTitle || details.passType}</span>
            </div>
          )}
          {details.registeredAt && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Registered</span>
              <span className="pass-meta-value">{formatDateTime(details.registeredAt)}</span>
            </div>
          )}
          {typeof details.totalScans === 'number' && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Total scans</span>
              <span className="pass-meta-value">{details.totalScans}</span>
            </div>
          )}
          {details.lastScanAt && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Last scan</span>
              <span className="pass-meta-value">{formatDateTime(details.lastScanAt)}</span>
            </div>
          )}
          {(details.divisionsVisited || []).length > 0 && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Divisions visited</span>
              <span className="pass-meta-value">{details.divisionsVisited.join(', ')}</span>
            </div>
          )}
          {details.validDate && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Valid date</span>
              <span className="pass-meta-value">{details.validDate}</span>
            </div>
          )}
          {details.shiftName && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Shift</span>
              <span className="pass-meta-value" style={{ fontWeight: 600 }}>
                {details.shiftName}
                {details.totalHours != null || sessionState?.totalHours != null
                  ? ` · ${details.totalHours ?? sessionState.totalHours}h`
                  : ''}
              </span>
            </div>
          )}
          {!details.shiftName && (details.totalHours != null || sessionState?.totalHours != null) && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Working Hours</span>
              <span className="pass-meta-value" style={{ fontWeight: 600 }}>
                {details.totalHours ?? sessionState.totalHours}h
              </span>
            </div>
          )}
          {/* Day pass: show In-Time / Out-Time instead of division inside/outside */}
          {details.passType === 'day_pass' && sessionState?.gateEntryAt && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">In Time</span>
              <span className="pass-meta-value pass-meta-value--in">
                {formatDateTime(sessionState.gateEntryAt)}
              </span>
            </div>
          )}
          {details.passType === 'day_pass' && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Out Time</span>
              <span className="pass-meta-value">
                {sessionState?.gateExitAt ? (
                  <span className="pass-meta-value--out">{formatDateTime(sessionState.gateExitAt)}</span>
                ) : details.validUntil ? (
                  <span className="pass-meta-value--expected">
                    Expected by {formatDateTime(details.validUntil)}
                  </span>
                ) : '—'}
              </span>
            </div>
          )}
          {/* Non-day pass: show issued time */}
          {details.passType !== 'day_pass' && details.issuedAt && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Issued</span>
              <span className="pass-meta-value">{formatDateTime(details.issuedAt)}</span>
            </div>
          )}
          {/* Current department (still useful to show on verify page) */}
          {sessionState?.currentDepartmentName && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Active dept</span>
              <span className="pass-meta-value">{sessionState.currentDepartmentName}</span>
            </div>
          )}
        </div>
      </div>

      {(details.details || []).length > 0 && (
        <div className="card pass-verify-details__fields">
          <h3 className="section-title">Registration details</h3>
          {details.details.map((d) => (
            <div key={`${d.label}-${d.value}`} className="pass-meta-row">
              <span className="pass-meta-label">{d.label}</span>
              <span className="pass-meta-value">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodayActiveTab({ todayActive, todayEntries, sessionState, shiftName, totalHours, onPhotoClick }) {
  // Merge and sort all today's entries by time for the timeline
  const allEntries = [...todayEntries].sort((a, b) => {
    const ta = new Date(a.at || a.entryAt || 0).getTime();
    const tb = new Date(b.at || b.entryAt || 0).getTime();
    return ta - tb;
  });

  return (
    <div className="pass-verify-today">
      {/* Summary strip */}
      <div className="today-summary-strip">
        <div className="today-summary-strip__item">
          <span className="today-summary-strip__label">In Time</span>
          <span className={`today-summary-strip__value ${sessionState?.gateEntryAt ? 'today-summary-strip__value--inside' : ''}`}>
            {sessionState?.gateEntryAt ? formatDateTime(sessionState.gateEntryAt) : '—'}
          </span>
        </div>
        <div className="today-summary-strip__item">
          <span className="today-summary-strip__label">Out Time</span>
          <span className="today-summary-strip__value">
            {sessionState?.gateExitAt
              ? formatDateTime(sessionState.gateExitAt)
              : sessionState?.gateEntryAt
                ? <span style={{ color: 'var(--warning)', fontSize: '0.8rem' }}>Not yet exited</span>
                : '—'}
          </span>
        </div>
        <div className="today-summary-strip__item">
          <span className="today-summary-strip__label">Department</span>
          <span className="today-summary-strip__value">
            {sessionState?.currentDepartmentName || 'None'}
          </span>
        </div>
        <div className="today-summary-strip__item">
          <span className="today-summary-strip__label">Active now</span>
          <span className="today-summary-strip__value">
            {todayActive.length > 0 ? `${todayActive.length} entry` : 'None'}
          </span>
        </div>
        {(shiftName || totalHours != null || sessionState?.totalHours != null) && (
          <div className="today-summary-strip__item">
            <span className="today-summary-strip__label">Shift</span>
            <span className="today-summary-strip__value" style={{ fontWeight: 600 }}>
              {shiftName || 'Assigned'}
              {(totalHours ?? sessionState?.totalHours) != null
                ? ` · ${totalHours ?? sessionState.totalHours}h`
                : ''}
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <h3 className="section-title" style={{ marginBottom: '1rem' }}>Today&apos;s Timeline</h3>

      {allEntries.length === 0 ? (
        <p className="pass-verify-empty">No gate or department scans recorded today.</p>
      ) : (
        <div className="today-timeline">
          {allEntries.map((entry, idx) => {
            const isGate = entry.scanType !== 'department';
            const isActive = entry.status === 'Active';
            const time = entry.at || entry.entryAt;
            const isLast = idx === allEntries.length - 1;

            return (
              <div key={entry.id} className={`today-timeline__item ${isLast ? 'today-timeline__item--last' : ''}`}>
                {/* Connector line */}
                <div className="today-timeline__connector">
                  <div className={`today-timeline__dot ${isGate ? 'today-timeline__dot--gate' : 'today-timeline__dot--dept'} ${isActive ? 'today-timeline__dot--active' : ''}`}>
                    {isGate ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18" />
                        <path d="M5 21V7l8-4v18" />
                        <path d="M19 21V11l-6-4" />
                      </svg>
                    )}
                  </div>
                  {!isLast && <div className="today-timeline__line" />}
                </div>

                {/* Content */}
                <div className={`today-timeline__card ${isActive ? 'today-timeline__card--active' : ''}`} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="today-timeline__card-header">
                      <div className="today-timeline__card-badges">
                        <span className={`badge ${isGate ? 'badge-success' : 'badge-info'}`}>
                          {isGate ? 'Gate' : 'Department'}
                        </span>
                        {isActive && (
                          <span className="badge badge-warning today-timeline__active-badge">
                            <span className="today-timeline__pulse" aria-hidden="true" />
                            Active
                          </span>
                        )}
                      </div>
                      <span className="today-timeline__time">
                        {time ? formatDateTime(time) : '—'}
                      </span>
                    </div>

                    <p className="today-timeline__label">{entry.label}</p>

                    <div className="today-timeline__meta">
                      {entry.divisionName && (
                        <span className="today-timeline__meta-item">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <path d="M3 14h7v7H3z" /><path d="M14 14h7v7h-7z" />
                          </svg>
                          {entry.divisionName}
                        </span>
                      )}
                      {entry.departmentName && entry.scanType !== 'department' && (
                        <span className="today-timeline__meta-item">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                          </svg>
                          {entry.departmentName}
                        </span>
                      )}
                      {entry.entryAt && entry.exitAt && (
                        <span className="today-timeline__meta-item today-timeline__meta-item--duration">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                          </svg>
                          {formatDateTime(entry.entryAt)} → {formatDateTime(entry.exitAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {entry.photoUrl && (
                    <img 
                      src={resolvePhotoUrl(entry.photoUrl)} 
                      alt="Scan Photo" 
                      className="today-timeline__photo" 
                      style={{ cursor: 'pointer' }}
                      onClick={() => onPhotoClick(entry.photoUrl, entry.label)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ entriesByDate, onPhotoClick }) {
  if (!entriesByDate.length) {
    return <p className="pass-verify-empty">No gate or department entry history found.</p>;
  }

  return (
    <div className="pass-verify-history">
      {entriesByDate.map((group) => (
        <div key={group.date} className="card pass-verify-history__group">
          <h3 className="pass-verify-history__date">{formatDate(group.date)}</h3>
          <div className="pass-verify-entry-list">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onPhotoClick={onPhotoClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PassVerifyView({
  data,
  title = 'Pass verification',
  subtitle = 'SAMS',
  showPassFields = true,
  hideHeader = false,
}) {
  const [tab, setTab] = useState('details');
  const [previewPhoto, setPreviewPhoto] = useState(null);

  if (!data) return null;

  const { details, todayActive, todayEntries, entriesByDate, sessionState, valid, expired, inactive } = data;

  return (
    <div className="pass-verify">
      {!hideHeader && (
        <div className="pass-verify-header">
          <div className="pass-verify-brand">
            <span className="pass-brand-icon pass-brand-icon--logo" aria-hidden="true">
              <img src="/icons/icon-192.png" alt="" />
            </span>
            <div>
              <p className="pass-brand-name">SAMS</p>
              <p className="pass-brand-sub">{subtitle || title}</p>
            </div>
          </div>
          <p className="pass-verify-header__title">{title}</p>
        </div>
      )}

      <div className="sub-nav pass-verify-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`sub-nav-item ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="pass-verify-panel" role="tabpanel">
        {tab === 'details' && (
          <DetailsTab
            details={details}
            valid={valid}
            expired={expired}
            inactive={inactive}
            sessionState={sessionState}
            showPassFields={showPassFields}
          />
        )}
        {tab === 'today' && (
          <TodayActiveTab
            todayActive={todayActive}
            todayEntries={todayEntries}
            sessionState={sessionState}
            shiftName={details?.shiftName || null}
            totalHours={details?.totalHours ?? null}
            onPhotoClick={(url, label) => setPreviewPhoto({ isImage: true, url, label: label || 'Scan Photo', originalName: 'Device Capture' })}
          />
        )}
        {tab === 'history' && (
          <HistoryTab 
            entriesByDate={entriesByDate} 
            onPhotoClick={(url, label) => setPreviewPhoto({ isImage: true, url, label: label || 'Scan Photo', originalName: 'Device Capture' })}
          />
        )}
      </div>

      {previewPhoto && (
        <div 
          className="pass-modal-overlay" 
          onClick={() => setPreviewPhoto(null)} 
          style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <img 
              src={resolvePhotoUrl(previewPhoto.url)} 
              alt={previewPhoto.label} 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px', display: 'block', border: '2px solid rgba(255,255,255,0.1)' }} 
            />
            <button 
              type="button" 
              onClick={() => setPreviewPhoto(null)}
              title="Close"
              style={{ 
                position: 'absolute', top: '12px', right: '12px', 
                background: 'rgba(255, 255, 255, 0.9)', color: '#000', borderRadius: '50%', 
                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                fontSize: '24px', lineHeight: 1, paddingBottom: '2px'
              }}
            >
              &times;
            </button>
            <p style={{ color: '#fff', marginTop: '12px', textAlign: 'center', fontWeight: '500', fontSize: '15px' }}>
              {previewPhoto.label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
