'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime, todayDateStringIst } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';
import LabourReportModal from '@/components/project-reports/LabourReportModal';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'history', label: 'Labour History' },
  { id: 'faces', label: 'Face Capture' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'export', label: 'Export Center' },
];

function Avatar({ url, name, size = 36 }) {
  const [err, setErr] = useState(false);
  const initial = (name || 'U').charAt(0).toUpperCase();
  if (url && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvePhotoUrl(url)}
        alt=""
        className="pr-avatar"
        style={{ width: size, height: size }}
        loading="lazy"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div
      className="pr-avatar pr-avatar--initials"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="pr-kpi">
      <div className="pr-kpi__label">{label}</div>
      <div className="pr-kpi__value">{value ?? '—'}</div>
    </div>
  );
}

function MiniBars({ data = [], valueKey = 'present', labelKey = 'date' }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="pr-bars">
      {data.slice(-14).map((d) => {
        const value = Number(d[valueKey]) || 0;
        const pct = Math.round((value / max) * 100);
        const label = String(d[labelKey] || '').slice(5);
        return (
          <div key={`${d[labelKey]}-${value}`} className="pr-bar" title={`${d[labelKey]}: ${value}`}>
            <div className="pr-bar__fill" style={{ height: `${pct}%` }} />
            <div className="pr-bar__label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function HBars({ data = [] }) {
  const max = Math.max(1, ...data.map((d) => Number(d.count) || 0));
  if (!data.length) return <div className="pr-empty">No data</div>;
  return (
    <div className="pr-hbars">
      {data.slice(0, 8).map((d) => (
        <div key={d.name} className="pr-hbar">
          <span title={d.name}>{d.name}</span>
          <div className="pr-hbar__track">
            <div className="pr-hbar__fill" style={{ width: `${Math.round((d.count / max) * 100)}%` }} />
          </div>
          <strong>{d.count}</strong>
        </div>
      ))}
    </div>
  );
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

function cell(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === 'object') return '';
  return value;
}

function fmtWhen(value) {
  if (!value) return '';
  try {
    return formatDateTime(value);
  } catch {
    return String(value);
  }
}

const ATTENDANCE_COLUMNS = [
  { label: 'Labour ID', value: (r) => r.registrationCode },
  { label: 'Labour Name', value: (r) => r.labourName },
  { label: 'Division', value: (r) => r.divisionName },
  { label: 'Department', value: (r) => r.departmentName },
  { label: 'Date', value: (r) => r.date },
  { label: 'Entry Time', value: (r) => fmtWhen(r.entryTime) },
  { label: 'Exit Time', value: (r) => fmtWhen(r.exitTime) },
  { label: 'Worked Hours', value: (r) => r.workedHours },
  { label: 'Attendance Status', value: (r) => r.attendanceStatus },
  { label: 'Gate Status', value: (r) => r.gateStatus },
];

const HISTORY_COLUMNS = [
  { label: 'Labour ID', value: (r) => r.registrationCode },
  { label: 'Labour Name', value: (r) => r.labourName },
  { label: 'Role', value: (r) => r.roleName },
  { label: 'Assigned Date', value: (r) => fmtWhen(r.assignedAt) },
  { label: 'Removed Date', value: (r) => fmtWhen(r.removedAt) },
  { label: 'Period From', value: (r) => r.assignmentPeriodFrom },
  { label: 'Period To', value: (r) => r.assignmentPeriodTo },
  { label: 'Assigned By', value: (r) => r.assignedBy },
  { label: 'Days Worked', value: (r) => r.daysWorked },
  { label: 'Attendance %', value: (r) => r.attendancePercentage },
  { label: 'Average Working Hours', value: (r) => r.averageWorkingHours },
  { label: 'Current Status', value: (r) => r.currentStatus },
];

const FACE_COLUMNS = [
  { label: 'Date', value: (r) => r.date },
  { label: 'Labour ID', value: (r) => r.labour?.registrationCode },
  { label: 'Labour Name', value: (r) => r.labour?.labourName },
  { label: 'Entry Time', value: (r) => fmtWhen(r.entryCapture?.at) },
  { label: 'Entry Gate', value: (r) => r.entryCapture?.gateName },
  { label: 'Entry Operator', value: (r) => r.entryCapture?.operator },
  { label: 'Entry Verified', value: (r) => (r.entryCapture ? (r.entryCapture.verified ? 'Yes' : 'No') : '') },
  { label: 'Entry Score', value: (r) => r.entryCapture?.matchScore },
  { label: 'Exit Time', value: (r) => fmtWhen(r.exitCapture?.at) },
  { label: 'Exit Gate', value: (r) => r.exitCapture?.gateName },
  { label: 'Exit Operator', value: (r) => r.exitCapture?.operator },
  { label: 'Exit Verified', value: (r) => (r.exitCapture ? (r.exitCapture.verified ? 'Yes' : 'No') : '') },
  { label: 'Exit Score', value: (r) => r.exitCapture?.matchScore },
];

function summaryRowsFromOverview(data = {}) {
  const project = data.project || {};
  const progress = data.progress || {};
  const summary = data.summary || {};
  const range = data.dateRange || {};
  return [
    ['Project Name', project.projectName],
    ['Project Status', project.statusLabel || project.status],
    ['Project Type', project.projectTypeLabel || project.projectType],
    ['Department', project.department?.name],
    ['Division', project.division?.name],
    ['Created By', project.createdBy],
    ['Created At', fmtWhen(project.createdAt)],
    ['Date From', range.dateFrom],
    ['Date To', range.dateTo],
    ['Required Days', progress.requiredDays ?? summary.requiredDays],
    ['Completed Days', progress.completedDays ?? summary.completedDays],
    ['Remaining Days', progress.remainingDays ?? summary.remainingDays],
    ['Completion %', progress.completionPct ?? summary.completionPct],
    ['Total Assigned Labour', summary.totalAssignedLabour],
    ["Today's Attendance", summary.todayAttendance],
    ['Currently Inside Gate', summary.currentlyInside],
    ['Exited Today', summary.exitedToday],
    ['Total Man Days', summary.totalManDays],
  ].map(([label, value]) => ({ label, value: cell(value) }));
}

function getExportTable(type, payload) {
  const data = payload?.data || {};

  if (type === 'attendance') {
    return { title: 'Attendance', columns: ATTENDANCE_COLUMNS, rows: data.rows || [] };
  }
  if (type === 'history' || type === 'labour') {
    return { title: 'Labour Assignments', columns: HISTORY_COLUMNS, rows: data.rows || [] };
  }
  if (type === 'faces') {
    return { title: 'Face Captures', columns: FACE_COLUMNS, rows: data.records || [] };
  }
  if (type === 'summary') {
    const rows = summaryRowsFromOverview(data);
    return {
      title: 'Project Summary',
      columns: [
        { label: 'Field', value: (r) => r.label },
        { label: 'Value', value: (r) => r.value },
      ],
      rows,
    };
  }
  if (type === 'complete') {
    return {
      title: 'Complete',
      sheets: [
        getExportTable('summary', { data: data.overview || {} }),
        getExportTable('attendance', { data: data.attendance || {} }),
        getExportTable('labour', { data: data.history || {} }),
        getExportTable('faces', { data: data.faces || {} }),
      ],
    };
  }

  return {
    title: 'Report',
    columns: [
      { label: 'Field', value: (r) => r.label },
      { label: 'Value', value: (r) => r.value },
    ],
    rows: [],
  };
}

function addSheetFromTable(workbook, table) {
  const ws = workbook.addWorksheet(String(table.title || 'Sheet').slice(0, 31));
  ws.addRow(table.columns.map((c) => c.label));
  ws.getRow(1).font = { bold: true };
  for (const row of table.rows || []) {
    ws.addRow(table.columns.map((c) => cell(typeof c.value === 'function' ? c.value(row) : row[c.key])));
  }
  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell({ includeEmpty: true }, (cellRef) => {
      const len = String(cellRef.value ?? '').length;
      if (len > max) max = Math.min(len + 2, 40);
    });
    col.width = max;
  });
  return ws;
}

export default function ProjectReportsPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Loading project reports…</p>}>
      <ProjectReportsContent />
    </Suspense>
  );
}

