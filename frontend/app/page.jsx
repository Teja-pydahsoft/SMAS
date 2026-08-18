'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import { Sparkline, BarChart, AreaChart, PieChart, ChartLegend } from '@/components/admin/AdminCharts';
import AdminIcon from '@/components/admin/AdminIcons';
import NotificationBell from '@/components/NotificationBell';

/* ── tiny helpers ── */
function fmt(n) { return Number(n || 0).toLocaleString(); }

/* ── Static demo data for sections not yet API-backed ── */
const ENTRY_TREND = [8, 14, 11, 22, 17, 26, 19, 31, 24, 28, 22, 35];
const DAILY_DATA   = [24, 18, 32, 27, 41, 36, 29];
const ACCURACY_AREA = [88, 91, 89, 93, 92, 96, 94, 97, 95, 98, 96, 99];

const QUICK_ACTIONS = [
  { id: 'register',    label: 'Register Person', icon: 'registrations', href: '/registrations/register', color: 'primary'   },
  { id: 'entry-exit',  label: 'Entry & Exit',    icon: 'entryExit',     href: '/entry-exit',             color: 'accent'    },
  { id: 'reports',     label: 'View Reports',    icon: 'reports',       href: '/reports',                color: 'secondary' },
  { id: 'roles',       label: 'Manage Roles',    icon: 'roles',         href: '/roles',                  color: 'success'   },
  { id: 'divisions',   label: 'Divisions',       icon: 'divisions',     href: '/divisions/manage',       color: 'warning'   },
  { id: 'departments', label: 'Departments',     icon: 'departments',   href: '/departments/manage',     color: 'danger'    },
  { id: 'system',      label: 'System Access',   icon: 'system',        href: '/system/users/manage',    color: 'primary'   },
  { id: 'registrations-manage', label: 'Manage Registrations', icon: 'face', href: '/registrations',    color: 'accent'    },
];

/* ── Metric card ── */
function MetricCard({ icon, iconColor, label, mobileLabel, value, trend, trendUp, sparkData, loading, href }) {
  const card = (
    <div className={`admin-metric-card admin-hover-lift admin-fade-in${href ? ' admin-metric-card--link' : ''}`}>
      <div className="admin-metric-card__head">
        <span className={`admin-metric-card__icon admin-metric-card__icon--${iconColor}`}>
          <AdminIcon name={icon} className="admin-icon" />
        </span>
        {trend != null && (
          <span className={`admin-metric-card__trend ${trendUp ? 'is-up' : 'is-down'}`}>
            {trendUp ? '▲' : '▼'} {trend}%
          </span>
        )}
      </div>
      <div className="admin-metric-card__label">
        <span className="admin-metric-card__label-desktop">{label}</span>
        <span className="admin-metric-card__label-mobile">{mobileLabel || label}</span>
      </div>
      <div className="admin-metric-card__value">
        {loading ? (
          <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: 60 }} />
        ) : (
          <AnimatedCounter value={value} />
        )}
      </div>
      <Sparkline data={sparkData} />
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link> : card;
}

