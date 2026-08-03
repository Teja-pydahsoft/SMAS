'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';
import CameraCapture from '@/components/CameraCapture';

// ─── Daily Photos helpers ────────────────────────────────────────────────────

function PhotoSkeletonCard() {
  return (
    <div className="pdg-card pdg-card--skeleton" aria-hidden="true">
      <div className="pdg-card__thumb pdg-card__thumb--skeleton" />
      <div className="pdg-card__body">
        <div className="pdg-skel pdg-skel--line pdg-skel--w60" />
        <div className="pdg-skel pdg-skel--line pdg-skel--w80" style={{ marginTop: 6 }} />
        <div className="pdg-skel pdg-skel--line pdg-skel--w50" style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

function VerificationBadge({ photo }) {
  const matched = (photo.detections || []).some((d) => d.matched && d.assignedToProject);
  const hasDetections = (photo.detections || []).length > 0;
  if (!hasDetections) return <span className="pdg-vbadge pdg-vbadge--none">No Faces</span>;
  if (matched) return <span className="pdg-vbadge pdg-vbadge--verified">Verified</span>;
  return <span className="pdg-vbadge pdg-vbadge--unverified">Unverified</span>;
}

function TrainPhotoThumb({ photo }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const url = resolvePhotoUrl(photo.photoUrl || photo.photoPath);
  return (
    <div className="pdg-train-thumb-inner">
      {!loaded && !err && <div className="pdg-train-thumb-placeholder" />}
      {!err && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy"
          onLoad={() => setLoaded(true)} onError={() => setErr(true)}
          className={loaded ? 'pdg-train-thumb-img--loaded' : 'pdg-train-thumb-img--loading'} />
      )}
      {err && (
        <div className="pdg-train-thumb-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      )}
    </div>
  );
}

function PhotoCard({ photo, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const photoUrl = resolvePhotoUrl(photo.photoUrl || photo.photoPath);
  const firstDetection = (photo.detections || []).find((d) => d.assignedToProject) || (photo.detections || [])[0] || null;
  return (
    <article className="pdg-card" onClick={() => onClick(photo)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(photo); } }}
      aria-label={`View photo captured at ${formatDateTime(photo.createdAt)}`}>
      <div className="pdg-card__thumb">
        {!imgLoaded && !imgError && <div className="pdg-card__thumb-placeholder" />}
        {!imgError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" loading="lazy"
            onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)}
            className={imgLoaded ? 'pdg-card__img--loaded' : 'pdg-card__img--loading'} />
        )}
        {imgError && (
          <div className="pdg-card__thumb-error">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
        <div className="pdg-card__overlay"><VerificationBadge photo={photo} /></div>
      </div>
      <div className="pdg-card__body">
        <div className="pdg-card__time">{formatDateTime(photo.createdAt)}</div>
        {firstDetection ? (
          <>
            <div className="pdg-card__name">{firstDetection.labourName || '—'}</div>
            <div className="pdg-card__meta">
              {firstDetection.registrationCode && <span>{firstDetection.registrationCode}</span>}
              {firstDetection.divisionName && <span>{firstDetection.divisionName}</span>}
            </div>
          </>
        ) : (
          <div className="pdg-card__name pdg-card__name--empty">No person detected</div>
        )}
        <div className="pdg-card__footer">
          <span className="pdg-card__faces">{photo.facesDetected || 0} face{photo.facesDetected !== 1 ? 's' : ''}</span>
          {photo.uploadedByName && <span className="pdg-card__by">By {photo.uploadedByName}</span>}
        </div>
      </div>
    </article>
  );
}

function ImagePreviewModal({ photos, initialIndex, onClose }) {
  const [idx, setIdx] = useState(initialIndex ?? 0);
  const photo = photos[idx] || null;
  useEffect(() => { setIdx(initialIndex ?? 0); }, [initialIndex]);
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);
  if (!photo) return null;
  const photoUrl = resolvePhotoUrl(photo.photoUrl || photo.photoPath);
  const mainDetection = (photo.detections || []).find((d) => d.assignedToProject) || (photo.detections || [])[0] || null;
  const registeredPhotoUrl = mainDetection?.photoUrl ? resolvePhotoUrl(mainDetection.photoUrl) : null;
  const matchScore = mainDetection?.matchScore;
  return (
    <div className="pass-modal-overlay pdg-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Photo preview">
      <div className="pdg-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdg-preview-modal__header">
          <div className="pdg-preview-modal__nav">
            <button type="button" className="btn-secondary btn-sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} aria-label="Previous photo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Prev
            </button>
            <span className="pdg-preview-modal__counter">{idx + 1} / {photos.length}</span>
            <button type="button" className="btn-secondary btn-sm" disabled={idx === photos.length - 1} onClick={() => setIdx((i) => i + 1)} aria-label="Next photo">
              Next<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close preview">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="pdg-preview-modal__body">
          <div className="pdg-preview-modal__images">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Captured photo" className="pdg-preview-modal__main-img" />
            {registeredPhotoUrl && (
              <div className="pdg-preview-modal__reg-img-wrap">
                <div className="pdg-preview-modal__reg-label">Registered Photo</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={registeredPhotoUrl} alt="Registered" className="pdg-preview-modal__reg-img" />
              </div>
            )}
          </div>
          <div className="pdg-preview-modal__details">
            <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Capture Time</span><span className="pdg-preview-modal__dv">{formatDateTime(photo.createdAt)}</span></div>
            {mainDetection?.labourName && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Labour Name</span><span className="pdg-preview-modal__dv">{mainDetection.labourName}</span></div>}
            {mainDetection?.registrationCode && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Labour ID</span><span className="pdg-preview-modal__dv">{mainDetection.registrationCode}</span></div>}
            {mainDetection?.divisionName && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Division</span><span className="pdg-preview-modal__dv">{mainDetection.divisionName}</span></div>}
            {mainDetection?.gateStatus && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Gate Status</span><span className="pdg-preview-modal__dv" style={{ textTransform: 'capitalize' }}>{mainDetection.gateStatus}</span></div>}
            {photo.uploadedByName && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Captured By</span><span className="pdg-preview-modal__dv">{photo.uploadedByName}</span></div>}
            <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Verification</span><span className="pdg-preview-modal__dv"><VerificationBadge photo={photo} /></span></div>
            {typeof matchScore === 'number' && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Similarity Score</span><span className="pdg-preview-modal__dv">{Math.round(matchScore * 100)}%</span></div>}
            {photo.facesDetected > 0 && <div className="pdg-preview-modal__detail-row"><span className="pdg-preview-modal__dl">Faces Detected</span><span className="pdg-preview-modal__dv">{photo.facesDetected}</span></div>}
          </div>
        </div>
        <div className="pdg-preview-modal__keyboard-hint"><kbd>←</kbd> <kbd>→</kbd> navigate · <kbd>Esc</kbd> close</div>
      </div>
    </div>
  );
}

