'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/formatDate';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';

// ─── Storage key for persisting list state across navigation ────────────────
const SESSION_KEY = 'pm_list_state';

function saveListState(state) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* noop */ }
}
function loadListState() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function statusBadgeClass(status) {
  if (status === 'active') return 'badge badge-success';
  if (status === 'completed') return 'badge badge-info';
  if (status === 'on_hold') return 'badge badge-warning';
  return 'badge badge-danger';
}
function statusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'completed') return 'Completed';
  if (status === 'on_hold') return 'On Hold';
  return status;
}
function typeBadgeClass(type) {
  if (type === 'universal') return 'badge badge-info';
  if (type === 'department_specific') return 'badge badge-success';
  return 'badge badge-warning';
}

function ProgressBar({ pct }) {
  const safe = Math.min(100, Math.max(0, pct || 0));
  return (
    <div className="pml-progress-track" aria-label={`${safe}% complete`}>
      <div
        className="pml-progress-fill"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="pml-card pml-card--skeleton" aria-hidden="true">
      <div className="pml-card__header">
        <div className="pml-skel pml-skel--title" />
        <div className="pml-skel pml-skel--badge" />
      </div>
      <div className="pml-card__body">
        <div className="pml-skel pml-skel--line" />
        <div className="pml-skel pml-skel--line pml-skel--short" style={{ marginTop: 6 }} />
      </div>
      <div className="pml-card__footer">
        <div className="pml-skel pml-skel--btn" />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className={`pml-stat-card${accent ? ` pml-stat-card--${accent}` : ''}`}>
      <div className="pml-stat-card__value">{value ?? '—'}</div>
      <div className="pml-stat-card__label">{label}</div>
    </div>
  );
}

export default function ProjectListPage() {
  return (
    <Suspense fallback={<PageShell title="Project Maintenance"><div className="pm-empty">Loading…</div></PageShell>}>
      <ProjectListContent />
    </Suspense>
  );
}

