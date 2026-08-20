"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';

import PageShell from '@/components/PageShell';
import VehicleSummaryCard from '@/components/vehicles/VehicleSummaryCard';
import VehicleFilters from '@/components/vehicles/VehicleFilters';
import VehicleTable from '@/components/vehicles/VehicleTable';
import VehicleDrawer from '@/components/vehicles/VehicleDrawer';

import PageTabs from '@/components/PageTabs';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // State for filtering
  const [filter, setFilter] = useState({});
  
  // State for Drawer
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleVisits, setVehicleVisits] = useState([]);
  
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
      const res = await api.vehicles.movements({ plateNumber: vehicle.plateNumber });
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

  // Derived Metrics
  const activeCount = vehicles.filter(v => v.status === 'Active' || v.status === 'Working').length;
  const inactiveCount = vehicles.filter(v => v.status === 'Inactive' || v.status === 'Idle').length;
  
  // Unique Categories Count
  const uniqueCategories = new Set(vehicles.map(v => v.categoryId?._id).filter(Boolean)).size;

  // Apply filters client-side
  const filteredVehicles = vehicles.filter(v => {
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!v.plateNumber?.toLowerCase().includes(q) && !v.typeId?.name?.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filter.status && filter.status !== '') {
      if (v.status !== filter.status) return false;
    }
    if (filter.departmentId) {
      const vehicleDeptId = v.departmentId?._id || v.departmentId || v.activeMovement?.departmentId?._id || v.activeMovement?.departmentId;
      if (String(vehicleDeptId || '') !== String(filter.departmentId)) return false;
    }
    return true;
  });

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
            display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 6px !important; overflow-x: hidden !important; margin-bottom: 0.5rem !important; padding-top: 8px !important;
          }
          .vehicle-master-metrics > div {
            min-width: 0 !important; width: 100% !important;
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
        <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary vehicle-master-btn">
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
      <div className="admin-page-content" style={{ paddingTop: 0, marginTop: '-0.5rem' }}>
        
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
          <div className="hide-on-mobile" style={{ display: 'contents' }}>
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

      {/* Side Drawer Overlay */}
      {selectedVehicle && (
        <VehicleDrawer 
          vehicle={selectedVehicle} 
          visits={vehicleVisits} 
          onClose={closeDrawer} 
        />
      )}
    </PageShell>
  );
}
