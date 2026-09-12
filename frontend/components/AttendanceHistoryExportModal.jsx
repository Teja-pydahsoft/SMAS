'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api/client';
import { downloadAttendanceHistoryExcel } from '@/lib/attendanceHistoryExport';

const FALLBACK_LABOUR_TYPES = [
  'Weekly Female',
  'Weekly Male',
  'Daily Female',
  'Daily Male',
  'Monthly Staff',
  'Monthly Operator',
];

function getQuickDates(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const toYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (preset === 'this_month') {
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    return { dateFrom: toYMD(from), dateTo: toYMD(to) };
  }
  if (preset === 'last_month') {
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    return { dateFrom: toYMD(from), dateTo: toYMD(to) };
  }
  if (preset === 'this_week') {
    const day = now.getDay() || 7; // Sunday is 7
    const from = new Date(now);
    from.setDate(now.getDate() - day + 1);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { dateFrom: toYMD(from), dateTo: toYMD(to) };
  }
  if (preset === 'last_week') {
    const day = now.getDay() || 7;
    const from = new Date(now);
    from.setDate(now.getDate() - day - 6);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { dateFrom: toYMD(from), dateTo: toYMD(to) };
  }
  if (preset === 'last_30') {
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    return { dateFrom: toYMD(from), dateTo: toYMD(now) };
  }
  return { dateFrom: '', dateTo: '' };
}