/* ── Panel wrapper ── */
function Panel({ title, meta, children, className = '' }) {
  return (
    <div className={`admin-panel glass-panel admin-fade-in ${className}`}>
      <div className="admin-panel__head">
        <h2>{title}</h2>
        {meta && <span className="admin-panel__meta">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();


  /* data */
  const [health,        setHealth]        = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [gateLogs,      setGateLogs]      = useState([]);
  const [roles,         setRoles]         = useState([]);
  const [divisions,     setDivisions]     = useState([]);
  const [departments,   setDepartments]   = useState([]);
  const [gates,         setGates]         = useState([]);
  const [dashboardStats,setDashboardStats]= useState(null);
  const [loading,       setLoading]       = useState(true);
  const [personType,    setPersonType]    = useState('labour'); // 'labour' or 'visitor'
  const [breakdownBy,   setBreakdownBy]   = useState('division'); // 'division', 'batch', 'labourType'
  const [activeModalCard, setActiveModalCard] = useState(null); // null, 'registration', 'activity', 'distribution'
  const [selectedDay, setSelectedDay] = useState('all'); // 'all', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'



  // Fetch initial collections on mount
  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    Promise.all([
      api.health().catch(() => null),
      api.registrations.list().catch(() => []),
      api.gate.logs({ limit: 50 }).catch(() => []),
      api.roles.list().catch(() => []),
      api.divisions.list().catch(() => []),
      api.departments.list().catch(() => []),
      api.gates.list().catch(() => []),
    ]).then(([h, regs, logs, rl, divs, depts, gts]) => {
      setHealth(h);
      setRegistrations(Array.isArray(regs) ? regs : []);
      setGateLogs(Array.isArray(logs) ? logs : []);
      setRoles(Array.isArray(rl) ? rl : []);
      setDivisions(Array.isArray(divs) ? divs : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setGates(Array.isArray(gts) ? gts : []);
      setLoading(false);
    });
  }, [authLoading, user]);

  // Adjust breakdown if changing personType renders it invalid
  useEffect(() => {
    if (personType === 'visitor') {
      setBreakdownBy('division');
    }
  }, [personType]);

  // Fetch /api/dashboard stats dynamically when filter scope changes
  useEffect(() => {
    if (authLoading || !user || roles.length === 0) return;

    const labourRoleIds = roles
      .filter(r => (r?.name && r.name.toLowerCase().includes('labour')) || (r?.slug && r.slug.toLowerCase().includes('labour')))
      .map(r => r._id);
    const visitorRoleIds = roles
      .filter(r => (r?.name && (r.name.toLowerCase().includes('visitor') || r.name.toLowerCase().includes('guest'))) || (r?.slug && (r.slug.toLowerCase().includes('visitor') || r.slug.toLowerCase().includes('guest'))))
      .map(r => r._id);

    const activeRoleIds = personType === 'labour' ? labourRoleIds : visitorRoleIds;

    const params = {
      roleIds: activeRoleIds.join(','),
    };

    api.dashboard.stats(params)
      .then(stats => {
        setDashboardStats(stats);
      })
      .catch(() => setDashboardStats(null));
  }, [personType, roles, authLoading, user]);

  if (authLoading || !user) {
    return (
      <div className="dash-loading">
        <div className="dash-loading__spinner" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  // Derived filter matching role categories
  const labourRoleIdsStr = roles
    .filter(r => (r?.name && r.name.toLowerCase().includes('labour')) || (r?.slug && r.slug.toLowerCase().includes('labour')))
    .map(r => String(r._id));
  const visitorRoleIdsStr = roles
    .filter(r => (r?.name && (r.name.toLowerCase().includes('visitor') || r.name.toLowerCase().includes('guest'))) || (r?.slug && (r.slug.toLowerCase().includes('visitor') || r.slug.toLowerCase().includes('guest'))))
    .map(r => String(r._id));

  const activeFilterRoleIdsStr = personType === 'labour' ? labourRoleIdsStr : visitorRoleIdsStr;

  const filteredRegs = registrations.filter(r => {
    if (!r) return false;
    const roleIdVal = r.roleId?._id || r.roleId;
    return roleIdVal ? activeFilterRoleIdsStr.includes(String(roleIdVal)) : false;
  });

  const filteredLogs = gateLogs.filter(l => {
    if (!l) return false;
    const roleIdVal = l.roleId?._id || l.roleId;
    return roleIdVal ? activeFilterRoleIdsStr.includes(String(roleIdVal)) : false;
  });

  /* ── derived stats ── */
  const totalReg    = dashboardStats?.totalRegistrations ?? filteredRegs.length;
  const verified    = dashboardStats?.statusCounts?.verified ?? filteredRegs.filter(r => r?.status === 'verified').length;
  const pending     = dashboardStats?.statusCounts?.pending_verification ?? filteredRegs.filter(r => r?.status === 'pending_verification').length;
  const rejected    = dashboardStats?.statusCounts?.rejected ?? filteredRegs.filter(r => r?.status === 'rejected').length;
  const inProgress  = dashboardStats?.statusCounts?.in_progress ?? filteredRegs.filter(r => r?.status === 'in_progress').length;
  const aiOnline    = health?.services?.ai === 'online';
  const activeDivs  = divisions.filter(d => d?.isActive !== false).length;
  const activeDepts = departments.filter(d => d?.isActive !== false).length;
  const activeGates = gates.filter(g => g?.isActive !== false).length;
  const activeRoles = roles.filter(r => r?.isActive !== false && r?._id && activeFilterRoleIdsStr.includes(String(r._id))).length;

  /* today's gate logs */
  const today = new Date().toDateString();
  const todayLogs  = filteredLogs.filter(l => new Date(l.createdAt).toDateString() === today);
  const todayEntry = Number.isFinite(dashboardStats?.todayEntries)
    ? dashboardStats.todayEntries
    : todayLogs.filter(l => l.eventType === 'entry' && l.matched).length;
  const todayExit  = Number.isFinite(dashboardStats?.todayExits)
    ? dashboardStats.todayExits
    : todayLogs.filter(l => l.eventType === 'exit'  && l.matched).length;
  const insideNow  = Number.isFinite(dashboardStats?.insideNow)
    ? dashboardStats.insideNow
    : Math.max(todayEntry - todayExit, 0);

  // Sparkline data totals
  const sparklineRegistrationData = dashboardStats?.division?.weeklyRegistrationsSeries?.length
    ? dashboardStats.division.weeklyRegistrationsSeries[0].data
    : Array(7).fill(0);
  const sparklineEntryData = dashboardStats?.division?.weeklyEntriesSeries?.length
    ? dashboardStats.division.weeklyEntriesSeries[0].data
    : Array(7).fill(0);

  const weeklyRegistrationLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  
  const regDatasets = dashboardStats?.[breakdownBy]?.weeklyRegistrationsSeries || [];
  const currentWeekRegistrations = regDatasets.reduce((sum, ds) => sum + (ds.data || []).reduce((s, val) => s + val, 0), 0);

  const entryDatasets = dashboardStats?.[breakdownBy]?.weeklyEntriesSeries || [];
  const weeklyEntryLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  /* accuracy estimate from matchScore */
  const scoredLogs = filteredLogs.filter(l => l.matched && l.matchScore);
  const avgAcc = Number.isFinite(dashboardStats?.avgAcc)
    ? dashboardStats.avgAcc
    : (scoredLogs.length
        ? Math.round(scoredLogs.reduce((s, l) => s + l.matchScore * 100, 0) / scoredLogs.length)
        : 99);

  /* status distribution pie */
  const statusSegments = [
    { label: 'Verified',   value: verified,   color: '#22C55E' },
    { label: 'Pending',    value: pending,    color: '#F59E0B' },
    { label: 'Rejected',   value: rejected,   color: '#EF4444' },
    { label: 'In Progress',value: inProgress, color: '#60A5FA' },
  ].filter(s => s.value > 0);

  // Dynamic titles and labels for distribution pie chart
  const breakdownTitles = {
    division: 'Division Distribution',
    batch: 'Batch Distribution',
    labourType: 'Labour Type Distribution'
  };
  const distributionTitle = breakdownTitles[breakdownBy] || 'Category Distribution';
  const distSegments = dashboardStats?.[breakdownBy]?.distributionSeries || [];

  const BreakdownSelect = ({ value, onChange }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="dash-filter-select"
      style={{
        height: '28px',
        padding: '0 1.5rem 0 0.5rem',
        fontSize: '0.725rem',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        cursor: 'pointer'
      }}
    >
      <option value="division">Division</option>
      {personType === 'labour' && (
        <>
          <option value="batch">Batch</option>
          <option value="labourType">Labour Type</option>
        </>
      )}
    </select>
  );

  const cardMeta = (labelText, key) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      <span className="admin-panel__meta" style={{ margin: 0 }}>{labelText}</span>
      <button
        type="button"
        onClick={() => {
          setSelectedDay('all');
          setActiveModalCard(key);
        }}
        style={{
          background: 'var(--color-primary-subtle, rgba(26, 86, 255, 0.08))',
          border: 'none',
          color: 'var(--color-primary, #1A56FF)',
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 'var(--radius-md, 6px)',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap'
        }}
        className="admin-hover-lift"
      >
        View Details
      </button>
    </div>
  );

  const sharedBreakdownMeta = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)' }}>BREAKDOWN:</span>
      <BreakdownSelect value={breakdownBy} onChange={setBreakdownBy} />
    </div>
  );

  return (
    <div className="dash-scroll-area">
      <div className="admin-dashboard">

        {/* ─── TOP BAR ─── */}
        <section className="admin-fade-in admin-dashboard-topbar">
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Dashboard</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Welcome back, {user.displayName}
            </p>
          </div>
          <div className="admin-dashboard-topbar__actions">
            <select
              value={personType}
              onChange={(e) => setPersonType(e.target.value)}
              className="dash-scope-select"
              aria-label="Filter stats scope"
            >
              <option value="labour">Labours</option>
              <option value="visitor">Visitors</option>
            </select>
            <NotificationBell />
          </div>
        </section>

        {/* ─── METRICS GRID ─── */}
        <section className="admin-metrics-grid">
          <MetricCard icon="registrations" iconColor="primary"   label="Total Registrations" mobileLabel="Registrations" value={totalReg}    sparkData={sparklineRegistrationData} loading={loading} href="/registrations" />
          <MetricCard icon="entryExit"     iconColor="accent"    label="Today's Entries"      mobileLabel="Entries"       value={todayEntry} sparkData={sparklineEntryData} loading={loading} href="/reports" />
          <MetricCard icon="shield"        iconColor="secondary" label="Currently Inside"      mobileLabel="Inside"        value={insideNow}  sparkData={DAILY_DATA.slice(0,5)} loading={loading} />
          <MetricCard icon="divisions"     iconColor="primary"   label="Active Divisions"     mobileLabel="Divisions"     value={activeDivs}  sparkData={[3,3,4,4,5,activeDivs]} loading={loading} href="/divisions/manage" />
          <MetricCard icon="departments"   iconColor="accent"    label="Departments"           mobileLabel="Departments"   value={activeDepts} sparkData={[4,6,7,8,activeDepts]} loading={loading} href="/departments/manage" />
          <MetricCard icon="cameras"       iconColor="success"   label="Active Gates"          mobileLabel="Gates"         value={activeGates} sparkData={[1,2,activeGates]} loading={loading} href="/divisions/manage" />
          <MetricCard icon="roles"         iconColor="secondary" label="Registration Roles"    mobileLabel="Roles"         value={activeRoles} sparkData={[1,1,2,activeRoles]} loading={loading} href="/roles" />
          <MetricCard icon="face"          iconColor="primary"   label="AI Accuracy"           mobileLabel="Accuracy"      value={avgAcc}     trend={2} trendUp sparkData={ACCURACY_AREA} loading={loading} />
        </section>

        {/* ─── PERFORMANCE BREAKDOWN SECTION ─── */}
        <section className="admin-fade-in admin-breakdown-section-container glass-panel">
          <div className="admin-breakdown-section-header">
            <div>
              <h2 className="admin-breakdown-section-title">Performance Analytics</h2>
              <span className="admin-panel__meta">Weekly registration trend, daily entry activity, and category distribution</span>
            </div>
            {sharedBreakdownMeta}
          </div>
          <div className="admin-breakdown-section-grid">
            {/* Area chart — registration trend */}
            <Panel title="Weekly Registration Trend" meta={!loading && cardMeta("Current week", "registration")} className="admin-breakdown-card">
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px' }}>
                  <div className="dash-loading__spinner" />
                </div>
              ) : (
                <>
                  <div className="admin-stat-highlight">
                    <AnimatedCounter value={currentWeekRegistrations} /><span>registrations this week</span>
                  </div>
                  <AreaChart datasets={regDatasets} labels={weeklyRegistrationLabels} showLegend={false} />
                </>
              )}
            </Panel>

            {/* Bar chart — daily entries */}
            <Panel title="Daily Activity" meta={!loading && cardMeta("This week", "activity")} className="admin-breakdown-card">
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px' }}>
                  <div className="dash-loading__spinner" />
                </div>
              ) : (
                <>
                  <div className="admin-stat-highlight">
                    <AnimatedCounter value={todayEntry} /><span>today's entries</span>
                  </div>
                  <BarChart datasets={entryDatasets} labels={weeklyEntryLabels} showLegend={false} />
                </>
              )}
            </Panel>

            {/* Pie — category distribution */}
            <Panel title={distributionTitle} meta={!loading && cardMeta("Total breakdown", "distribution")} className="admin-breakdown-card">
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px' }}>
                  <div className="dash-loading__spinner" />
                </div>
              ) : distSegments.length ? (
                <PieChart segments={distSegments} showLegend={false} />
              ) : (
                <p className="admin-empty-note">No data yet</p>
              )}
            </Panel>
          </div>
        </section>

        {/* ─── OTHER ANALYTICS ROW ─── */}
        <section className="admin-section-grid admin-section-grid--analytics">
          {/* Pie — registration status */}
          <Panel title="Registration Status" meta={`${totalReg} total`}>
            {statusSegments.length ? (
              <PieChart segments={statusSegments} />
            ) : (
              <p className="admin-empty-note">No registrations yet</p>
            )}
          </Panel>

          {/* AI accuracy area */}
          <Panel title="Face Recognition Accuracy" meta="Monthly trend">
            <div className="admin-stat-highlight">
              <AnimatedCounter value={avgAcc} suffix="%" /><span>avg match confidence</span>
            </div>
            <AreaChart data={ACCURACY_AREA} />
          </Panel>

          {/* Monthly report list */}
          <Panel title="System Overview" meta="Live stats">
            <ul className="admin-monthly-list">
              {[
                { label: 'Verified Registrations', value: verified,    color: 'var(--success)' },
                { label: 'Pending Approvals',       value: pending,     color: 'var(--warning)' },
                { label: 'Rejected',                value: rejected,    color: 'var(--danger)'  },
                { label: 'Today Gate Entries',      value: todayEntry,  color: 'var(--accent)'  },
                { label: 'Today Gate Exits',         value: todayExit,   color: 'var(--primary)' },
                { label: 'Total Gate Logs',          value: gateLogs.length, color: 'var(--secondary)' },
              ].map(row => (
                <li key={row.label} className="admin-monthly-list__item">
                  <span>{row.label}</span>
                  <strong style={{ color: row.color }}>{fmt(row.value)}</strong>
                </li>
              ))}
            </ul>
          </Panel>
        </section>



        {/* ─── QUICK ACTIONS ─── */}
        <section className="admin-quick-actions glass-panel admin-fade-in">
          <div className="admin-panel__head">
            <h2>Quick Actions</h2>
            <span className="admin-panel__meta">Shortcuts to key features</span>
          </div>
          <div className="admin-quick-actions__grid">
            {QUICK_ACTIONS.map(a => (
              <Link key={a.id} href={a.href} className="admin-quick-action admin-hover-lift">
                <span className={`admin-metric-card__icon admin-metric-card__icon--${a.color}`}>
                  <AdminIcon name={a.icon} className="admin-icon" />
                </span>
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── WIDGETS ROW ─── */}
        <section className="admin-widgets-grid">
          <div className="admin-widget glass-panel">
            <h3>AI Recognition</h3>
            <div className={`admin-widget__value ${avgAcc >= 90 ? 'is-good' : 'is-bad'}`}>
              {avgAcc}%
            </div>
            <div className="admin-progress"><span style={{ width: `${avgAcc}%` }} /></div>
            <p className="admin-widget__meta">{scoredLogs.length} scans analysed</p>
          </div>

          <div className="admin-widget glass-panel">
            <h3>Storage / DB</h3>
            <div className="admin-widget__value is-good">{fmt(totalReg)}</div>
            <div className="admin-progress"><span style={{ width: `${Math.min((totalReg / 500) * 100, 100)}%` }} /></div>
            <p className="admin-widget__meta">registrations in MongoDB</p>
          </div>

          <div className="admin-widget glass-panel">
            <h3>Active Gates</h3>
            <div className="admin-widget__value">{activeGates}</div>
            <div className="admin-progress"><span style={{ width: `${Math.min((activeGates / (gates.length || 1)) * 100, 100)}%` }} /></div>
            <p className="admin-widget__meta">{gates.length} gates total</p>
          </div>

          <div className="admin-widget glass-panel">
            <h3>Today's Activity</h3>
            <div className="admin-widget__value">{todayEntry + todayExit}</div>
            <div className="admin-progress"><span style={{ width: `${Math.min(((todayEntry + todayExit) / 100) * 100, 100)}%` }} /></div>
            <p className="admin-widget__meta">{todayEntry} entries · {todayExit} exits</p>
          </div>
        </section>



        {/* ─── FOOTER ─── */}
        <footer className="dash-footer">
          <span>SAMS — Smart Access Management System</span>
          <span>Super Admin · {user.displayName}</span>
        </footer>

        {/* ─── DETAILED BREAKDOWN MODAL POPUP ─── */}
        {activeModalCard && (() => {
          const selectedDayIdx = selectedDay === 'all' ? null : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(selectedDay);
          const DaySelect = () => (
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '0.725rem',
                fontWeight: 'bold',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                outline: 'none',
                background: 'var(--surface-base, #ffffff)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Days</option>
              <option value="Sat">Saturday</option>
              <option value="Sun">Sunday</option>
              <option value="Mon">Monday</option>
              <option value="Tue">Tuesday</option>
              <option value="Wed">Wednesday</option>
              <option value="Thu">Thursday</option>
              <option value="Fri">Friday</option>
            </select>
          );

          return (
            <div className="admin-modal-overlay" onClick={() => setActiveModalCard(null)}>
              <div className="admin-modal-container glass-panel admin-fade-in" onClick={(e) => e.stopPropagation()}>
                <div className="admin-modal-header">
                  <h2>
                    {activeModalCard === 'registration' && 'Weekly Registration Trend Detail'}
                    {activeModalCard === 'activity' && 'Daily Activity Detail'}
                    {activeModalCard === 'distribution' && distributionTitle}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', marginRight: '16px' }}>
                    {activeModalCard !== 'distribution' && <DaySelect />}
                  </div>
                  <button type="button" className="admin-modal-close" onClick={() => setActiveModalCard(null)} aria-label="Close modal">&times;</button>
                </div>
                <div className="admin-modal-body">
                  {activeModalCard === 'registration' && (() => {
                    const displayRegCount = typeof selectedDayIdx === 'number'
                      ? regDatasets.reduce((sum, ds) => sum + (ds.data?.[selectedDayIdx] || 0), 0)
                      : currentWeekRegistrations;
                    return (
                      <div className="admin-chart-modal-layout">
                        <div className="admin-chart-modal-main">
                          <div className="admin-stat-highlight" style={{ marginBottom: '1rem' }}>
                            <AnimatedCounter value={displayRegCount} />
                            <span>registrations {selectedDay === 'all' ? 'this week' : `on ${selectedDay}`}</span>
                          </div>
                          <AreaChart datasets={regDatasets} labels={weeklyRegistrationLabels} showLegend={false} />
                        </div>
                        <div className="admin-chart-modal-legend-container">
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Categories</h4>
                          <ChartLegend datasets={regDatasets} selectedDayIndex={selectedDayIdx} />
                        </div>
                      </div>
                    );
                  })()}
                  {activeModalCard === 'activity' && (() => {
                    const totalWeekEntries = entryDatasets.reduce((sum, ds) => sum + (ds.data || []).reduce((s, v) => s + v, 0), 0);
                    const displayEntryCount = typeof selectedDayIdx === 'number'
                      ? entryDatasets.reduce((sum, ds) => sum + (ds.data?.[selectedDayIdx] || 0), 0)
                      : totalWeekEntries;
                    return (
                      <div className="admin-chart-modal-layout">
                        <div className="admin-chart-modal-main">
                          <div className="admin-stat-highlight" style={{ marginBottom: '1rem' }}>
                            <AnimatedCounter value={displayEntryCount} />
                            <span>entries {selectedDay === 'all' ? 'this week' : `on ${selectedDay}`}</span>
                          </div>
                          <BarChart datasets={entryDatasets} labels={weeklyEntryLabels} showLegend={false} />
                        </div>
                        <div className="admin-chart-modal-legend-container">
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Categories</h4>
                          <ChartLegend datasets={entryDatasets} selectedDayIndex={selectedDayIdx} />
                        </div>
                      </div>
                    );
                  })()}
                  {activeModalCard === 'distribution' && (() => {
                    const distTotal = distSegments.reduce((sum, item) => sum + item.value, 0) || 1;
                    return (
                      <div className="admin-chart-modal-layout">
                        <div className="admin-chart-modal-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <PieChart segments={distSegments} showLegend={false} />
                        </div>
                        <div className="admin-chart-modal-legend-container">
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Categories</h4>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: 0, margin: 0, listStyle: 'none' }}>
                            {distSegments.map((item) => (
                              <li key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                                  {item.value} ({Math.round((item.value / distTotal) * 100)}%)
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