function ShowMoreModal({ photos, selectedDay, selectedProject, onClose, onImageClick }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [divFilter, setDivFilter] = useState('');
  const [entryExitFilter, setEntryExitFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const departments = useMemo(() => { const s = new Set(); photos.forEach((p) => (p.detections || []).forEach((d) => d.roleName && s.add(d.roleName))); return [...s].sort(); }, [photos]);
  const divisions = useMemo(() => { const s = new Set(); photos.forEach((p) => (p.detections || []).forEach((d) => d.divisionName && s.add(d.divisionName))); return [...s].sort(); }, [photos]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return photos.filter((p) => {
      if (q) { const n = (p.detections || []).map((d) => (d.labourName || '') + ' ' + (d.registrationCode || '')).join(' ').toLowerCase(); if (!n.includes(q)) return false; }
      if (deptFilter && !(p.detections || []).some((d) => d.roleName === deptFilter)) return false;
      if (divFilter && !(p.detections || []).some((d) => d.divisionName === divFilter)) return false;
      if (entryExitFilter && !(p.detections || []).some((d) => d.gateStatus === entryExitFilter)) return false;
      if (timeFilter) { const h = new Date(p.createdAt).getHours(); if (timeFilter === 'morning' && !(h >= 6 && h < 12)) return false; if (timeFilter === 'afternoon' && !(h >= 12 && h < 17)) return false; if (timeFilter === 'evening' && !(h >= 17 && h < 21)) return false; if (timeFilter === 'night' && !(h >= 21 || h < 6)) return false; }
      return true;
    });
  }, [photos, search, deptFilter, divFilter, entryExitFilter, timeFilter]);
  return (
    <div className="pass-modal-overlay pdg-all-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="All photos">
      <div className="reg-details-modal pdg-all-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reg-details-modal__header">
          <div className="reg-details-modal__title-wrap">
            <div>
              <h3 className="reg-details-modal__title">{selectedProject?.projectName} · Day {selectedDay?.dayIndex}</h3>
              <p className="reg-details-modal__sub">{formatDate(selectedDay?.photoDate)} · {photos.length} total photo{photos.length !== 1 ? 's' : ''}{' · '}{photos.reduce((s, p) => s + (p.matchedAssignedCount || 0), 0)} labours captured</p>
            </div>
          </div>
          <button type="button" className="reg-details-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="pdg-all-modal__filters">
          <input type="search" className="pdg-filter-input" placeholder="Search labour name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search labour" />
          {departments.length > 0 && <select className="pdg-filter-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Department filter"><option value="">All Departments</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
          {divisions.length > 0 && <select className="pdg-filter-select" value={divFilter} onChange={(e) => setDivFilter(e.target.value)} aria-label="Division filter"><option value="">All Divisions</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
          <select className="pdg-filter-select" value={entryExitFilter} onChange={(e) => setEntryExitFilter(e.target.value)} aria-label="Gate status filter"><option value="">Entry / Exit</option><option value="inside">Inside</option><option value="outside">Outside</option></select>
          <select className="pdg-filter-select" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} aria-label="Time filter"><option value="">All Times</option><option value="morning">Morning (6–12)</option><option value="afternoon">Afternoon (12–17)</option><option value="evening">Evening (17–21)</option><option value="night">Night</option></select>
        </div>
        <div className="pdg-all-modal__body">
          {filtered.length === 0 ? (
            <div className="pdg-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg><p>No photos match your filters.</p></div>
          ) : (
            <div className="pdg-grid pdg-grid--modal">{filtered.map((photo, i) => <PhotoCard key={photo.id || photo._id} photo={photo} onClick={() => onImageClick(filtered, i)} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Constants & pure helpers ────────────────────────────────────────────────
const TABS = [
  { id: 'details', label: 'Project Details' },
  { id: 'assign', label: 'Labour Assignment' },
  { id: 'assigned', label: 'Assigned Labour' },
  { id: 'photos', label: 'Daily Photos' },
  { id: 'timeline', label: 'Activity Timeline' },
];

function statusBadgeClass(status) {
  if (status === 'active') return 'badge badge-success';
  if (status === 'completed') return 'badge badge-info';
  return 'badge badge-danger';
}
function projectTypeBadgeClass(type) {
  if (type === 'universal') return 'badge badge-info';
  if (type === 'department_specific') return 'badge badge-success';
  return 'badge badge-danger';
}
function projectScopeLabel(project) {
  if (!project) return '—';
  if (project.projectType === 'department_specific') return project.department?.name || '—';
  if (project.projectType === 'division_specific') return project.division?.name || '—';
  return 'All divisions & departments';
}
function projectRestrictionText(project) {
  if (!project) return '';
  if (project.projectType === 'department_specific') return `Only labourers inside the gate and checked into ${project.department?.name || 'this department'} can be assigned.`;
  if (project.projectType === 'division_specific') return `Only labourers inside the gate in ${project.division?.name || 'this division'} can be assigned.`;
  return 'Any labourer currently inside the gate can be assigned.';
}
function timelineDotClass(type) {
  if (type === 'labour_removed' || type === 'project_on_hold') return 'badge-danger';
  if (type === 'labour_completed' || type === 'project_completed' || type === 'labour_seen_on_site') return 'badge-success';
  return 'badge-info';
}

// ─── Page entry point ────────────────────────────────────────────────────────
export default function ProjectWorkspacePage() {
  return (
    <Suspense fallback={<PageShell title="Project Workspace"><div className="pm-empty">Loading workspace…</div></PageShell>}>
      <WorkspaceContent />
    </Suspense>
  );
}

function WorkspaceContent() {
  const { can } = useAuth();
  const canWrite = can('projects', 'write');
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProjectId = params.projectId;
  const tabFromQuery = searchParams.get('tab') || '';

  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState(TABS.some((t) => t.id === tabFromQuery) ? tabFromQuery : 'details');
  const [eligible, setEligible] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [photoDays, setPhotoDays] = useState([]);
  const [photoWindow, setPhotoWindow] = useState(null);
  const [selectedPhotoDate, setSelectedPhotoDate] = useState('');
  const [dayPhotos, setDayPhotos] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);

  const [pdgSearch, setPdgSearch] = useState('');
  const [pdgDeptFilter, setPdgDeptFilter] = useState('');
  const [pdgDivFilter, setPdgDivFilter] = useState('');
  const [pdgEntryExitFilter, setPdgEntryExitFilter] = useState('');
  const [pdgTimeFilter, setPdgTimeFilter] = useState('');
  const [pdgShowAll, setPdgShowAll] = useState(false);
  const [pdgPreviewPhotos, setPdgPreviewPhotos] = useState(null);
  const [pdgPreviewIdx, setPdgPreviewIdx] = useState(0);
  const [pdgLoadingDay, setPdgLoadingDay] = useState(false);
  const photosCache = useRef({});

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [selectedEligible, setSelectedEligible] = useState(new Set());
  const [selectedAssigned, setSelectedAssigned] = useState(new Set());
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeAssigned = useMemo(() => assigned.filter((a) => a.assignmentStatus === 'active'), [assigned]);
  const completedAssigned = useMemo(() => assigned.filter((a) => a.assignmentStatus === 'completed'), [assigned]);
  const insideAssigned = useMemo(() => activeAssigned.filter((a) => a.gateStatus === 'Inside'), [activeAssigned]);
  const totalAssigned = selectedProject?.totalAssigned ?? assigned.length;
  const activeLabourers = selectedProject?.activeLabourers ?? activeAssigned.length;
  const completedLabourers = selectedProject?.completedLabourers ?? completedAssigned.length;
  const progressPct = totalAssigned > 0 ? Math.round((completedLabourers / totalAssigned) * 100) : 0;
  const showDeptFilter = selectedProject?.projectType !== 'department_specific';
  const showDivFilter = selectedProject?.projectType !== 'division_specific';

  // Load departments + divisions once
  useEffect(() => {
    Promise.all([
      api.departments.list({ isActive: 'true' }).catch(() => []),
      api.divisions.list({ isActive: 'true' }).catch(() => []),
    ]).then(([deps, divs]) => {
      setDepartments(Array.isArray(deps) ? deps : []);
      setDivisions(Array.isArray(divs) ? divs : []);
    });
  }, []);

  const refreshCore = useCallback(async (projectId) => {
    const [details, assignedRes] = await Promise.all([
      api.projects.get(projectId),
      api.projects.assignments(projectId),
    ]);
    setSelectedProject(details);
    setAssigned(assignedRes.assignments || []);
  }, []);

  const loadTabData = useCallback(async (projectId, tab, filters = {}) => {
    if (!projectId) return;
    setLoadingPanel(true);
    setError('');
    try {
      await refreshCore(projectId);
      if (tab === 'assign') {
        const params = {};
        if (filters.search) params.search = filters.search;
        if (filters.departmentId) params.departmentId = filters.departmentId;
        if (filters.divisionId) params.divisionId = filters.divisionId;
        const eligibleRes = await api.projects.eligibleLabourers(projectId, params);
        setEligible(eligibleRes.labourers || []);
        setSelectedEligible(new Set());
      }
      if (tab === 'assigned') { setSelectedAssigned(new Set()); }
      if (tab === 'timeline') { const r = await api.projects.activity(projectId); setTimeline(r.events || []); }
      if (tab === 'photos') {
        const daysRes = await api.projects.photoDays(projectId);
        setPhotoDays(daysRes.days || []);
        setPhotoWindow({ startDate: daysRes.startDate, endDate: daysRes.endDate, requiredDays: daysRes.requiredDays, today: daysRes.today });
        setSelectedPhotoDate((prev) => {
          if (prev && daysRes.days?.some((d) => d.photoDate === prev)) return prev;
          return daysRes.days?.find((d) => d.isToday)?.photoDate || daysRes.days?.find((d) => !d.isFuture)?.photoDate || daysRes.startDate || '';
        });
      }
    } catch (e) {
      if (e.status === 404) setNotFound(true);
      else setError(e.message);
    } finally { setLoadingPanel(false); }
  }, [refreshCore]);

  const loadDayPhotos = useCallback(async (projectId, photoDate, { force = false } = {}) => {
    if (!projectId || !photoDate) { setDayPhotos([]); return; }
    const cacheKey = `${projectId}:${photoDate}`;
    if (!force && photosCache.current[cacheKey]) { setDayPhotos(photosCache.current[cacheKey]); return; }
    setPdgLoadingDay(true);
    try {
      const res = await api.projects.photos(projectId, { date: photoDate });
      const photos = res.photos || [];
      photosCache.current[cacheKey] = photos;
      setDayPhotos(photos);
    } catch (e) { setError(e.message); setDayPhotos([]); }
    finally { setPdgLoadingDay(false); }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    const timer = setTimeout(() => {
      loadTabData(selectedProjectId, activeTab, { search, departmentId: departmentFilter, divisionId: divisionFilter });
    }, activeTab === 'assign' ? 250 : 0);
    return () => clearTimeout(timer);
  }, [selectedProjectId, activeTab, search, departmentFilter, divisionFilter, loadTabData]);

  useEffect(() => {
    if (activeTab !== 'photos' || !selectedProjectId || !selectedPhotoDate) return;
    loadDayPhotos(selectedProjectId, selectedPhotoDate);
  }, [activeTab, selectedProjectId, selectedPhotoDate, loadDayPhotos]);

  function toggleSet(setter, id) { setter((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function handleAssign() {
    if (!selectedProjectId || selectedEligible.size === 0) return;
    setAssigning(true); setError(''); setSuccess('');
    try {
      const result = await api.projects.assign(selectedProjectId, { labourIds: [...selectedEligible] });
      if (result.errors?.length && !result.assigned?.length) setError(result.errors.map((e) => e.error).join('; '));
      else setSuccess(`Assigned ${result.assigned?.length || 0} labourer(s)`);
      await loadTabData(selectedProjectId, activeTab, { search, departmentId: departmentFilter, divisionId: divisionFilter });
    } catch (e) { setError(e.message); } finally { setAssigning(false); }
  }

  async function handleRemoveSelected() {
    if (!selectedProjectId || selectedAssigned.size === 0) return;
    if (!confirm(`Remove ${selectedAssigned.size} labour assignment(s)?`)) return;
    setRemoving(true); setError(''); setSuccess('');
    try {
      const result = await api.projects.removeAssignments(selectedProjectId, { labourIds: [...selectedAssigned] });
      setSuccess(`Removed ${result.removed || 0} assignment(s)`);
      await loadTabData(selectedProjectId, activeTab);
    } catch (e) { setError(e.message); } finally { setRemoving(false); }
  }

  async function handleRemoveOne(labourId, labourName) {
    if (!confirm(`Remove "${labourName}" from this project?`)) return;
    setRemoving(true); setError('');
    try {
      await api.projects.removeAssignment(selectedProjectId, labourId);
      setSuccess(`Removed ${labourName}`);
      await loadTabData(selectedProjectId, activeTab);
    } catch (e) { setError(e.message); } finally { setRemoving(false); }
  }

  async function uploadPhotoFiles(files) {
    const list = [...files].filter(Boolean);
    if (!selectedProjectId || !selectedPhotoDate || list.length === 0) return;
    setUploadingPhotos(true); setError(''); setSuccess('');
    try {
      const result = await api.projects.uploadPhotos(selectedProjectId, list, selectedPhotoDate);
      const matched = (result.uploaded || []).reduce((sum, p) => sum + (p.matchedAssignedCount || 0), 0);
      const emptyFrames = (result.uploaded || []).filter((p) => p.storedWithoutFaces || (p.facesDetected || 0) === 0).length;
      setSuccess(`Uploaded ${result.count || 0} photo(s) for ${selectedPhotoDate}` + (matched ? ` · ${matched} assigned labourer(s) recognised` : '') + (emptyFrames ? ` · ${emptyFrames} frame(s) with no persons still stored` : ''));
      setShowCamera(false);
      const cacheKey = `${selectedProjectId}:${selectedPhotoDate}`;
      delete photosCache.current[cacheKey];
      await loadTabData(selectedProjectId, 'photos');
      await loadDayPhotos(selectedProjectId, selectedPhotoDate, { force: true });
    } catch (e) { setError(e.message); } finally { setUploadingPhotos(false); }
  }

  async function handleDeletePhoto(photoId) {
    if (!confirm('Delete this project photo?')) return;
    try {
      await api.projects.deletePhoto(selectedProjectId, photoId);
      setSuccess('Photo deleted');
      const cacheKey = `${selectedProjectId}:${selectedPhotoDate}`;
      delete photosCache.current[cacheKey];
      await loadTabData(selectedProjectId, 'photos');
      await loadDayPhotos(selectedProjectId, selectedPhotoDate, { force: true });
    } catch (e) { setError(e.message); }
  }

  function renderDetailsTab() {
    if (!selectedProject) return null;
    return (
      <div className="pm-tab-panel">
        <div className="pm-panel-header"><div><h3>Project Details</h3><p>Core information and assignment rules for this project</p></div></div>
        <div className="pm-details-grid">
          <div className="pm-detail-item"><div className="pm-detail-label">Project Name</div><div className="pm-detail-value">{selectedProject.projectName}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Status</div><div className="pm-detail-value"><span className={statusBadgeClass(selectedProject.status)}>{selectedProject.statusLabel}</span></div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Project Type</div><div className="pm-detail-value">{selectedProject.projectTypeLabel}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Scope</div><div className="pm-detail-value">{projectScopeLabel(selectedProject)}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Required Days</div><div className="pm-detail-value">{selectedProject.requiredDays}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Created Date</div><div className="pm-detail-value">{formatDate(selectedProject.createdAt)}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Created By</div><div className="pm-detail-value">{selectedProject.createdBy?.displayName || selectedProject.createdBy?.username || '—'}</div></div>
          <div className="pm-detail-item"><div className="pm-detail-label">Labour Totals</div><div className="pm-detail-value">{totalAssigned} assigned · {activeLabourers} active · {completedLabourers} completed</div></div>
          <div className="pm-detail-item pm-detail-item--full"><div className="pm-detail-label">Description</div><div className="pm-detail-value">{selectedProject.description?.trim() || 'No description provided.'}</div></div>
          <div className="pm-detail-item pm-detail-item--full"><div className="pm-detail-label">Assignment Restriction</div><div className="pm-detail-value">{projectRestrictionText(selectedProject)}</div></div>
        </div>
      </div>
    );
  }

  function renderAssignTab() {
    return (
      <div className="pm-tab-panel">
        <div className="pm-panel-header pm-panel-header--stack">
          <div><h3>Labour Assignment</h3><p>Eligible labourers currently inside the gate for this project type</p></div>
          <div className="pm-toolbar" role="group" aria-label="Labour filters">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search labour..." aria-label="Search labour" />
            {showDivFilter && (<select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} aria-label="Filter by division"><option value="">All divisions</option>{divisions.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>)}
            {showDeptFilter && (<select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} aria-label="Filter by department"><option value="">All departments</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>)}
            {canWrite && (<button type="button" className="btn-primary" disabled={assigning || selectedEligible.size === 0} onClick={handleAssign}>{assigning ? 'Assigning...' : `Assign (${selectedEligible.size})`}</button>)}
          </div>
        </div>
        {loadingPanel ? (<div className="pm-empty">Loading eligible labourers...</div>) : eligible.length === 0 ? (<div className="pm-empty">No eligible labourers available right now.</div>) : (
          <div className="table-scroll">
            <table className="reg-table">
              <thead><tr>{canWrite && <th style={{ width: 42 }}><input type="checkbox" checked={eligible.length > 0 && selectedEligible.size === eligible.length} onChange={(e) => setSelectedEligible(e.target.checked ? new Set(eligible.map((l) => l.labourId)) : new Set())} aria-label="Select all eligible" /></th>}<th>Labour ID</th><th>Labour Name</th><th>Division</th><th>Department</th><th>Entry Time</th><th>Gate Status</th></tr></thead>
              <tbody>{eligible.map((labour) => (<tr key={labour.labourId}>{canWrite && <td><input type="checkbox" checked={selectedEligible.has(labour.labourId)} onChange={() => toggleSet(setSelectedEligible, labour.labourId)} aria-label={`Select ${labour.labourName}`} /></td>}<td>{labour.registrationCode || labour.labourId.slice(-6)}</td><td className="name-cell">{labour.labourName}</td><td>{labour.divisionName || '—'}</td><td>{labour.departmentName || '—'}</td><td>{formatDateTime(labour.entryTime)}</td><td><span className="badge badge-success">{labour.gateStatus}</span></td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderAssignedTab() {
    return (
      <div className="pm-tab-panel">
        <div className="pm-panel-header">
          <div><h3>Assigned Labour</h3><p>Labourers currently allocated to this project</p></div>
          {canWrite && (<div className="pm-toolbar"><button type="button" className="btn-danger" disabled={removing || selectedAssigned.size === 0} onClick={handleRemoveSelected}>{removing ? 'Removing...' : `Remove (${selectedAssigned.size})`}</button></div>)}
        </div>
        {loadingPanel ? (<div className="pm-empty">Loading assignments...</div>) : assigned.length === 0 ? (<div className="pm-empty">No labourers assigned yet.</div>) : (
          <div className="table-scroll">
            <table className="reg-table">
              <thead><tr>{canWrite && <th style={{ width: 42 }}><input type="checkbox" checked={activeAssigned.length > 0 && selectedAssigned.size === activeAssigned.length} onChange={(e) => setSelectedAssigned(e.target.checked ? new Set(activeAssigned.map((a) => a.labourId)) : new Set())} aria-label="Select all assigned" /></th>}<th>Labour ID</th><th>Labour Name</th><th>Division</th><th>Department</th><th>Entry Time</th><th>Gate Status</th><th>Assignment</th>{canWrite && <th>Actions</th>}</tr></thead>
              <tbody>{assigned.map((row) => (<tr key={row.assignmentId}>{canWrite && <td>{row.assignmentStatus === 'active' ? <input type="checkbox" checked={selectedAssigned.has(row.labourId)} onChange={() => toggleSet(setSelectedAssigned, row.labourId)} aria-label={`Select ${row.labourName}`} /> : null}</td>}<td>{row.registrationCode || row.labourId.slice(-6)}</td><td className="name-cell">{row.labourName}</td><td>{row.divisionName || '—'}</td><td>{row.departmentName || '—'}</td><td>{formatDateTime(row.entryTime)}</td><td><span className={`badge ${row.gateStatus === 'Inside' ? 'badge-success' : 'badge-danger'}`}>{row.gateStatus}</span></td><td><span className={`badge ${row.assignmentStatus === 'active' ? 'badge-info' : 'badge-success'}`}>{row.assignmentStatus}</span></td>{canWrite && <td className="actions-cell">{row.assignmentStatus === 'active' && <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} disabled={removing} onClick={() => handleRemoveOne(row.labourId, row.labourName)}>Remove</button>}</td>}</tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const pdgFiltered = useMemo(() => {
    const q = pdgSearch.toLowerCase().trim();
    return dayPhotos.filter((p) => {
      if (q) { const n = (p.detections || []).map((d) => (d.labourName || '') + ' ' + (d.registrationCode || '')).join(' ').toLowerCase(); if (!n.includes(q)) return false; }
      if (pdgDeptFilter && !(p.detections || []).some((d) => d.roleName === pdgDeptFilter)) return false;
      if (pdgDivFilter && !(p.detections || []).some((d) => d.divisionName === pdgDivFilter)) return false;
      if (pdgEntryExitFilter && !(p.detections || []).some((d) => d.gateStatus === pdgEntryExitFilter)) return false;
      if (pdgTimeFilter) { const h = new Date(p.createdAt).getHours(); if (pdgTimeFilter === 'morning' && !(h >= 6 && h < 12)) return false; if (pdgTimeFilter === 'afternoon' && !(h >= 12 && h < 17)) return false; if (pdgTimeFilter === 'evening' && !(h >= 17 && h < 21)) return false; if (pdgTimeFilter === 'night' && !(h >= 21 || h < 6)) return false; }
      return true;
    });
  }, [dayPhotos, pdgSearch, pdgDeptFilter, pdgDivFilter, pdgEntryExitFilter, pdgTimeFilter]);

  function renderPhotosTab() {
    const selectedDay = photoDays.find((d) => d.photoDate === selectedPhotoDate);
    const totalPhotos = photoDays.reduce((s, d) => s + (d.photoCount || 0), 0);
    const todayDay = photoDays.find((d) => d.isToday);
    const currentDayIndex = todayDay?.dayIndex ?? photoDays.filter((d) => !d.isFuture).length;
    const visiblePhotos = pdgFiltered.slice(0, 8);
    const hasMore = pdgFiltered.length > 8;
    const deptOptions = [...new Set(dayPhotos.flatMap((p) => (p.detections || []).map((d) => d.roleName)).filter(Boolean))].sort();
    const divOptions = [...new Set(dayPhotos.flatMap((p) => (p.detections || []).map((d) => d.divisionName).filter(Boolean)))].sort();
    const laboursCapured = dayPhotos.reduce((s, p) => s + (p.matchedAssignedCount || 0), 0);
    return (
      <div className="pm-tab-panel">
        <div className="pdg-summary-bar">
          <div className="pdg-summary-item"><span className="pdg-summary-label">Project Duration</span><span className="pdg-summary-value">{photoWindow ? `${formatDate(photoWindow.startDate)} – ${formatDate(photoWindow.endDate)}` : '—'}</span></div>
          <div className="pdg-summary-item"><span className="pdg-summary-label">Total Days</span><span className="pdg-summary-value">{photoWindow?.requiredDays ?? photoDays.length}</span></div>
          <div className="pdg-summary-item"><span className="pdg-summary-label">Current Day</span><span className="pdg-summary-value">{currentDayIndex}</span></div>
          <div className="pdg-summary-item"><span className="pdg-summary-label">Total Photos</span><span className="pdg-summary-value">{totalPhotos}</span></div>
          <div className="pdg-summary-item"><span className="pdg-summary-label">Today&apos;s Photos</span><span className="pdg-summary-value">{todayDay?.photoCount ?? 0}</span></div>
        </div>
        <div className="pdg-layout">
          <aside className="pdg-timeline-col" aria-label="Project day timeline">
            {photoDays.length === 0 ? (<div className="pdg-empty-state pdg-empty-state--sm"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35"><rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg><p>No days available yet.</p></div>) : (
              <div className="pdg-day-list">
                {photoDays.map((day) => {
                  const isActive = day.photoDate === selectedPhotoDate;
                  const hasPhotos = day.photoCount > 0;
                  return (
                    <button key={day.photoDate} type="button"
                      className={['pdg-day-btn', isActive ? 'pdg-day-btn--active' : '', day.isToday ? 'pdg-day-btn--today' : '', day.isFuture ? 'pdg-day-btn--future' : '', hasPhotos ? 'pdg-day-btn--has-photos' : ''].filter(Boolean).join(' ')}
                      onClick={() => { setSelectedPhotoDate(day.photoDate); setPdgSearch(''); setPdgDeptFilter(''); setPdgDivFilter(''); setPdgEntryExitFilter(''); setPdgTimeFilter(''); }}
                      aria-pressed={isActive} disabled={day.isFuture} title={day.isFuture ? 'This day has not arrived yet' : undefined}>
                      <div className="pdg-day-btn__indicator">
                        {hasPhotos ? <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor" /></svg> : day.isFuture ? <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg> : <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.4" /></svg>}
                      </div>
                      <div className="pdg-day-btn__content">
                        <div className="pdg-day-btn__top"><span className="pdg-day-btn__number">Day {day.dayIndex}</span>{day.isToday && <span className="pdg-day-btn__today-chip">Today</span>}</div>
                        <div className="pdg-day-btn__date">{formatDate(day.photoDate)}</div>
                        <div className="pdg-day-btn__meta">{day.isFuture ? <span className="pdg-day-btn__future-label">Upcoming</span> : hasPhotos ? <span className="pdg-day-btn__count">{day.photoCount} photo{day.photoCount !== 1 ? 's' : ''}</span> : <span className="pdg-day-btn__empty-label">No photos</span>}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
          <section className="pdg-gallery-col">
            {!selectedDay ? (
              <div className="pdg-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" /><path d="M21 15l-5-5L5 21" /></svg><p>Select a day from the timeline to view photos.</p></div>
            ) : (
              <>
                <div className="pdg-gallery-header">
                  <div className="pdg-gallery-header__left"><div className="pdg-gallery-header__day">Day {selectedDay.dayIndex}</div><div className="pdg-gallery-header__date">{formatDate(selectedDay.photoDate)}</div></div>
                  <div className="pdg-gallery-header__stats">
                    <div className="pdg-stat"><span className="pdg-stat__label">Photos</span><span className="pdg-stat__value">{selectedDay.photoCount}</span></div>
                    <div className="pdg-stat"><span className="pdg-stat__label">Labours Captured</span><span className="pdg-stat__value">{laboursCapured}</span></div>
                  </div>
                  {canWrite && !selectedDay.isFuture && (
                    <div className="pdg-gallery-header__actions">
                      <button type="button" className="btn-secondary btn-sm" disabled={uploadingPhotos} onClick={() => setShowCamera((v) => !v)}>{showCamera ? 'Hide Camera' : 'Capture'}</button>
                      <button type="button" className="btn-primary btn-sm" disabled={uploadingPhotos} onClick={() => fileInputRef.current?.click()}>{uploadingPhotos ? 'Uploading…' : 'Upload'}</button>
                      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; if (f?.length) uploadPhotoFiles(f); e.target.value = ''; }} />
                    </div>
                  )}
                </div>
                {showCamera && canWrite && !selectedDay.isFuture && (
                  <div className="pm-camera-wrap" style={{ marginBottom: '1rem' }}>
                    <CameraCapture label="Capture site photo" processing={uploadingPhotos} processingLabel="Analysing faces…" defaultFacingMode="environment"
                      onCapture={async (blob) => { if (!blob) return; const file = new File([blob], `project-${selectedPhotoDate}.jpg`, { type: 'image/jpeg' }); await uploadPhotoFiles([file]); }} />
                  </div>
                )}
                {!selectedDay.isFuture && dayPhotos.length > 0 && (
                  <div className="pdg-filters">
                    <input type="search" className="pdg-filter-input" placeholder="Search labour…" value={pdgSearch} onChange={(e) => setPdgSearch(e.target.value)} aria-label="Search labour" />
                    {deptOptions.length > 0 && <select className="pdg-filter-select" value={pdgDeptFilter} onChange={(e) => setPdgDeptFilter(e.target.value)} aria-label="Department filter"><option value="">All Departments</option>{deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
                    {divOptions.length > 0 && <select className="pdg-filter-select" value={pdgDivFilter} onChange={(e) => setPdgDivFilter(e.target.value)} aria-label="Division filter"><option value="">All Divisions</option>{divOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
                    <select className="pdg-filter-select" value={pdgEntryExitFilter} onChange={(e) => setPdgEntryExitFilter(e.target.value)} aria-label="Gate status filter"><option value="">Entry / Exit</option><option value="inside">Inside</option><option value="outside">Outside</option></select>
                    <select className="pdg-filter-select" value={pdgTimeFilter} onChange={(e) => setPdgTimeFilter(e.target.value)} aria-label="Time filter"><option value="">All Times</option><option value="morning">Morning (6–12)</option><option value="afternoon">Afternoon (12–17)</option><option value="evening">Evening (17–21)</option><option value="night">Night</option></select>
                  </div>
                )}
                {selectedDay.isFuture ? (
                  <div className="pdg-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg><p>This day has not arrived yet.</p><span className="pdg-empty-state__sub">{formatDate(selectedDay.photoDate)}</span></div>
                ) : pdgLoadingDay ? (
                  <div className="pdg-photo-train">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="pdg-train-item pdg-train-item--skeleton">
                        <div className="pdg-train-item__rail"><div className="pdg-train-dot pdg-train-dot--skeleton" /><div className="pdg-train-line" /></div>
                        <div className="pdg-train-item__card pdg-train-item__card--skeleton">
                          <div className="pdg-train-skeleton__img" />
                          <div className="pdg-train-skeleton__body"><div className="pdg-skel pdg-skel--line pdg-skel--w60" /><div className="pdg-skel pdg-skel--line pdg-skel--w80" style={{ marginTop: 6 }} /><div className="pdg-skel pdg-skel--line pdg-skel--w50" style={{ marginTop: 6 }} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : dayPhotos.length === 0 ? (
                  <div className="pdg-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" /><path d="M21 15l-5-5L5 21" /></svg><p>No photos captured for this day yet.</p>{canWrite && <span className="pdg-empty-state__sub">Upload or capture photos using the buttons above.</span>}</div>
                ) : pdgFiltered.length === 0 ? (
                  <div className="pdg-empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg><p>No photos match your filters.</p></div>
                ) : (
                  <>
                    {/* ── Vertical train / timeline photo list ── */}
                    <div className="pdg-photo-train">
                      {visiblePhotos.map((photo, i) => {
                        const det = (photo.detections || []).find((d) => d.assignedToProject) || (photo.detections || [])[0] || null;
                        const isLast = i === visiblePhotos.length - 1 && !hasMore;
                        return (
                          <div key={photo.id || photo._id} className="pdg-train-item">
                            {/* Rail */}
                            <div className="pdg-train-item__rail">
                              <div className={`pdg-train-dot${det?.assignedToProject ? ' pdg-train-dot--assigned' : ' pdg-train-dot--default'}`} />
                              {!isLast && <div className="pdg-train-line" />}
                            </div>
                            {/* Card */}
                            <div
                              className="pdg-train-item__card"
                              role="button"
                              tabIndex={0}
                              onClick={() => { setPdgPreviewPhotos(pdgFiltered); setPdgPreviewIdx(i); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPdgPreviewPhotos(pdgFiltered); setPdgPreviewIdx(i); } }}
                              aria-label={`View photo from ${formatDateTime(photo.createdAt)}`}
                            >
                              <div className="pdg-train-item__thumb">
                                <TrainPhotoThumb photo={photo} />
                                <div className="pdg-train-item__badge-overlay"><VerificationBadge photo={photo} /></div>
                              </div>
                              <div className="pdg-train-item__body">
                                <div className="pdg-train-item__time">{formatDateTime(photo.createdAt)}</div>
                                {det ? (
                                  <>
                                    <div className="pdg-train-item__name">{det.labourName || '—'}</div>
                                    <div className="pdg-train-item__meta">
                                      {det.registrationCode && <span>{det.registrationCode}</span>}
                                      {det.divisionName && <span>{det.divisionName}</span>}
                                      {det.gateStatus && <span style={{ textTransform: 'capitalize' }}>{det.gateStatus}</span>}
                                    </div>
                                  </>
                                ) : (
                                  <div className="pdg-train-item__name pdg-train-item__name--empty">No person detected</div>
                                )}
                                <div className="pdg-train-item__footer">
                                  <span className="pdg-train-item__faces">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
                                    {photo.facesDetected || 0} face{photo.facesDetected !== 1 ? 's' : ''}
                                  </span>
                                  {photo.uploadedByName && <span className="pdg-train-item__by">By {photo.uploadedByName}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasMore && (<div className="pdg-show-more"><button type="button" className="btn-secondary" onClick={() => setPdgShowAll(true)}>Show All {pdgFiltered.length} Photos<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg></button></div>)}
                  </>
                )}
              </>
            )}
          </section>
        </div>
        {pdgShowAll && selectedDay && <ShowMoreModal photos={pdgFiltered} selectedDay={selectedDay} selectedProject={selectedProject} onClose={() => setPdgShowAll(false)} onImageClick={(photos, idx) => { setPdgPreviewPhotos(photos); setPdgPreviewIdx(idx); }} />}
        {pdgPreviewPhotos && <ImagePreviewModal photos={pdgPreviewPhotos} initialIndex={pdgPreviewIdx} onClose={() => setPdgPreviewPhotos(null)} />}
      </div>
    );
  }

  function renderTimelineTab() {
    return (
      <div className="pm-tab-panel">
        <div className="pm-panel-header"><div><h3>Activity Timeline</h3><p>Project creation and labour assignment history</p></div></div>
        {loadingPanel ? (<div className="pm-empty">Loading activity...</div>) : timeline.length === 0 ? (<div className="pm-empty">No activity recorded yet.</div>) : (
          <div className="pm-timeline">
            {timeline.map((event) => (
              <div key={event.id} className="pm-timeline-item">
                <div className="pm-timeline-rail"><span className={`pm-timeline-dot ${timelineDotClass(event.type)}`} style={{ background: event.type === 'labour_removed' || event.type === 'project_on_hold' ? 'var(--color-danger)' : event.type === 'labour_completed' || event.type === 'project_completed' || event.type === 'labour_seen_on_site' ? 'var(--color-success)' : 'var(--color-primary)' }} /></div>
                <div className="pm-timeline-body"><h4 className="pm-timeline-title">{event.title}</h4><p className="pm-timeline-desc">{event.description}</p><div className="pm-timeline-meta">{formatDateTime(event.at)}{event.actor ? ` · ${event.actor}` : ''}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Not found guard ──
  if (notFound) {
    return (
      <PageShell title="Project Not Found">
        <div className="pws-not-found">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
            <rect x="2" y="7" width="20" height="14" rx="3" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
          <p>Project not found or no longer accessible.</p>
          <button type="button" className="btn-secondary" onClick={() => router.push('/projects/maintenance')}>
            ← Back to Projects
          </button>
        </div>
      </PageShell>
    );
  }

  const progressPctDisplay = selectedProject?.progress?.completionPct ?? progressPct;

  return (
    <PageShell title="Project Workspace">

      {/* ── Workspace top bar ── */}
      <div className="pws-topbar">
        <button
          type="button"
          className="pws-back-btn"
          onClick={() => router.push('/projects/maintenance')}
          aria-label="Back to project list"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Projects
        </button>

        {selectedProject && (
          <div className="pws-topbar__meta">
            <div className="pws-topbar__name-row">
              <h1 className="pws-topbar__name">{selectedProject.projectName}</h1>
              <span className={`badge ${selectedProject.projectType === 'universal' ? 'badge-info' : selectedProject.projectType === 'department_specific' ? 'badge-success' : 'badge-warning'}`}>
                {selectedProject.projectTypeLabel}
              </span>
              <span className={`badge ${selectedProject.status === 'active' ? 'badge-success' : selectedProject.status === 'completed' ? 'badge-info' : 'badge-danger'}`}>
                {selectedProject.statusLabel}
              </span>
            </div>
            <div className="pws-topbar__stats">
              <span className="pws-topbar__stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {selectedProject.requiredDays} days
              </span>
              <span className="pws-topbar__stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                {totalAssigned} assigned
              </span>
              <span className="pws-topbar__stat pws-topbar__stat--accent">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                {insideAssigned.length} inside gate
              </span>
              <span className="pws-topbar__stat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                {completedLabourers} completed
              </span>
              <span className="pws-topbar__stat pws-topbar__stat--progress">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                {progressPctDisplay}% progress
                <span className="pws-topbar__progressbar">
                  <span className="pws-topbar__progressbar-fill" style={{ width: `${progressPctDisplay}%` }} />
                </span>
              </span>
            </div>
          </div>
        )}

        {!selectedProject && loadingPanel && (
          <div className="pws-topbar__loading">Loading workspace…</div>
        )}
      </div>

      {/* ── Progress strip removed — built into topbar ── */}

      {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p className="success-msg" style={{ marginBottom: '0.75rem' }}>{success}</p>}
      {!canWrite && selectedProject && (
        <p className="read-only-banner" style={{ marginBottom: '0.75rem' }}>View only — assignments require write access.</p>
      )}

      {/* ── Workspace body — full width, no sidebar ── */}
      {selectedProject ? (
        <div className="pws-body">
          <div className="pm-main-card">
            <div className="pm-tab-nav" role="tablist" aria-label="Project maintenance tabs">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
                  className={`pm-tab-btn${activeTab === tab.id ? ' pm-tab-btn--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                  {tab.id === 'assign' && <span className="pm-tab-count">{eligible.length}</span>}
                  {tab.id === 'assigned' && <span className="pm-tab-count">{assigned.length}</span>}
                  {tab.id === 'photos' && <span className="pm-tab-count">{photoDays.reduce((sum, d) => sum + (d.photoCount || 0), 0)}</span>}
                  {tab.id === 'timeline' && timeline.length > 0 && <span className="pm-tab-count">{timeline.length}</span>}
                </button>
              ))}
            </div>
            {activeTab === 'details' && renderDetailsTab()}
            {activeTab === 'assign' && renderAssignTab()}
            {activeTab === 'assigned' && renderAssignedTab()}
            {activeTab === 'photos' && renderPhotosTab()}
            {activeTab === 'timeline' && renderTimelineTab()}
          </div>
        </div>
      ) : !loadingPanel ? (
        <div className="pws-not-found">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
            <rect x="2" y="7" width="20" height="14" rx="3" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
          <p>Loading project workspace…</p>
        </div>
      ) : null}
    </PageShell>
  );
}
