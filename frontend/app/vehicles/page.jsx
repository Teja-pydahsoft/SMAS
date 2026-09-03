"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';

import PageShell from '@/components/PageShell';
import VehicleSummaryCard from '@/components/vehicles/VehicleSummaryCard';
import VehicleFilters from '@/components/vehicles/VehicleFilters';
import VehicleTable from '@/components/vehicles/VehicleTable';
import VehicleDrawer from '@/components/vehicles/VehicleDrawer';
import VehicleTypesModal from '@/components/vehicles/VehicleTypesModal';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // State for filtering
  const [filter, setFilter] = useState({});
  
  // State for Vehicle Details Popup Modal
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleVisits, setVehicleVisits] = useState([]);
  
  // State for Types Popup Modal
  const [showTypesModal, setShowTypesModal] = useState(false);

  // Toggle for advanced filters
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vData, rData, summaryData] = await Promise.all([
        api.vehicles.list(),
        api.vehicles.registrations.list({ status: 'Pending' }).catch(() => []),
        api.vehicles.summary().catch(() => null),
      ]);
      setVehicles(Array.isArray(vData) ? vData : []);
      setSummary(summaryData);
      setPendingCount(Array.isArray(rData) ? rData.filter(r => r.status === 'Pending').length : 0);
    } catch (err) {
      console.error('Error fetching vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResetFilters = () => {
    setFilter({});
  };

  const handleViewVehicle = async (vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleVisits([]);
    try {
      const res = await api.vehicles.movements({ 
        vehicleId: vehicle._id, 
        plateNumber: vehicle.plateNumber,
        limit: 500 
      });
      if (res && Array.isArray(res.data)) {
        setVehicleVisits(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch visits', err);
    }
  };

  const handleDeleteVehicle = async (vehicle) => {
    if (window.confirm(`Delete vehicle ${vehicle.plateNumber} from Vehicle Master? Registration history will be kept.`)) {
      try {
        await api.vehicles.delete(vehicle._id);
        setVehicles(prev => prev.filter(v => v._id !== vehicle._id));
        const summaryData = await api.vehicles.summary().catch(() => null);
        setSummary(summaryData);
      } catch (err) {
        console.error('Failed to delete vehicle:', err);
        alert(err.message || 'Failed to delete vehicle');
      }
    }
  };

  const closeDrawer = () => {
    setSelectedVehicle(null);
    setVehicleVisits([]);
  };

  // Optimized single-pass metrics & filtering
  const { activeCount, inactiveCount, filteredVehicles } = React.useMemo(() => {
    let active = 0;
    let inactive = 0;
    const filtered = [];
    const q = filter.search?.toLowerCase();

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.status === 'Active' || v.status === 'Working') active++;
      if (v.status === 'Inactive' || v.status === 'Idle') inactive++;

      if (q && !v.plateNumber?.toLowerCase().includes(q) && !v.typeId?.name?.toLowerCase().includes(q)) {
        continue;
      }
      if (filter.status && filter.status !== '' && v.status !== filter.status) {
        continue;
      }
      if (filter.departmentId) {
        const vehicleDeptId = v.departmentId?._id || v.departmentId || v.activeMovement?.departmentId?._id || v.activeMovement?.departmentId;
        if (String(vehicleDeptId || '') !== String(filter.departmentId)) continue;
      }
      filtered.push(v);
    }

    return { activeCount: active, inactiveCount: inactive, filteredVehicles: filtered };
  }, [vehicles, filter]);

  const toolbar = (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .vehicle-master-toolbar {
          display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; padding-bottom: 4px;
        }
        .vehicle-master-search {
          min-width: 250px; flex: 1; height: 36px; font-size: 14px;
        }
        .vehicle-master-btn {
          height: 36px; padding: 0 16px; font-size: 14px; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center;
        }
        .vehicle-master-btn-new-reg {
          transition: all 0.2s ease-in-out;
        }
        .vehicle-master-btn-new-reg:hover {
          color: #fef08a !important;
          background: #1d4ed8 !important;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
        }
        .vehicle-master-btn-icon {
          height: 36px; padding: 0 12px; display: flex; align-items: center; flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .vehicle-master-toolbar {
            gap: 6px; flex-wrap: nowrap !important; overflow-x: hidden;
          }
          .vehicle-master-search {
            min-width: 80px !important; height: 32px !important; font-size: 11px !important;
          }
          .vehicle-master-btn {
            height: 32px !important; font-size: 11px !important; padding: 0 10px !important;
          }
          .vehicle-master-btn-icon {
            height: 32px !important; padding: 0 8px !important;
          }
          .vehicle-master-metrics {
            display: grid !important; 
            grid-template-columns: 1fr 1fr !important; 
            gap: 0.5rem !important; 
            overflow-x: hidden !important; 
            margin-bottom: 0.75rem !important; 
            padding-top: 2px !important;
          }
          .vehicle-summary-card {
            padding: 0.45rem 0.65rem !important;
            border-radius: 10px !important;
            background: var(--surface-base) !important;
            border: 1px solid var(--border-color) !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            text-align: left !important;
            gap: 0.5rem !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.03) !important;
          }
          .vehicle-summary-card .admin-metric-card__icon {
            width: 28px !important;
            height: 28px !important;
            border-radius: 6px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
          }
          .vehicle-summary-card .admin-metric-card__icon svg {
            width: 14px !important;
            height: 14px !important;
          }
          .vehicle-summary-card .admin-metric-card__label {
            font-size: 10px !important;
            font-weight: 600 !important;
            color: var(--text-muted) !important;
            line-height: 1.1 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .vehicle-summary-card .admin-metric-card__value {
            font-size: 1.05rem !important;
            font-weight: 800 !important;
            color: var(--text-primary) !important;
            line-height: 1.1 !important;
            margin-top: 1px !important;
          }
        }
      `}} />
      <div className="admin-toolbar vehicle-master-toolbar">
        <input 
          type="text" 
          placeholder="Search Vehicle..." 
          className="admin-input vehicle-master-search" 
          value={filter.search || ''}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <button 
          type="button"
          onClick={() => setShowTypesModal(true)} 
          className="admin-btn admin-btn--secondary vehicle-master-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Types
        </button>
        <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary vehicle-master-btn vehicle-master-btn-new-reg">
          New Registration
        </Link>
        <button 
          className={`admin-btn admin-btn--ghost vehicle-master-btn-icon ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Toggle Filters"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        </button>
        <button onClick={fetchData} className="admin-btn admin-btn--ghost hide-on-mobile vehicle-master-btn-icon" title="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-12.28l5.07 5.07"/></svg>
        </button>
        <button className="admin-btn admin-btn--ghost hide-on-mobile vehicle-master-btn">Export CSV</button>
      </div>
    </>
  );

  return (
    <PageShell 
      title="Vehicle Master" 
      description="Manage all registered logistics equipment across the organization."
      toolbar={toolbar}
    >
      <div className="admin-page-content" style={{ paddingTop: 0, marginTop: '0.5rem' }}>
        
        {/* ROW 1: Summary Cards */}
        {summary && !summary.isSynced && (
          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#92400e' }}>
            Vehicle Master shows <strong>{summary.fleetCount}</strong> vehicles but only <strong>{summary.registrationTotal}</strong> registration records exist.
            {summary.fleetWithoutRegistration > 0 && summary.orphanFleetPlates?.length > 0 && (
              <> Missing registration for: <strong>{summary.orphanFleetPlates.join(', ')}</strong>.</>
            )}
          </div>
        )}
        <div className="admin-metrics-grid vehicle-master-metrics" style={{ marginBottom: '1.5rem' }}>
          <VehicleSummaryCard 
            title="Total Equipment" 
            count={loading ? '-' : vehicles.length} 
            subtitle={summary ? `${summary.registrationTotal} registration records` : undefined}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>}
            iconType="secondary"
          />
          <VehicleSummaryCard 
            title="Active Equipment" 
            count={loading ? '-' : activeCount} 
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>}
            iconType="success"
          />
          <VehicleSummaryCard 
            title="Inactive / Idle" 
            count={loading ? '-' : inactiveCount} 
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>}
            iconType="warning"
          />
          <VehicleSummaryCard 
            title="Pending Registrations" 
            count={loading ? '-' : pendingCount} 
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>}
            iconType="info"
          />
        </div>

        {/* ROW 2: Filters */}
        {showFilters && (
          <VehicleFilters filter={filter} setFilter={setFilter} onReset={handleResetFilters} />
        )}

        {/* ROW 3: Table */}
        <div className="admin-panel" style={{ padding: 0 }}>
          <VehicleTable 
            vehicles={filteredVehicles} 
            onViewClick={handleViewVehicle}
            onDeleteClick={handleDeleteVehicle}
          />
        </div>

      </div>

      {/* Vehicle Details Popup Modal */}
      {selectedVehicle && (
        <VehicleDrawer 
          vehicle={selectedVehicle} 
          visits={vehicleVisits} 
          onClose={closeDrawer} 
        />
      )}

      {/* Define Types Popup Modal */}
      <VehicleTypesModal 
        isOpen={showTypesModal}
        onClose={() => {
          setShowTypesModal(false);
          fetchData();
        }}
        onTypesUpdated={fetchData}
      />
    </PageShell>
  );
}