export default function AttendanceHistoryExportModal({
  isOpen,
  onClose,
  initialFilters = {},
  roles = [],
  divisions = [],
  labourTypeOptions = [],
  user = null,
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(() => initialFilters.roleId || '');
  const [dateFrom, setDateFrom] = useState(() => {
    if (initialFilters.dateFrom) return initialFilters.dateFrom;
    return getQuickDates('this_month').dateFrom;
  });
  const [dateTo, setDateTo] = useState(() => {
    if (initialFilters.dateTo) return initialFilters.dateTo;
    return getQuickDates('this_month').dateTo;
  });
  const [selectedLabourType, setSelectedLabourType] = useState(() => initialFilters.labourType || 'all');
  const [selectedDivisionIds, setSelectedDivisionIds] = useState(() => {
    if (Array.isArray(initialFilters.divisionIds) && initialFilters.divisionIds.length > 0) {
      return initialFilters.divisionIds;
    }
    return divisions.map((d) => d._id || d.id);
  });
  const [divisionSearch, setDivisionSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Lock scroll when open
  useEffect(() => {
    setMounted(true);
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Sync initial filters ONLY when modal transitions from closed to open
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setError('');
      setSuccess('');
      setSelectedRoleId(initialFilters.roleId || '');
      setSelectedLabourType(initialFilters.labourType || 'all');

      if (initialFilters.dateFrom && initialFilters.dateTo) {
        setDateFrom(initialFilters.dateFrom);
        setDateTo(initialFilters.dateTo);
      } else {
        const { dateFrom: defFrom, dateTo: defTo } = getQuickDates('this_month');
        setDateFrom(defFrom);
        setDateTo(defTo);
      }

      if (Array.isArray(initialFilters.divisionIds) && initialFilters.divisionIds.length > 0) {
        setSelectedDivisionIds(initialFilters.divisionIds);
      } else {
        setSelectedDivisionIds(divisions.map((d) => d._id || d.id));
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]); // Only depends on isOpen, never resets while modal is open

  // Combined Labour Types list
  const availableLabourTypes = useMemo(() => {
    const set = new Set([...(labourTypeOptions || []), ...FALLBACK_LABOUR_TYPES]);
    return Array.from(set).filter(Boolean);
  }, [labourTypeOptions]);

  // Filtered divisions
  const filteredDivisions = useMemo(() => {
    if (!divisionSearch.trim()) return divisions;
    const q = divisionSearch.trim().toLowerCase();
    return divisions.filter(
      (d) =>
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.code && d.code.toLowerCase().includes(q))
    );
  }, [divisions, divisionSearch]);

  const allDivisionsSelected =
    divisions.length > 0 && selectedDivisionIds.length === divisions.length;

  const handleSelectAllDivisions = () => {
    setSelectedDivisionIds(divisions.map((d) => d._id || d.id));
  };

  const handleClearAllDivisions = () => {
    setSelectedDivisionIds([]);
  };

  const handleToggleDivision = (id) => {
    setSelectedDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyPreset = (preset) => {
    const { dateFrom: f, dateTo: t } = getQuickDates(preset);
    if (f && t) {
      setDateFrom(f);
      setDateTo(t);
    }
  };

  const handleExport = async (e) => {
    e?.preventDefault();
    setError('');
    setSuccess('');

    if (!dateFrom || !dateTo) {
      setError('Please select both From and To dates.');
      return;
    }
    if (dateFrom > dateTo) {
      setError('From Date cannot be later than To Date.');
      return;
    }

    setExporting(true);
    try {
      const params = {
        dateFrom,
        dateTo,
        isExport: 'true',
        limit: 10000,
      };

      if (selectedRoleId) {
        params.roleId = selectedRoleId;
      }

      if (selectedDivisionIds.length > 0) {
        params.divisionIds = selectedDivisionIds.join(',');
        params.divisionId = selectedDivisionIds.join(',');
      }

      // Merge selectionFilters
      const combinedSelections = { ...(initialFilters.selectionFilters || {}) };
      if (selectedLabourType && selectedLabourType !== 'all') {
        combinedSelections['Labour Type'] = selectedLabourType;
      } else {
        delete combinedSelections['Labour Type'];
      }
      if (Object.keys(combinedSelections).length > 0) {
        params.selectionFilters = JSON.stringify(combinedSelections);
      }

      if (initialFilters.payFrequency) {
        params.payFrequency = initialFilters.payFrequency;
      }

      if (initialFilters.shiftName) {
        params.shiftName = initialFilters.shiftName;
      }

      if (initialFilters.search) {
        params.search = initialFilters.search;
      }

      const gridData = await api.reports.attendanceHistory(params);

      if (!gridData || !gridData.employees || gridData.employees.length === 0) {
        setError('No attendance records found matching the selected filters.');
        setExporting(false);
        return;
      }

      const roleObj = roles.find((r) => String(r._id || r.id) === String(selectedRoleId));
      const roleName = roleObj ? roleObj.name : 'All Roles';

      const divNames = divisions
        .filter((d) => selectedDivisionIds.includes(d._id || d.id))
        .map((d) => d.name);

      await downloadAttendanceHistoryExcel(gridData, {
        roleName,
        dateFrom,
        dateTo,
        labourType: selectedLabourType === 'all' ? 'All' : selectedLabourType,
        divisionNames: divNames,
        generatedBy: user?.name || user?.username || 'Administrator',
      });

      setSuccess(`Exported ${gridData.employees.length} employee records successfully.`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Export Excel failed:', err);
      setError(err.message || 'Failed to generate attendance Excel report.');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="pass-modal-overlay reports-modal-overlay"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="reports-slide-modal"
        style={{
          width: 'min(640px, 94vw)',
          height: 'auto',
          maxHeight: '90vh',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'scaleUpModal 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="reports-slide-modal__header"
          style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--surface-base, #ffffff)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
          }}
        >
          <div className="reports-slide-modal__title-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              className="reports-slide-modal__icon"
              style={{
                background: 'linear-gradient(135deg, #10B981, #059669)',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M8 13h8" />
                <path d="M8 17h8" />
                <path d="M10 9H8" />
              </svg>
            </span>
            <div>
              <h3 className="reports-slide-modal__title" style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
                Download Attendance Excel
              </h3>
              <p className="reports-slide-modal__sub" style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                Configure role, date range, labour type, and unit filters
              </p>
            </div>
          </div>
          <button
            type="button"
            className="reports-slide-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={exporting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          className="reports-slide-modal__body"
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          {/* Row 1: Role & Labour Type */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Role
              </label>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={exporting}
                style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', padding: '0 10px', fontSize: '0.875rem', background: 'var(--surface-base, #fff)' }}
              >
                <option value="">All Roles</option>
                {roles.map((r) => (
                  <option key={r._id || r.id} value={r._id || r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Labour Type
              </label>
              <select
                value={selectedLabourType}
                onChange={(e) => setSelectedLabourType(e.target.value)}
                disabled={exporting}
                style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', padding: '0 10px', fontSize: '0.875rem', background: 'var(--surface-base, #fff)' }}
              >
                <option value="all">All Labour Types</option>
                {availableLabourTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Date Range & Quick Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Date Range
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={() => handleApplyPreset('this_month')}
                  disabled={exporting}
                >
                  This Month
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={() => handleApplyPreset('last_month')}
                  disabled={exporting}
                >
                  Last Month
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={() => handleApplyPreset('this_week')}
                  disabled={exporting}
                >
                  This Week
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={() => handleApplyPreset('last_30')}
                  disabled={exporting}
                >
                  Last 30 Days
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginBottom: '4px', display: 'block' }}>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={exporting}
                  style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', padding: '0 10px', fontSize: '0.875rem' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginBottom: '4px', display: 'block' }}>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={exporting}
                  style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', padding: '0 10px', fontSize: '0.875rem' }}
                />
              </div>
            </div>
          </div>

          {/* Row 3: Multi-Unit Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Units / Divisions
                </label>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: selectedDivisionIds.length === 0 ? '#FEE2E2' : '#EFF6FF',
                    color: selectedDivisionIds.length === 0 ? '#991B1B' : '#1D4ED8',
                  }}
                >
                  {selectedDivisionIds.length === 0
                    ? 'No Units Selected'
                    : allDivisionsSelected
                    ? 'All Units Selected'
                    : `${selectedDivisionIds.length} of ${divisions.length} Selected`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={handleSelectAllDivisions}
                  disabled={exporting || allDivisionsSelected}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                  onClick={handleClearAllDivisions}
                  disabled={exporting || selectedDivisionIds.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>

            {divisions.length > 5 && (
              <input
                type="search"
                placeholder="Filter units…"
                value={divisionSearch}
                onChange={(e) => setDivisionSearch(e.target.value)}
                disabled={exporting}
                style={{
                  width: '100%',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  padding: '0 8px',
                  fontSize: '0.8rem',
                }}
              />
            )}

            <div
              style={{
                maxHeight: '140px',
                overflowY: 'auto',
                border: '1px solid var(--border-color, #cbd5e1)',
                borderRadius: '8px',
                padding: '8px',
                background: 'var(--surface-inset, #f8fafc)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '6px',
              }}
            >
              {divisions.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                  No units found in system.
                </div>
              ) : filteredDivisions.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                  No matching units.
                </div>
              ) : (
                filteredDivisions.map((div) => {
                  const divId = div._id || div.id;
                  const isChecked = selectedDivisionIds.includes(divId);
                  return (
                    <label
                      key={divId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: isChecked ? 'var(--surface-base, #ffffff)' : 'transparent',
                        border: `1px solid ${isChecked ? '#93C5FD' : 'transparent'}`,
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: '0.825rem',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDivision(divId)}
                        disabled={exporting}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: isChecked ? 600 : 400, color: 'var(--text-primary)' }}>
                        {div.name}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="reports-slide-modal__footer"
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--surface-base, #ffffff)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={exporting}
            style={{ minWidth: '80px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleExport}
            disabled={exporting || !dateFrom || !dateTo || selectedDivisionIds.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#10B981',
              borderColor: '#059669',
              minWidth: '160px',
              justifyContent: 'center',
            }}
          >
            {exporting ? (
              <>
                <svg
                  className="animate-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <span>Generating Excel…</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Excel</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