function ProjectReportsContent() {
  const { can, user } = useAuth();
  const canRead = can('projects', 'read');
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get('project') || '';

  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ labours: [], supervisors: [], gates: [] });

  const [projectId, setProjectId] = useState(projectFromQuery);
  const [dateFrom, setDateFrom] = useState(todayDateStringIst());
  const [dateTo, setDateTo] = useState(todayDateStringIst());
  const [departmentId, setDepartmentId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [labourId, setLabourId] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [gateId, setGateId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const [overview, setOverview] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [history, setHistory] = useState(null);
  const [faces, setFaces] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const [attSearch, setAttSearch] = useState('');
  const [attStatus, setAttStatus] = useState('');
  const [attPage, setAttPage] = useState(1);
  const [histSearch, setHistSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const queryBase = useMemo(
    () => ({
      projectId,
      dateFrom,
      dateTo,
      departmentId: departmentId || undefined,
      divisionId: divisionId || undefined,
      labourId: labourId || undefined,
      gateId: gateId || undefined,
      supervisorId: supervisorId || undefined,
    }),
    [projectId, dateFrom, dateTo, departmentId, divisionId, labourId, gateId, supervisorId]
  );

  useEffect(() => {
    if (!canRead) return;
    Promise.all([
      api.projectReports.projects().catch(() => []),
      api.departments.list({ isActive: 'true' }).catch(() => []),
      api.divisions.list({ isActive: 'true' }).catch(() => []),
    ]).then(([plist, deps, divs]) => {
      setProjects(plist);
      setDepartments(deps);
      setDivisions(divs);
      const fromQuery = projectFromQuery
        ? plist.find((p) => String(p.id || p._id) === String(projectFromQuery))
        : null;
      if (fromQuery) {
        setProjectId(String(fromQuery.id || fromQuery._id));
      } else if (!projectId && plist[0]?.id) {
        setProjectId(plist[0].id);
      }
    });
  }, [canRead, projectFromQuery]);

  useEffect(() => {
    if (!projectId) return;
    api.projectReports.filters({ projectId }).then(setFilterOptions).catch(() => {});
  }, [projectId]);

  const loadTab = useCallback(async () => {
    if (!projectId || !canRead) return;
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'overview') {
        setOverview(await api.projectReports.overview(queryBase));
      } else if (activeTab === 'attendance') {
        setAttendance(
          await api.projectReports.attendance({
            ...queryBase,
            search: attSearch || undefined,
            attendanceStatus: attStatus || undefined,
            page: attPage,
            limit: 25,
            date: dateTo,
          })
        );
      } else if (activeTab === 'history') {
        setHistory(
          await api.projectReports.history({
            ...queryBase,
            search: histSearch || undefined,
          })
        );
      } else if (activeTab === 'faces') {
        setFaces(await api.projectReports.faces(queryBase));
      } else if (activeTab === 'analytics') {
        setAnalytics(await api.projectReports.analytics(queryBase));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [
    projectId,
    canRead,
    activeTab,
    queryBase,
    attSearch,
    attStatus,
    attPage,
    dateTo,
    histSearch,
  ]);

  useEffect(() => {
    const t = setTimeout(loadTab, activeTab === 'attendance' || activeTab === 'history' ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadTab, activeTab]);

  const filteredProjects = useMemo(() => {
    if (!projectStatus) return projects;
    return projects.filter((p) => p.status === projectStatus);
  }, [projects, projectStatus]);

  function openLabour(assignmentId) {
    if (!assignmentId) return;
    setSelectedAssignmentId(assignmentId);
  }

  async function handleExport(type, format) {
    if (!projectId) return;
    setExporting(true);
    setError('');
    try {
      const payload = await api.projectReports.export({ ...queryBase, type });
      const stamp = todayDateStringIst();
      const name = 'project-' + type + '-' + stamp;
      const table = getExportTable(type, payload);

      if (format === 'json') {
        downloadBlob(name + '.json', JSON.stringify(payload, null, 2), 'application/json');
      } else if (format === 'csv') {
        if (type === 'complete' && table.sheets) {
          const parts = table.sheets.map((sheet) => {
            const csv = toCsv(sheet.rows || [], sheet.columns || []);
            return '## ' + sheet.title + '\n' + csv;
          });
          downloadBlob(name + '.csv', parts.join('\n\n'), 'text/csv;charset=utf-8');
        } else {
          downloadBlob(
            name + '.csv',
            toCsv(table.rows || [], table.columns || []),
            'text/csv;charset=utf-8'
          );
        }
      } else if (format === 'excel') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'SAMS';
        wb.created = new Date();
        if (type === 'complete' && table.sheets) {
          table.sheets.forEach((sheet) => addSheetFromTable(wb, sheet));
        } else {
          addSheetFromTable(wb, table);
        }
        const buffer = await wb.xlsx.writeBuffer();
        downloadBlob(
          name + '.xlsx',
          buffer,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      } else if (format === 'pdf') {
        const [{ jsPDF }, autoTableModule] = await Promise.all([
          import('jspdf'),
          import('jspdf-autotable'),
        ]);
        const autoTable = autoTableModule.default;
        const doc = new jsPDF({
          orientation: type === 'faces' || type === 'complete' ? 'landscape' : 'portrait',
        });
        doc.setFontSize(14);
        doc.text('Project Report — ' + (table.title || type), 14, 16);
        doc.setFontSize(10);
        doc.text('Generated ' + stamp, 14, 22);

        const sheets = type === 'complete' && table.sheets ? table.sheets : [table];
        let startY = 28;
        sheets.forEach((sheet, idx) => {
          if (idx > 0) {
            doc.addPage();
            startY = 16;
            doc.setFontSize(12);
            doc.text(sheet.title, 14, startY);
            startY += 6;
          } else if (sheets.length > 1) {
            doc.setFontSize(12);
            doc.text(sheet.title, 14, startY);
            startY += 6;
          }
          autoTable(doc, {
            startY,
            head: [sheet.columns.map((c) => c.label)],
            body: (sheet.rows || []).map((r) =>
              sheet.columns.map((c) =>
                String(cell(typeof c.value === 'function' ? c.value(r) : r[c.key]) ?? '')
              )
            ),
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [30, 64, 95] },
          });
        });
        doc.save(name + '.pdf');
      }
    } catch (e) {
      setError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (!canRead) {
    return (
      <PageShell title="Project Reports" description="Enterprise project reporting workspace">
        <p className="read-only-banner">You do not have access to project reports.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Project Reports"
      description="Enterprise reporting for project attendance, labour history, face captures, and analytics"
    >
      <div className="pr-page">
        <div className="pr-filters">
          <div className="form-group">
            <label htmlFor="pr-project">Project</label>
            <select
              id="pr-project"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setAttPage(1);
              }}
            >
              <option value="">Select project</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectName}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-from">Date From</label>
            <input id="pr-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pr-to">Date To</label>
            <input id="pr-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pr-div">Division</label>
            <select id="pr-div" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">All divisions</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-dept">Department</label>
            <select id="pr-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-labour">Labour</label>
            <select id="pr-labour" value={labourId} onChange={(e) => setLabourId(e.target.value)}>
              <option value="">All labour</option>
              {(filterOptions.labours || []).map((l) => (
                <option key={l.labourId} value={l.labourId}>
                  {l.labourName}{l.registrationCode ? ` (${l.registrationCode})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-status">Project Status</label>
            <select id="pr-status" value={projectStatus} onChange={(e) => setProjectStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-gate">Gate</label>
            <select id="pr-gate" value={gateId} onChange={(e) => setGateId(e.target.value)}>
              <option value="">All gates</option>
              {(filterOptions.gates || []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-sup">Supervisor</label>
            <select id="pr-sup" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
              <option value="">All supervisors</option>
              {(filterOptions.supervisors || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="pr-filters__actions">
            <button type="button" className="btn-secondary" onClick={loadTab} disabled={!projectId || loading}>
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!projectId || exporting}
              onClick={() => handleExport('complete', 'excel')}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        {!projectId ? (
          <div className="empty-state card">
            <p>Select a project to open the reporting workspace.</p>
          </div>
        ) : (
          <div className="pr-layout">
            <div className="pr-main">
              {loading && !overview && !attendance && !history && !faces && !analytics ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div className="pr-skeleton" />
                  <div className="pr-skeleton" />
                  <div className="pr-skeleton" />
                </div>
              ) : null}

              {activeTab === 'overview' && overview && (
                <>
                  <div className="pr-summary-grid">
                    <Kpi label="Project Name" value={overview.project.projectName} />
                    <Kpi label="Status" value={overview.project.statusLabel} />
                    <Kpi label="Type" value={overview.project.projectTypeLabel} />
                    <Kpi label="Required Days" value={overview.summary.requiredDays} />
                    <Kpi label="Completed Days" value={overview.summary.completedDays} />
                    <Kpi label="Remaining Days" value={overview.summary.remainingDays} />
                    <Kpi label="Completion" value={`${overview.summary.completionPct}%`} />
                    <Kpi label="Assigned Labour" value={overview.summary.totalAssignedLabour} />
                    <Kpi label="Today's Attendance" value={overview.summary.todayAttendance} />
                    <Kpi label="Inside Gate" value={overview.summary.currentlyInside} />
                    <Kpi label="Exited Today" value={overview.summary.exitedToday} />
                    <Kpi label="Total Man Days" value={overview.summary.totalManDays} />
                  </div>

                  <div className="pr-progress-card">
                    <div className="pr-progress-card__title">Project Progress</div>
                    <div className="pr-progress-card__value">
                      {overview.progress.completedDays} / {overview.progress.requiredDays} Days Completed
                    </div>
                    <div className="pr-progress-track">
                      <div
                        className="pr-progress-fill"
                        style={{ width: `${overview.progress.completionPct}%` }}
                      />
                    </div>
                  </div>

                  <h3 className="pr-section-title">Recent Activity</h3>
                  <p className="pr-section-desc">Project creation, assignments, site photos, and labour sightings</p>
                  <div className="pr-timeline">
                    {(overview.timeline || []).length === 0 ? (
                      <div className="pr-empty">No activity yet.</div>
                    ) : (
                      overview.timeline.map((event) => (
                        <div key={event.id} className="pr-timeline-item">
                          <span className="pr-timeline-dot" />
                          <div className="pr-timeline-body">
                            <strong>{event.title}</strong>
                            <p>{event.description}</p>
                            <span>
                              {formatDateTime(event.at)}
                              {event.actor ? ` · ${event.actor}` : ''}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {activeTab === 'attendance' && (
                <>
                  <div className="pr-toolbar">
                    <input
                      type="search"
                      placeholder="Search labour..."
                      value={attSearch}
                      onChange={(e) => {
                        setAttSearch(e.target.value);
                        setAttPage(1);
                      }}
                    />
                    <select
                      value={attStatus}
                      onChange={(e) => {
                        setAttStatus(e.target.value);
                        setAttPage(1);
                      }}
                    >
                      <option value="">All attendance</option>
                      <option value="Present">Present</option>
                      <option value="Completed">Completed</option>
                      <option value="Incomplete">Incomplete</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>
                  {!attendance ? (
                    <div className="pr-empty">{loading ? 'Loading attendance...' : 'No data'}</div>
                  ) : attendance.rows.length === 0 ? (
                    <div className="pr-empty">No attendance rows for the selected filters.</div>
                  ) : (
                    <>
                      <div className="pr-table-wrap">
                        <table className="pr-table">
                          <thead>
                            <tr>
                              <th>Photo</th>
                              <th>Labour ID</th>
                              <th>Labour Name</th>
                              <th>Division</th>
                              <th>Department</th>
                              <th>Entry Time</th>
                              <th>Exit Time</th>
                              <th>Worked Hours</th>
                              <th>Attendance</th>
                              <th>Gate Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendance.rows.map((row) => (
                              <tr key={row.labourId} onClick={() => openLabour(row.assignmentId)}>
                                <td><Avatar url={row.photoUrl} name={row.labourName} /></td>
                                <td>{row.registrationCode || '—'}</td>
                                <td>{row.labourName}</td>
                                <td>{row.divisionName || '—'}</td>
                                <td>{row.departmentName || '—'}</td>
                                <td>{formatDateTime(row.entryTime)}</td>
                                <td>{formatDateTime(row.exitTime)}</td>
                                <td>{row.workedHours ?? '—'}</td>
                                <td>{row.attendanceStatus}</td>
                                <td>
                                  <span className={`badge ${row.gateStatus === 'Inside' ? 'badge-success' : 'badge-info'}`}>
                                    {row.gateStatus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="pr-pagination">
                        <span>
                          Showing {(attPage - 1) * 25 + 1}–{Math.min(attPage * 25, attendance.total)} of {attendance.total}
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={attPage <= 1}
                            onClick={() => setAttPage((p) => p - 1)}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={attPage * 25 >= attendance.total}
                            onClick={() => setAttPage((p) => p + 1)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <>
                  <div className="pr-toolbar">
                    <input
                      type="search"
                      placeholder="Search labour history..."
                      value={histSearch}
                      onChange={(e) => setHistSearch(e.target.value)}
                    />
                  </div>
                  {!history ? (
                    <div className="pr-empty">{loading ? 'Loading history...' : 'No data'}</div>
                  ) : history.rows.length === 0 ? (
                    <div className="pr-empty">No assignment history found.</div>
                  ) : (
                    <div className="pr-table-wrap">
                      <table className="pr-table">
                        <thead>
                          <tr>
                            <th>Photo</th>
                            <th>Labour ID</th>
                            <th>Labour Name</th>
                            <th>Assigned</th>
                            <th>Period</th>
                            <th>Days Worked</th>
                            <th>Attendance %</th>
                            <th>Avg Hours</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.rows.map((row) => (
                            <tr key={`${row.assignmentId}-${row.labourId}`} onClick={() => openLabour(row.assignmentId)}>
                              <td><Avatar url={row.photoUrl} name={row.labourName} /></td>
                              <td>{row.registrationCode || '—'}</td>
                              <td>{row.labourName}</td>
                              <td>{formatDate(row.assignedAt)}</td>
                              <td>
                                {row.assignmentPeriodFrom || '—'}
                                {' → '}
                                {row.removedAt ? row.assignmentPeriodTo : 'Present'}
                              </td>
                              <td>{row.daysWorked}</td>
                              <td>{row.attendancePercentage}%</td>
                              <td>{row.averageWorkingHours}</td>
                              <td>{row.currentStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'faces' && (
                <>
                  <h3 className="pr-section-title">Face Capture Records</h3>
                  <p className="pr-section-desc">
                    Registered photo with entry/exit captures from gate transactions
                  </p>
                  {!faces ? (
                    <div className="pr-empty">{loading ? 'Loading face records...' : 'No data'}</div>
                  ) : faces.records.length === 0 ? (
                    <div className="pr-empty">No face capture records for this range.</div>
                  ) : (
                    <div className="pr-face-grid">
                      {faces.records.map((rec) => (
                        <article
                          key={rec.id}
                          className="pr-face-card"
                          onClick={() => setLightbox(rec)}
                        >
                          <div className="pr-face-card__shots">
                            {rec.registeredPhotoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolvePhotoUrl(rec.registeredPhotoUrl)} alt="Registered" loading="lazy" />
                            ) : (
                              <div className="pr-face-placeholder">Registered</div>
                            )}
                            {rec.entryCapture?.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolvePhotoUrl(rec.entryCapture.photoUrl)} alt="Entry" loading="lazy" />
                            ) : (
                              <div className="pr-face-placeholder">Entry</div>
                            )}
                            {rec.exitCapture?.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolvePhotoUrl(rec.exitCapture.photoUrl)} alt="Exit" loading="lazy" />
                            ) : (
                              <div className="pr-face-placeholder">Exit</div>
                            )}
                          </div>
                          <div className="pr-face-card__body">
                            <strong>{rec.labour?.labourName}</strong>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                              {formatDate(rec.date)} · {rec.labour?.registrationCode || '—'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              Entry {rec.entryCapture ? formatDateTime(rec.entryCapture.at) : '—'}
                              {' · '}
                              Exit {rec.exitCapture ? formatDateTime(rec.exitCapture.at) : '—'}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'analytics' && analytics && (
                <div className="pr-charts">
                  <div className="pr-chart-card">
                    <h4>Daily Attendance Trend</h4>
                    <MiniBars data={analytics.dailyAttendanceTrend} valueKey="present" />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Working Hours Trend</h4>
                    <MiniBars data={analytics.workingHoursTrend} valueKey="averageHours" />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Division Distribution</h4>
                    <HBars data={analytics.divisionDistribution} />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Department Distribution</h4>
                    <HBars data={analytics.departmentDistribution} />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Inside vs Outside</h4>
                    <HBars
                      data={[
                        { name: 'Inside', count: analytics.insideVsOutside.inside },
                        { name: 'Outside', count: analytics.insideVsOutside.outside },
                      ]}
                    />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Entry vs Exit</h4>
                    <HBars
                      data={[
                        { name: 'Entries', count: analytics.entryVsExit.entries },
                        { name: 'Exits', count: analytics.entryVsExit.exits },
                      ]}
                    />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Daily Face Capture Count</h4>
                    <MiniBars data={analytics.dailyFaceCaptureCount} valueKey="faces" />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Project Completion Trend</h4>
                    <MiniBars data={analytics.projectCompletionTrend} valueKey="pct" />
                  </div>
                  <div className="pr-chart-card">
                    <h4>Attendance Percentage</h4>
                    <div className="pr-progress-card__value">{analytics.attendancePercentage}%</div>
                    <div className="pr-progress-track">
                      <div className="pr-progress-fill" style={{ width: `${analytics.attendancePercentage}%` }} />
                    </div>
                  </div>
                  <div className="pr-chart-card">
                    <h4>Project Utilization</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {analytics.projectUtilization.manDays} man-days of{' '}
                      {analytics.projectUtilization.possibleManDays} possible ·{' '}
                      {analytics.projectUtilization.assigned} assigned labourers
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'analytics' && !analytics && (
                <div className="pr-empty">{loading ? 'Loading analytics...' : 'No analytics data'}</div>
              )}

              {activeTab === 'export' && (
                <>
                  <h3 className="pr-section-title">Export Center</h3>
                  <p className="pr-section-desc">Download project reports in Excel, PDF, or CSV</p>
                  <div className="pr-export-grid">
                    {[
                      { type: 'attendance', title: 'Attendance Report', desc: 'Daily attendance for assigned labour' },
                      { type: 'summary', title: 'Project Summary', desc: 'Overview KPIs and progress snapshot' },
                      { type: 'labour', title: 'Labour Assignment Report', desc: 'Assignment history and utilisation' },
                      { type: 'faces', title: 'Face Capture Report', desc: 'Entry/exit capture records' },
                      { type: 'complete', title: 'Complete Project Report', desc: 'Full package of all report sections' },
                    ].map((item) => (
                      <div key={item.type} className="pr-export-card">
                        <h4>{item.title}</h4>
                        <p>{item.desc}</p>
                        <div className="pr-export-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={exporting}
                            onClick={() => handleExport(item.type, 'excel')}
                          >
                            Excel
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={exporting}
                            onClick={() => handleExport(item.type, 'pdf')}
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={exporting}
                            onClick={() => handleExport(item.type, 'csv')}
                          >
                            CSV
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {exporting && <p className="pr-section-desc">Preparing export…</p>}
                </>
              )}
            </div>

            <aside className="pr-tabs" role="tablist" aria-label="Project report sections">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`pr-tab${activeTab === tab.id ? ' pr-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </aside>
          </div>
        )}
      </div>

      {selectedAssignmentId && (
        <LabourReportModal
          assignmentId={selectedAssignmentId}
          onClose={() => setSelectedAssignmentId(null)}
          generatedBy={user?.displayName || user?.username || ''}
        />
      )}

      {lightbox && (
        <div className="pr-lightbox" onClick={() => setLightbox(null)}>
          <div className="pr-lightbox__inner" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <strong>{lightbox.labour?.labourName || 'Capture preview'}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {lightbox.date ? formatDate(lightbox.date) : ''}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setLightbox(null)}>
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {(lightbox.captures || []).map((c) => (
                <div key={c.id || c.at}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolvePhotoUrl(c.photoUrl)} alt="" />
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                    {c.type || 'capture'} · {formatDateTime(c.at)}
                    {c.gateName ? ` · ${c.gateName}` : ''}
                    {c.operator ? ` · ${c.operator}` : ''}
                    {c.matchScore != null ? ` · score ${Number(c.matchScore).toFixed(2)}` : ''}
                    {c.verified != null ? ` · ${c.verified ? 'Verified' : 'Unverified'}` : ''}
                  </div>
                </div>
              ))}
              {!lightbox.captures && lightbox.entryCapture && (
                <>
                  {lightbox.registeredPhotoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvePhotoUrl(lightbox.registeredPhotoUrl)} alt="Registered" />
                  )}
                  {lightbox.entryCapture?.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvePhotoUrl(lightbox.entryCapture.photoUrl)} alt="Entry" />
                  )}
                  {lightbox.exitCapture?.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvePhotoUrl(lightbox.exitCapture.photoUrl)} alt="Exit" />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
