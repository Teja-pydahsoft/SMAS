'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';

const PROJECT_TYPES = [
  { value: 'universal', label: 'Universal' },
  { value: 'department_specific', label: 'Department Specific' },
  { value: 'division_specific', label: 'Division Specific' },
];

const PROJECT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
];

const STATUS_CHIPS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
];

const EMPTY_SUMMARY = {
  totalProjects: 0,
  active: 0,
  completed: 0,
  onHold: 0,
  totalAssignedLabour: 0,
  labourWorkingToday: 0,
};

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function statusBadgeClass(status) {
  if (status === 'active') return 'badge badge-success';
  if (status === 'completed') return 'badge badge-info';
  if (status === 'archived') return 'badge';
  return 'badge badge-danger';
}

function projectTypeBadgeClass(type) {
  if (type === 'universal') return 'badge badge-info';
  if (type === 'department_specific') return 'badge badge-success';
  return 'badge badge-danger';
}

function projectScopeLabel(project) {
  if (!project) return '—';
  if (project.projectType === 'department_specific') {
    return project.department?.name || '—';
  }
  if (project.projectType === 'division_specific') {
    return project.division?.name || '—';
  }
  return 'All divisions & departments';
}

function progressOf(project) {
  return project?.progress || {
    requiredDays: project?.requiredDays ?? 0,
    completedDays: 0,
    remainingDays: project?.requiredDays ?? 0,
    completionPct: 0,
  };
}