function ProjectListContent() {
  const { can } = useAuth();
  const canRead = can('projects', 'read');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Restore persisted filter/scroll state
  const saved = useMemo(() => loadListState(), []);

  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters — restored from session if available
  const [search, setSearch] = useState(saved?.search ?? '');
  const [statusFilter, setStatusFilter] = useState(saved?.statusFilter ?? '');
  const [typeFilter, setTypeFilter] = useState(saved?.typeFilter ?? '');
  const [deptFilter, setDeptFilter] = useState(saved?.deptFilter ?? '');
  const [divFilter, setDivFilter] = useState(saved?.divFilter ?? '');
  const [sortBy, setSortBy] = useState(saved?.sortBy ?? 'createdAt_desc');

  const listRef = useRef(null);

  // Persist filter state whenever it changes
  useEffect(() => {
    saveListState({ search, statusFilter, typeFilter, deptFilter, divFilter, sortBy });
  }, [search, statusFilter, typeFilter, deptFilter, divFilter, sortBy]);

  // Restore scroll position after mount
  useEffect(() => {
    if (saved?.scrollY && listRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollTo?.({ top: saved.scrollY, behavior: 'instant' });
      });
    }
  }, []);

  // Persist scroll on leave
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const s = loadListState() || {};
      saveListState({ ...s, scrollY: el.scrollTop });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Check for ?project=id on the URL (legacy deep-link support) and redirect
  useEffect(() => {
    const pId = searchParams.get('project');
    if (pId) {
      router.replace(`/projects/maintenance/${pId}`);
    }
  }, [searchParams, router]);

  // Load data
  useEffect(() => {
    if (!canRead) return;
    setLoading(true);
    Promise.all([
      api.projects.list().catch(() => []),
      api.departments.list({ isActive: 'true' }).catch(() => []),
      api.divisions.list({ isActive: 'true' }).catch(() => []),
    ]).then(([projs, deps, divs]) => {
      setProjects(Array.isArray(projs) ? projs : []);
      setDepartments(Array.isArray(deps) ? deps : []);
      setDivisions(Array.isArray(divs) ? divs : []);
    }).catch((e) => setError(e.message || 'Failed to load projects'))
      .finally(() => setLoading(false));
  }, [canRead]);

  // Summary stats
  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status === 'active').length;
    const onHold = projects.filter((p) => p.status === 'on_hold').length;
    const completed = projects.filter((p) => p.status === 'completed').length;
    const totalLabour = projects.reduce((s, p) => s + (p.activeLabourers ?? 0), 0);
    return { total: projects.length, active, onHold, completed, totalLabour };
  }, [projects]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = projects.filter((p) => {
      if (q && !p.projectName.toLowerCase().includes(q)) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (typeFilter && p.projectType !== typeFilter) return false;
      if (deptFilter && String(p.departmentId || p.department?._id || '') !== deptFilter) return false;
      if (divFilter && String(p.divisionId || p.division?._id || '') !== divFilter) return false;
      return true;
    });
    const [key, dir] = sortBy.split('_');
    list = [...list].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'createdAt') { av = new Date(av); bv = new Date(bv); }
      if (key === 'projectName') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (key === 'progress') { av = a.progress?.completionPct ?? 0; bv = b.progress?.completionPct ?? 0; }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [projects, search, statusFilter, typeFilter, deptFilter, divFilter, sortBy]);

  function openWorkspace(projectId) {
    router.push(`/projects/maintenance/${projectId}`);
  }

  if (!canRead) {
    return (
      <PageShell title="Project Maintenance" description="Manage project labour allocation">
        <p className="read-only-banner">You do not have access to project maintenance.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Project Maintenance"
      description="Select a project to open its maintenance workspace"
    >
      {/* ── Summary stats ── */}
      <div className="pml-stats-row">
        <SummaryCard label="Total Projects" value={stats.total} />
        <SummaryCard label="Active" value={stats.active} accent="success" />
        <SummaryCard label="On Hold" value={stats.onHold} accent="warning" />
        <SummaryCard label="Completed" value={stats.completed} accent="info" />
        <SummaryCard label="Total Assigned Labour" value={stats.totalLabour} accent="primary" />
      </div>

      {/* ── Filters & search ── */}
      <div className="pml-filters card">
        <input
          type="search"
          className="pml-filter-input pml-filter-input--wide"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search projects"
        />
        <select
          className="pml-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Status filter"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
        <select
          className="pml-filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Project type filter"
        >
          <option value="">All Types</option>
          <option value="universal">Universal</option>
          <option value="department_specific">Department Specific</option>
          <option value="division_specific">Division Specific</option>
        </select>
        {departments.length > 0 && (
          <select
            className="pml-filter-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Department filter"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        )}
        {divisions.length > 0 && (
          <select
            className="pml-filter-select"
            value={divFilter}
            onChange={(e) => setDivFilter(e.target.value)}
            aria-label="Division filter"
          >
            <option value="">All Divisions</option>
            {divisions.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        )}
        <select
          className="pml-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort by"
        >
          <option value="createdAt_desc">Newest First</option>
          <option value="createdAt_asc">Oldest First</option>
          <option value="projectName_asc">Name A–Z</option>
          <option value="projectName_desc">Name Z–A</option>
          <option value="progress_desc">Progress High–Low</option>
          <option value="progress_asc">Progress Low–High</option>
        </select>
        {(search || statusFilter || typeFilter || deptFilter || divFilter) && (
          <button
            type="button"
            className="btn-ghost btn-sm pml-clear-btn"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setTypeFilter('');
              setDeptFilter('');
              setDivFilter('');
            }}
            aria-label="Clear filters"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* ── Project list ── */}
      <div className="pml-list" ref={listRef}>
        {loading ? (
          <div className="pml-grid">
            {Array.from({ length: 6 }, (_, i) => <ProjectCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="pml-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
              <rect x="2" y="7" width="20" height="14" rx="3" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
            <p>
              {projects.length === 0
                ? 'No projects yet.'
                : 'No projects match your filters.'}
            </p>
            {projects.length === 0 && (
              <Link href="/projects/create" className="btn-primary btn-sm" style={{ marginTop: '0.5rem' }}>
                Create a project
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="pml-results-meta">
              {filtered.length} project{filtered.length !== 1 ? 's' : ''}
            </div>
            <div className="pml-grid">
              {filtered.map((project) => {
                const pid = project._id || project.id;
                const pct = project.progress?.completionPct ?? 0;
                const scope = project.projectType === 'department_specific'
                  ? project.department?.name
                  : project.projectType === 'division_specific'
                    ? project.division?.name
                    : null;

                return (
                  <article
                    key={pid}
                    className="pml-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openWorkspace(pid)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWorkspace(pid); } }}
                    aria-label={`Open workspace for ${project.projectName}`}
                  >
                    <div className="pml-card__header">
                      <h3 className="pml-card__name">{project.projectName}</h3>
                      <span className={statusBadgeClass(project.status)}>
                        {statusLabel(project.status)}
                      </span>
                    </div>

                    <div className="pml-card__badges">
                      <span className={typeBadgeClass(project.projectType)}>
                        {project.projectTypeLabel || project.projectType}
                      </span>
                      {scope && (
                        <span className="badge badge-secondary">{scope}</span>
                      )}
                    </div>

                    <div className="pml-card__body">
                      <div className="pml-card__meta-row">
                        <div className="pml-card__meta-item">
                          <span className="pml-card__meta-label">Required Days</span>
                          <span className="pml-card__meta-value">{project.requiredDays}</span>
                        </div>
                        <div className="pml-card__meta-item">
                          <span className="pml-card__meta-label">Assigned Labour</span>
                          <span className="pml-card__meta-value">{project.activeLabourers ?? project.totalAssigned ?? '—'}</span>
                        </div>
                        <div className="pml-card__meta-item">
                          <span className="pml-card__meta-label">Inside Today</span>
                          <span className="pml-card__meta-value">{project.labourWorkingToday ?? '—'}</span>
                        </div>
                      </div>

                      <div className="pml-card__progress">
                        <div className="pml-card__progress-label">
                          <span>Progress</span>
                          <span className="pml-card__progress-pct">{pct}%</span>
                        </div>
                        <ProgressBar pct={pct} />
                      </div>
                    </div>

                    <div className="pml-card__footer">
                      <span className="pml-card__date">
                        Created {formatDate(project.createdAt)}
                      </span>
                      <span className="pml-card__open-btn" aria-hidden="true">
                        Open Workspace
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
