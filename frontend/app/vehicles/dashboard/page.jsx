"use client";

import React, { useState, useEffect, useCallback } from 'react';
import AnimatedCounter from '@/components/admin/AnimatedCounter';
import AdminIcon from '@/components/admin/AdminIcons';
import PageShell from '@/components/PageShell';
import Link from 'next/link';

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

function MetricCard({ icon, iconColor, label, value, loading, trend }) {
  return (
    <div className="admin-metric-card admin-hover-lift admin-fade-in" style={{ padding: '1.5rem' }}>
      <div className="admin-metric-card__head" style={{ marginBottom: '1rem' }}>
        <span className={`admin-metric-card__icon admin-metric-card__icon--${iconColor}`}>
          <AdminIcon name={icon} className="admin-icon" />
        </span>
        {trend && (
          <span className="admin-metric-card__trend is-up" style={{ fontSize: '0.875rem' }}>
            {trend}
          </span>
        )}
      </div>
      <div className="admin-metric-card__label" style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div className="admin-metric-card__value" style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
        {loading ? (
          <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: '60px' }} />
        ) : (
          <AnimatedCounter value={value} />
        )}
      </div>
    </div>
  );
}

// Simple CSS Donut Chart
function DonutChart({ data, colors }) {
  if (!data || data.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No Data Available</div>;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Zero Records</div>;

  let currentAngle = 0;
  const segments = data.map((item, i) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...item, startAngle, angle, color: colors[i % colors.length] };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: '150px', height: '150px', borderRadius: '50%', background: `conic-gradient(${segments.map(s => `${s.color} ${s.startAngle}deg ${s.startAngle + s.angle}deg`).join(', ')})` }}>
        <div style={{ position: 'absolute', inset: '25px', backgroundColor: 'var(--surface-base)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{total}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: s.color }}></div>
              <span style={{ fontSize: '0.875rem' }}>{s.label}</span>
            </div>
            <span style={{ fontWeight: 'bold' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple CSS Bar Chart
function BarChart({ data, color = 'var(--primary)' }) {
  if (!data || data.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No Data Available</div>;
  
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span>{item.label}</span>
            <span style={{ fontWeight: 'bold' }}>{item.value} ({Math.round((item.value / max) * 100) || 0}%)</span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--surface-sunken)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: '4px' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VehicleDashboardPage() {
  const [stats, setStats] = useState({
    total: 0, active: 0, inside: 0, pending: 0, todayEntries: 0, todayExits: 0, types: [], statuses: []
  });
  const [movements, setMovements] = useState([]);
  const [insideVehicles, setInsideVehicles] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const { api } = await import('@/lib/api/client');
      
      const [dashboardStats, recentMovements, insideList, recentRegs] = await Promise.all([
        api.vehicles.dashboardStats().catch(() => null),
        api.vehicles.movements({ limit: 5 }).catch(() => ({ data: [] })),
        api.vehicles.movements({ status: 'Inside', limit: 5 }).catch(() => ({ data: [] })),
        api.vehicles.registrations.list({ limit: 5 }).catch(() => ({ data: [] }))
      ]);

      if (dashboardStats) setStats(dashboardStats);
      if (recentMovements?.data) setMovements(recentMovements.data);
      if (insideList?.data) setInsideVehicles(insideList.data);
      if (recentRegs?.data) setRegistrations(recentRegs.data);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const statusData = stats.statuses.map(s => ({ label: s.status, value: s.count }));
  const typeData = stats.types.map(t => ({ label: t.name, value: t.count })).sort((a,b) => b.value - a.value);

  const headerActions = (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button className="admin-btn admin-btn--secondary" onClick={fetchDashboardData} disabled={loading}>
        <AdminIcon name="theme" style={{ width: '16px', height: '16px', display: 'inline-block' }} /> Refresh
      </button>
      <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary">
        + Register Vehicle
      </Link>
    </div>
  );

  return (
    <PageShell 
      title="Vehicle Dashboard" 
      description="Monitor registered vehicles, movement activity and fleet status."
      headerActions={headerActions}
    >
      {/* ─── METRICS GRID ─── */}
      <section className="admin-fade-in vehicle-metrics-grid">
        <MetricCard icon="vehicles" iconColor="primary" label="Total Vehicles" value={stats.total} loading={loading} />
        <MetricCard icon="shield" iconColor="success" label="Active Vehicles" value={stats.active} loading={loading} />
        <MetricCard icon="entryExit" iconColor="warning" label="Vehicles Inside" value={stats.inside} loading={loading} trend="Live" />
        <MetricCard icon="entryExit" iconColor="primary" label="Today's Entries" value={stats.todayEntries} loading={loading} />
        <MetricCard icon="entryExit" iconColor="secondary" label="Today's Exits" value={stats.todayExits} loading={loading} />
        <MetricCard icon="registrations" iconColor={stats.pending > 0 ? "danger" : "secondary"} label="Pending Reg" value={stats.pending} loading={loading} />
      </section>

      {/* ─── CHARTS ─── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Panel title="Vehicle Status Overview">
          {loading ? (
             <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : (
            <DonutChart data={statusData} colors={['var(--success)', 'var(--danger)', 'var(--warning)', 'var(--text-muted)']} />
          )}
        </Panel>
        
        <Panel title="Vehicle Type Distribution">
          {loading ? (
             <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : (
            <BarChart data={typeData.slice(0, 5)} color="var(--primary)" />
          )}
        </Panel>
      </section>

      {/* ─── ACTIVITY & INSIDE ─── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Panel title="Live Vehicle Activity" meta={<Link href="/vehicles/reports" style={{fontSize:'0.875rem'}}>View All</Link>} className="min-w-0" style={{ minWidth: 0 }}>
          <div className="admin-table-container" style={{ overflowX: 'auto' }}>
            <table className="admin-table vehicle-dash-table--activity">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Type</th>
                  <th>Dir</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading feed...</td></tr>
                ) : movements.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No vehicle movement activity available.</td></tr>
                ) : (
                  movements.map(m => (
                    <tr key={m._id}>
                      <td style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{m.vehicleId?.plateNumber || 'Unknown'}</td>
                      <td>{m.vehicleId?.typeId?.name || 'N/A'}</td>
                      <td>{m.inTime && m.outTime && m.status === 'Exited' ? 'Exit' : 'Entry'}</td>
                      <td>{new Date(m.inTime && m.outTime && m.status === 'Exited' ? m.outTime : m.inTime).toLocaleTimeString()}</td>
                      <td><span className={`admin-badge admin-badge--${m.status === 'Inside' ? 'success' : 'secondary'}`}>{m.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Vehicles Currently Inside" className="min-w-0" style={{ minWidth: 0 }}>
          <div className="admin-table-container" style={{ overflowX: 'auto' }}>
            <table className="admin-table vehicle-dash-table--inside">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Type</th>
                  <th>Entry Time</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                ) : insideVehicles.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No vehicles currently inside.</td></tr>
                ) : (
                  insideVehicles.map(m => (
                    <tr key={m._id}>
                      <td style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{m.vehicleId?.plateNumber || 'Unknown'}</td>
                      <td>{m.vehicleId?.typeId?.name || 'N/A'}</td>
                      <td>{new Date(m.inTime).toLocaleTimeString()}</td>
                      <td>{m.departmentId?.name || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      {/* ─── RECENT REGISTRATIONS ─── */}
      <section style={{ marginBottom: '2rem' }}>
        <Panel title="Recent Vehicle Registrations" meta={<Link href="/vehicles/registrations" style={{fontSize:'0.875rem'}}>View All</Link>}>
          <div className="admin-table-container">
            <table className="admin-table vehicle-dash-table--regs">
              <thead>
                <tr>
                  <th>Registration Date</th>
                  <th>Plate Number</th>
                  <th>Vehicle Name</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                ) : registrations.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No recent registrations found.</td></tr>
                ) : (
                  registrations.map(r => (
                    <tr key={r._id}>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{r.plateNumber}</td>
                      <td>{r.data?.equipmentName || r.ownerName || 'N/A'}</td>
                      <td>{r.typeId?.name || 'Unknown'}</td>
                      <td>
                        <span className={`admin-badge admin-badge--${r.status === 'Approved' ? 'success' : r.status === 'Pending' ? 'warning' : 'secondary'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>


      
    </PageShell>
  );
}
