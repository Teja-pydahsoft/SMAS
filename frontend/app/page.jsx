'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import { Sparkline, BarChart, AreaChart, PieChart } from '@/components/admin/AdminCharts';
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
function MetricCard({ icon, iconColor, label, value, trend, trendUp, sparkData, loading, href }) {
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
      <div className="admin-metric-card__label">{label}</div>
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
      api.dashboard.stats().catch(() => null),
    ]).then(([h, regs, logs, rl, divs, depts, gts, stats]) => {
      setHealth(h);
      setRegistrations(Array.isArray(regs) ? regs : []);
      setGateLogs(Array.isArray(logs) ? logs : []);
      setRoles(Array.isArray(rl) ? rl : []);
      setDivisions(Array.isArray(divs) ? divs : []);
      setDepartments(Array.isArray(depts) ? depts : []);
      setGates(Array.isArray(gts) ? gts : []);
      setDashboardStats(stats);
      setLoading(false);
    });
  }, [authLoading, user]);

  if (authLoading || !user) {
    return (
      <div className="dash-loading">
        <div className="dash-loading__spinner" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  /* ── derived stats ── */
  const totalReg    = registrations.length;
  const verified    = registrations.filter(r => r.status === 'verified').length;
  const pending     = registrations.filter(r => r.status === 'pending_verification').length;
  const rejected    = registrations.filter(r => r.status === 'rejected').length;
  const inProgress  = registrations.filter(r => r.status === 'in_progress').length;
  const aiOnline    = health?.services?.ai === 'online';
  const activeDivs  = divisions.filter(d => d.isActive !== false).length;
  const activeDepts = departments.filter(d => d.isActive !== false).length;
  const activeGates = gates.filter(g => g.isActive !== false).length;
  const activeRoles = roles.filter(r => r.isActive !== false).length;

  /* today's gate logs */
  const today = new Date().toDateString();
  const todayLogs  = gateLogs.filter(l => new Date(l.createdAt).toDateString() === today);
  const todayEntry = Number.isFinite(dashboardStats?.todayEntries)
    ? dashboardStats.todayEntries
    : todayLogs.filter(l => l.eventType === 'entry' && l.matched).length;
  const todayExit  = todayLogs.filter(l => l.eventType === 'exit'  && l.matched).length;
  const insideNow  = Math.max(todayEntry - todayExit, 0);

  const weeklyRegistrationData = dashboardStats?.weeklyRegistrations?.length
    ? dashboardStats.weeklyRegistrations.map(item => item.count)
    : Array(7).fill(0);
  const weeklyRegistrationLabels = dashboardStats?.weeklyRegistrations?.length
    ? dashboardStats.weeklyRegistrations.map(item => item.label)
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const currentWeekRegistrations = weeklyRegistrationData.reduce((sum, count) => sum + count, 0);
  const weeklyEntryData = dashboardStats?.weeklyEntries?.length
    ? dashboardStats.weeklyEntries.map(item => item.count)
    : Array(7).fill(0);
  const weeklyEntryLabels = dashboardStats?.weeklyEntries?.length
    ? dashboardStats.weeklyEntries.map(item => item.label)
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* accuracy estimate from matchScore */
  const scoredLogs = gateLogs.filter(l => l.matched && l.matchScore);
  const avgAcc = scoredLogs.length
    ? Math.round(scoredLogs.reduce((s, l) => s + l.matchScore * 100, 0) / scoredLogs.length)
    : 99;

  /* role distribution pie */
  const roleMap = {};
  registrations.forEach(r => {
    const name = r.roleId?.name || 'Unknown';
    roleMap[name] = (roleMap[name] || 0) + 1;
  });
  const PIE_COLORS = ['#2563EB','#60A5FA','#0EA5E9','#22C55E','#F59E0B','#EF4444'];
  const roleSegments = Object.entries(roleMap).slice(0, 6).map(([label, value], i) => ({
    label, value, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  /* status distribution pie */
  const statusSegments = [
    { label: 'Verified',   value: verified,   color: '#22C55E' },
    { label: 'Pending',    value: pending,    color: '#F59E0B' },
    { label: 'Rejected',   value: rejected,   color: '#EF4444' },
    { label: 'In Progress',value: inProgress, color: '#60A5FA' },
  ].filter(s => s.value > 0);

  return (
    <div className="dash-scroll-area">
      <div className="admin-dashboard">

        {/* ─── TOP BAR ─── */}
        <section
          className="admin-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Dashboard</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Welcome back, {user.displayName}
            </p>
          </div>
          <NotificationBell />
        </section>

        {/* ─── METRICS GRID ─── */}
        <section className="admin-metrics-grid">
          <MetricCard icon="registrations" iconColor="primary"   label="Total Registrations" value={totalReg}    sparkData={weeklyRegistrationData} loading={loading} href="/registrations" />
          <MetricCard icon="approvals"     iconColor="success"   label="Verified Users"       value={verified}   trend={8}  trendUp sparkData={ENTRY_TREND.map(v=>v*0.7)} loading={loading} href="/registrations" />
          <MetricCard icon="alert"         iconColor="warning"   label="Pending Approvals"    value={pending}    trend={pending > 5 ? 3 : undefined} trendUp={false} sparkData={DAILY_DATA} loading={loading} href="/registrations" />
          <MetricCard icon="entryExit"     iconColor="accent"    label="Today's Entries"      value={todayEntry} sparkData={weeklyEntryData} loading={loading} href="/reports" />
          <MetricCard icon="shield"        iconColor="secondary" label="Currently Inside"      value={insideNow}  sparkData={DAILY_DATA.slice(0,5)} loading={loading} />
          <MetricCard icon="divisions"     iconColor="primary"   label="Active Divisions"     value={activeDivs}  sparkData={[3,3,4,4,5,activeDivs]} loading={loading} href="/divisions/manage" />
          <MetricCard icon="departments"   iconColor="accent"    label="Departments"           value={activeDepts} sparkData={[4,6,7,8,activeDepts]} loading={loading} href="/departments/manage" />
          <MetricCard icon="cameras"       iconColor="success"   label="Active Gates"          value={activeGates} sparkData={[1,2,activeGates]} loading={loading} href="/divisions/manage" />
          <MetricCard icon="roles"         iconColor="secondary" label="Registration Roles"    value={activeRoles} sparkData={[1,1,2,activeRoles]} loading={loading} href="/roles" />
          <MetricCard icon="face"          iconColor="primary"   label="AI Accuracy"           value={avgAcc}     trend={2} trendUp sparkData={ACCURACY_AREA} loading={loading} />
        </section>

        {/* ─── ANALYTICS ROW ─── */}
        <section className="admin-section-grid admin-section-grid--analytics">

          {/* Area chart — entry trend */}
          <Panel title="Weekly Registration Trend" meta="Current week">
            <div className="admin-stat-highlight">
              <AnimatedCounter value={currentWeekRegistrations} /><span>registrations this week</span>
            </div>
            <AreaChart data={weeklyRegistrationData} labels={weeklyRegistrationLabels} />
          </Panel>

          {/* Bar chart — daily */}
          <Panel title="Daily Activity" meta="This week">
            <div className="admin-stat-highlight">
              <AnimatedCounter value={todayEntry} /><span>today's entries</span>
            </div>
            <BarChart data={weeklyEntryData} labels={weeklyEntryLabels} />
          </Panel>

          {/* Pie — registration status */}
          <Panel title="Registration Status" meta={`${totalReg} total`}>
            {statusSegments.length ? (
              <PieChart segments={statusSegments} />
            ) : (
              <p className="admin-empty-note">No registrations yet</p>
            )}
          </Panel>

          {/* Pie — role distribution */}
          <Panel title="Role Distribution" meta={`${activeRoles} active roles`}>
            {roleSegments.length ? (
              <PieChart segments={roleSegments} />
            ) : (
              <p className="admin-empty-note">No data yet</p>
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

      </div>
    </div>
  );
}
