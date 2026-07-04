'use client';

import { useState } from 'react';
import { formatDate, formatDateTime } from '@/lib/formatDate';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'today', label: 'Today Active' },
  { id: 'history', label: 'Date-wise Entries' },
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

function EntryRow({ entry, showActive }) {
  return (
    <div className="pass-verify-entry">
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
  );
}

function DetailsTab({ details, valid, expired, inactive, sessionState, showPassFields = true }) {
  return (
    <div className="pass-verify-details">
      <div className="pass-verify-details__hero card">
        <div className="pass-verify-details__profile">
          {details.holderPhotoUrl ? (
            <img src={details.holderPhotoUrl} alt="" className="pass-verify-details__photo" />
          ) : (
            <div className="pass-verify-details__photo pass-verify-details__photo--placeholder">No Photo</div>
          )}
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
          {details.divisionName && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Division</span>
              <span className="pass-meta-value">{details.divisionName}</span>
            </div>
          )}
          {details.validDate && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Valid date</span>
              <span className="pass-meta-value">{details.validDate}</span>
            </div>
          )}
          {details.issuedAt && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Issued</span>
              <span className="pass-meta-value">{formatDateTime(details.issuedAt)}</span>
            </div>
          )}
          {sessionState && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Division status</span>
              <span className="pass-meta-value">
                {sessionState.divisionInside ? 'Inside' : 'Outside'}
              </span>
            </div>
          )}
          {sessionState?.currentDepartmentName && (
            <div className="pass-meta-row">
              <span className="pass-meta-label">Current department</span>
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

function TodayActiveTab({ todayActive, todayEntries, sessionState }) {
  return (
    <div className="pass-verify-today">
      <div className="card pass-verify-today__summary">
        <p>
          Division:{' '}
          <strong>{sessionState?.divisionInside ? 'Inside' : 'Outside'}</strong>
        </p>
        {sessionState?.gateEntryAt && (
          <p className="field-hint">
            Gate entry today: {formatDateTime(sessionState.gateEntryAt)}
          </p>
        )}
        {sessionState?.currentDepartmentName ? (
          <p>
            Active department: <strong>{sessionState.currentDepartmentName}</strong>
          </p>
        ) : (
          <p>Active department: <strong>None</strong></p>
        )}
      </div>

      <h3 className="section-title">Active entries today</h3>
      {todayActive.length === 0 ? (
        <p className="pass-verify-empty">No active gate or department entries right now.</p>
      ) : (
        <div className="pass-verify-entry-list">
          {todayActive.map((entry) => (
            <EntryRow key={entry.id} entry={entry} showActive />
          ))}
        </div>
      )}

      <h3 className="section-title" style={{ marginTop: '1.5rem' }}>All entries today</h3>
      {todayEntries.length === 0 ? (
        <p className="pass-verify-empty">No gate or department scans recorded today.</p>
      ) : (
        <div className="pass-verify-entry-list">
          {todayEntries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ entriesByDate }) {
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
              <EntryRow key={entry.id} entry={entry} />
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
}) {
  const [tab, setTab] = useState('details');

  if (!data) return null;

  const { details, todayActive, todayEntries, entriesByDate, sessionState, valid, expired, inactive } = data;

  return (
    <div className="pass-verify">
      <div className="pass-verify-header">
        <div className="pass-verify-brand">
          <span className="pass-brand-icon">S</span>
          <div>
            <p className="pass-brand-name">SAMS</p>
            <p className="pass-brand-sub">{subtitle || title}</p>
          </div>
        </div>
        <p className="pass-verify-header__title">{title}</p>
      </div>

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
          />
        )}
        {tab === 'history' && <HistoryTab entriesByDate={entriesByDate} />}
      </div>
    </div>
  );
}