function ProgressBar({ project, compact = false }) {
  const progress = progressOf(project);
  const pct = Math.max(0, Math.min(100, Number(progress.completionPct) || 0));
  return (
    <div className="pp-progress">
      <div className="pp-progress__header">
        <span>{compact ? 'Progress' : 'Schedule progress'}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="pp-progress__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="pp-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProjectFormModal({ project, departments, divisions, onClose, onComplete }) {
  const isEdit = Boolean(project);
  const [projectName, setProjectName] = useState(project?.projectName ?? '');
  const [requiredDays, setRequiredDays] = useState(project?.requiredDays?.toString() ?? '');
  const [projectType, setProjectType] = useState(project?.projectType ?? 'universal');
  const [departmentId, setDepartmentId] = useState(project?.departmentId ?? '');
  const [divisionId, setDivisionId] = useState(project?.divisionId ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState(project?.status === 'archived' ? 'on_hold' : (project?.status ?? 'active'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    const days = Number(requiredDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError('Required days must be greater than zero');
      return;
    }
    if (projectType === 'department_specific' && !departmentId) {
      setError('Department is required for Department Specific projects');
      return;
    }
    if (projectType === 'division_specific' && !divisionId) {
      setError('Division is required for Division Specific projects');
      return;
    }

    setLoading(true);
    setError('');
    const payload = {
      projectName: projectName.trim(),
      requiredDays: days,
      projectType,
      departmentId: projectType === 'department_specific' ? departmentId : null,
      divisionId: projectType === 'division_specific' ? divisionId : null,
      description: description.trim(),
      status,
    };

    try {
      const saved = isEdit
        ? await api.projects.update(project._id || project.id, payload)
        : await api.projects.create(payload);
      onComplete(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit Project' : 'New Project'}
    >
      <div className="reg-details-modal pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">{isEdit ? 'Edit Project' : 'New Project'}</h3>
              <p className="reg-details-modal__sub">
                {isEdit ? 'Update portfolio details and configuration' : 'Add a project to the portfolio'}
              </p>
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reg-details-modal__body">
          <form onSubmit={handleSubmit}>
            <div className="pp-form-sections">
              <section className="pp-form-section">
                <h4 className="pp-form-section__title">General Information</h4>
                <div className="pp-form-grid">
                  <div className="form-group form-group--full">
                    <label htmlFor="project-name">
                      Project Name <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      id="project-name"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="e.g. Electrical Panel Upgrade"
                      autoFocus
                    />
                  </div>
                  <div className="form-group form-group--full">
                    <label htmlFor="project-description">Description</label>
                    <textarea
                      id="project-description"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional project description"
                    />
                  </div>
                </div>
              </section>

              <section className="pp-form-section">
                <h4 className="pp-form-section__title">Project Configuration</h4>
                <div className="pp-form-grid">
                  <div className="form-group">
                    <label htmlFor="required-days">
                      Estimated Required Days <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      id="required-days"
                      type="number"
                      min="1"
                      step="1"
                      value={requiredDays}
                      onChange={(e) => setRequiredDays(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="project-type">Project Type</label>
                    <select
                      id="project-type"
                      value={projectType}
                      onChange={(e) => {
                        setProjectType(e.target.value);
                        if (e.target.value !== 'department_specific') setDepartmentId('');
                        if (e.target.value !== 'division_specific') setDivisionId('');
                      }}
                    >
                      {PROJECT_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {projectType === 'department_specific' && (
                    <div className="form-group form-group--full">
                      <label htmlFor="project-department">
                        Department <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <select
                        id="project-department"
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                      >
                        <option value="">Select department</option>
                        {departments.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {projectType === 'division_specific' && (
                    <div className="form-group form-group--full">
                      <label htmlFor="project-division">
                        Division <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <select
                        id="project-division"
                        value={divisionId}
                        onChange={(e) => setDivisionId(e.target.value)}
                      >
                        <option value="">Select division</option>
                        {divisions.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              <section className="pp-form-section">
                <h4 className="pp-form-section__title">Project Status</h4>
                <div className="pp-form-grid">
                  <div className="form-group">
                    <label htmlFor="project-status">Status</label>
                    <select
                      id="project-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {PROJECT_STATUSES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            </div>

            {error && <p className="error-msg">{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.35rem' }}>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Project')}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProjectViewModal({ project, onClose, onEdit }) {
  if (!project) return null;
  const progress = progressOf(project);
  const createdBy = project.createdBy?.displayName || project.createdBy?.username || '—';

  return (
    <div
      className="pass-modal-overlay reg-details-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="View Project"
    >
      <div className="reg-details-modal pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reg-details-modal__header no-print">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">{project.projectName}</h3>
              <p className="reg-details-modal__sub">Project portfolio details</p>
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reg-details-modal__body">
          <div className="pp-card__meta" style={{ marginBottom: '1rem' }}>
            <span className={projectTypeBadgeClass(project.projectType)}>{project.projectTypeLabel}</span>
            <span className={statusBadgeClass(project.status)}>{project.statusLabel}</span>
            <span className="pp-card__scope">{projectScopeLabel(project)}</span>
          </div>

          <div className="pp-view-grid">
            <div className="pp-view-item">
              <div className="pp-view-item__label">Required Days</div>
              <div className="pp-view-item__value">{progress.requiredDays}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Days Completed</div>
              <div className="pp-view-item__value">{progress.completedDays}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Remaining Days</div>
              <div className="pp-view-item__value">{progress.remainingDays}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Assigned Labour</div>
              <div className="pp-view-item__value">{project.activeLabourers ?? 0}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Labour Working Today</div>
              <div className="pp-view-item__value">{project.labourWorkingToday ?? 0}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Created Date</div>
              <div className="pp-view-item__value">{formatDate(project.createdAt)}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Created By</div>
              <div className="pp-view-item__value">{createdBy}</div>
            </div>
            <div className="pp-view-item">
              <div className="pp-view-item__label">Description</div>
              <div className="pp-view-item__value">{project.description || '—'}</div>
            </div>
          </div>

          <div style={{ marginTop: '1.15rem' }}>
            <ProgressBar project={project} />
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.35rem', flexWrap: 'wrap' }}>
            {onEdit && (
              <button type="button" className="btn-primary" onClick={onEdit}>
                Edit
              </button>
            )}
            <Link
              href={`/projects/maintenance?project=${project._id || project.id}&tab=assign`}
              className="btn-secondary"
            >
              Assignments
            </Link>
            <Link
              href={`/projects/reports?project=${project._id || project.id}`}
              className="btn-secondary"
            >
              Reports
            </Link>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectPortfolioCard({ project, canWrite, onView, onEdit, onArchive }) {
  const progress = progressOf(project);
  const id = project._id || project.id;
  const createdBy = project.createdBy?.displayName || project.createdBy?.username || '—';

  return (
    <article className="pp-card">
      <div className="pp-card__main">
        <div className="pp-card__title-row">
          <h4 className="pp-card__title">{project.projectName}</h4>
          <span className={statusBadgeClass(project.status)}>{project.statusLabel}</span>
        </div>
        <div className="pp-card__meta">
          <span className={projectTypeBadgeClass(project.projectType)}>{project.projectTypeLabel}</span>
          <span className="pp-card__scope">{projectScopeLabel(project)}</span>
        </div>
        <div className="pp-card__created">
          <span>Created {formatDate(project.createdAt)} · <strong>{createdBy}</strong></span>
        </div>
      </div>

      <div className="pp-card__metrics">
        <div className="pp-metric">
          <div className="pp-metric__label">Required Days</div>
          <div className="pp-metric__value">{progress.requiredDays}</div>
        </div>
        <div className="pp-metric">
          <div className="pp-metric__label">Days Completed</div>
          <div className="pp-metric__value">{progress.completedDays}</div>
        </div>
        <div className="pp-metric">
          <div className="pp-metric__label">Remaining Days</div>
          <div className="pp-metric__value">{progress.remainingDays}</div>
        </div>
        <div className="pp-metric">
          <div className="pp-metric__label">Assigned Labour</div>
          <div className="pp-metric__value">{project.activeLabourers ?? 0}</div>
        </div>
        <div className="pp-metric">
          <div className="pp-metric__label">Working Today</div>
          <div className="pp-metric__value">{project.labourWorkingToday ?? 0}</div>
        </div>
        <ProgressBar project={project} />
      </div>

      <div className="pp-card__actions">
        <div className="pp-action-row">
          <button type="button" className="btn-secondary" onClick={() => onView(project)}>
            View
          </button>
          {canWrite && (
            <>
              <button type="button" className="btn-secondary" onClick={() => onEdit(project)}>
                Edit
              </button>
              <button type="button" className="btn-danger" onClick={() => onArchive(project)}>
                Archive
              </button>
            </>
          )}
        </div>
        <div className="pp-link-row">
          <Link href={`/projects/maintenance?project=${id}&tab=assign`}>Assignments</Link>
          <Link href={`/projects/reports?project=${id}`}>Reports</Link>
        </div>
      </div>
    </article>
  );
}

export default function ProjectPortfolioPage() {
  const { can } = useAuth();
  const canWrite = can('projects', 'write');

  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);

  const [statusChip, setStatusChip] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [projectType, setProjectType] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [viewMode, setViewMode] = useState('cards');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalProject, setModalProject] = useState(null);
  const [viewProject, setViewProject] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    Promise.all([
      api.departments.list({ isActive: 'true' }).catch(() => []),
      api.divisions.list({ isActive: 'true' }).catch(() => []),
    ]).then(([deps, divs]) => {
      setDepartments(deps);
      setDivisions(divs);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const effectiveStatus = statusFilter || statusChip;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (effectiveStatus) params.status = effectiveStatus;
      if (projectType) params.projectType = projectType;
      if (departmentId) params.departmentId = departmentId;
      if (divisionId) params.divisionId = divisionId;
      if (search) params.search = search;
      if (createdDate) {
        params.createdFrom = createdDate;
        params.createdTo = createdDate;
      }

      const [list, sum] = await Promise.all([
        api.projects.list(params),
        api.projects.portfolioSummary().catch(() => EMPTY_SUMMARY),
      ]);
      setProjects(list);
      setSummary(sum || EMPTY_SUMMARY);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveStatus, projectType, departmentId, divisionId, search, createdDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const kpis = useMemo(() => ([
    { key: 'total', label: 'Total Projects', value: summary.totalProjects, tone: 'primary' },
    { key: 'active', label: 'Active', value: summary.active, tone: 'success' },
    { key: 'completed', label: 'Completed', value: summary.completed, tone: 'info' },
    { key: 'onHold', label: 'On Hold', value: summary.onHold, tone: 'warning' },
    { key: 'assigned', label: 'Total Assigned Labour', value: summary.totalAssignedLabour, tone: 'accent' },
    { key: 'today', label: 'Labour Working Today', value: summary.labourWorkingToday, tone: 'teal' },
  ]), [summary]);

  async function handleArchive(project) {
    if (!confirm(`Archive project "${project.projectName}"? It will be hidden from the active portfolio.`)) {
      return;
    }
    try {
      await api.projects.archive(project._id || project.id);
      setSuccess(`Project "${project.projectName}" archived`);
      setViewProject(null);
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleSaved(saved) {
    setShowCreate(false);
    setModalProject(null);
    setSuccess(`Project "${saved.projectName}" saved`);
    loadData();
  }

  function clearFilters() {
    setStatusChip('');
    setSearchInput('');
    setSearch('');
    setProjectType('');
    setDepartmentId('');
    setDivisionId('');
    setStatusFilter('');
    setCreatedDate('');
  }

  function onChipClick(value) {
    setStatusChip(value);
    setStatusFilter('');
  }

  return (
    <PageShell
      title="Project Portfolio"
      description="Enterprise portfolio view of projects, schedule progress, and labour utilisation"
    >
      <div className="pp-page">
        <div className="pp-summary-grid" aria-label="Portfolio summary">
          {kpis.map((kpi) => (
            <div key={kpi.key} className={`pp-kpi pp-kpi--${kpi.tone}`}>
              <div className="pp-kpi__label">{kpi.label}</div>
              <div className="pp-kpi__value">{kpi.value ?? 0}</div>
            </div>
          ))}
        </div>

        <div className="pp-toolbar-card">
          <div className="pp-toolbar-top">
            <div className="pp-chips" role="tablist" aria-label="Quick status filters">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.value || 'all'}
                  type="button"
                  className={`pp-chip${statusChip === chip.value && !statusFilter ? ' is-active' : ''}`}
                  onClick={() => onChipClick(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="pp-toolbar-actions">
              <div className="pp-view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`pp-view-btn${viewMode === 'cards' ? ' is-active' : ''}`}
                  onClick={() => setViewMode('cards')}
                >
                  <CardsIcon /> Card View
                </button>
                <button
                  type="button"
                  className={`pp-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
                  onClick={() => setViewMode('table')}
                >
                  <TableIcon /> Table View
                </button>
              </div>
              {canWrite && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={() => setShowCreate(true)}
                >
                  <PlusIcon />
                  New Project
                </button>
              )}
            </div>
          </div>

          <div className="pp-filters">
            <div className="pp-filter-field">
              <label htmlFor="pp-search">Search</label>
              <input
                id="pp-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search project name..."
              />
            </div>
            <div className="pp-filter-field">
              <label htmlFor="pp-type">Project Type</label>
              <select id="pp-type" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                <option value="">All types</option>
                {PROJECT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="pp-filter-field">
              <label htmlFor="pp-dept">Department</label>
              <select id="pp-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="pp-filter-field">
              <label htmlFor="pp-div">Division</label>
              <select id="pp-div" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">All divisions</option>
                {divisions.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="pp-filter-field">
              <label htmlFor="pp-status">Status</label>
              <select
                id="pp-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  if (e.target.value) setStatusChip(e.target.value);
                  else setStatusChip('');
                }}
              >
                <option value="">All statuses</option>
                {PROJECT_STATUSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="pp-filter-field">
              <label htmlFor="pp-created">Created Date</label>
              <input
                id="pp-created"
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </div>

        <div className="pp-results-meta">
          <div>
            <h3>Portfolio ({projects.length})</h3>
            <p>
              {loading ? 'Refreshing portfolio…' : 'Schedule progress and labour assignment at a glance'}
            </p>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}
        {success && (
          <p className="success-msg" style={{ color: 'var(--success)', marginBottom: 0 }}>
            {success}
          </p>
        )}

        {!canWrite && (
          <p className="read-only-banner">View only — project changes require write access.</p>
        )}

        {loading && projects.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading portfolio…</p>
        ) : projects.length === 0 ? (
          <div className="pp-empty">
            <p style={{ margin: 0 }}>No projects match the current filters.</p>
            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => setShowCreate(true)}
              >
                Create Project
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          <div className="pp-card-list">
            {projects.map((project) => (
              <ProjectPortfolioCard
                key={project._id || project.id}
                project={project}
                canWrite={canWrite}
                onView={setViewProject}
                onEdit={setModalProject}
                onArchive={handleArchive}
              />
            ))}
          </div>
        ) : (
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Required</th>
                  <th>Completed</th>
                  <th>Remaining</th>
                  <th>Progress</th>
                  <th>Assigned</th>
                  <th>Working Today</th>
                  <th>Created</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const progress = progressOf(project);
                  const id = project._id || project.id;
                  return (
                    <tr key={id}>
                      <td className="pp-table__name">{project.projectName}</td>
                      <td>
                        <span className={projectTypeBadgeClass(project.projectType)}>
                          {project.projectTypeLabel}
                        </span>
                      </td>
                      <td>
                        <span className={statusBadgeClass(project.status)}>{project.statusLabel}</span>
                      </td>
                      <td>{progress.requiredDays}</td>
                      <td>{progress.completedDays}</td>
                      <td>{progress.remainingDays}</td>
                      <td><ProgressBar project={project} compact /></td>
                      <td>{project.activeLabourers ?? 0}</td>
                      <td>{project.labourWorkingToday ?? 0}</td>
                      <td>{formatDate(project.createdAt)}</td>
                      <td>{project.createdBy?.displayName || project.createdBy?.username || '—'}</td>
                      <td>
                        <div className="pp-table__actions">
                          <button type="button" className="btn-secondary" onClick={() => setViewProject(project)}>
                            View
                          </button>
                          {canWrite && (
                            <>
                              <button type="button" className="btn-secondary" onClick={() => setModalProject(project)}>
                                Edit
                              </button>
                              <button type="button" className="btn-danger" onClick={() => handleArchive(project)}>
                                Archive
                              </button>
                            </>
                          )}
                          <Link href={`/projects/maintenance?project=${id}&tab=assign`} className="btn-secondary">
                            Assignments
                          </Link>
                          <Link href={`/projects/reports?project=${id}`} className="btn-secondary">
                            Reports
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreate || modalProject) && (
        <ProjectFormModal
          project={modalProject}
          departments={departments}
          divisions={divisions}
          onClose={() => {
            setShowCreate(false);
            setModalProject(null);
          }}
          onComplete={handleSaved}
        />
      )}

      {viewProject && (
        <ProjectViewModal
          project={viewProject}
          onClose={() => setViewProject(null)}
          onEdit={canWrite ? () => {
            setModalProject(viewProject);
            setViewProject(null);
          } : null}
        />
      )}
    </PageShell>
  );
}
