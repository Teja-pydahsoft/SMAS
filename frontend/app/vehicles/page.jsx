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
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // State for filtering
  const [filter, setFilter] = useState({});
  
  // State for Drawer
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleLogs, setVehicleLogs] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vData, rData] = await Promise.all([
        api.vehicles.list(),
        api.vehicles.registrations.list({ status: 'Pending' }).catch(() => []) // Graceful fail if issues
      ]);
      setVehicles(Array.isArray(vData) ? vData : []);
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
    setVehicleLogs([]);
    if (vehicle.ownerId && vehicle.ownerModel === 'Registration') {
      try {
        const logs = await api.gate.logs({ registrationId: vehicle.ownerId });
        setVehicleLogs(Array.isArray(logs) ? logs : []);
      } catch (err) {
        console.error('Failed to fetch logs', err);
      }
    }
  };

  const handleDeleteVehicle = async (vehicle) => {
    if (window.confirm(`Are you sure you want to delete vehicle ${vehicle.plateNumber}? This cannot be undone.`)) {
      try {
        await api.vehicles.delete(vehicle._id);
        setVehicles(prev => prev.filter(v => v._id !== vehicle._id));
      } catch (err) {
        console.error('Failed to delete vehicle:', err);
        alert(err.message || 'Failed to delete vehicle');
      }
    }
  };

  const closeDrawer = () => {
    setSelectedVehicle(null);
    setVehicleLogs([]);
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
    return true;
  });

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button onClick={fetchData} className="admin-btn admin-btn--ghost">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-12.28l5.07 5.07"/></svg>
        Refresh
      </button>
      <button className="admin-btn admin-btn--ghost">Export CSV</button>
      <Link href="/vehicles/registrations/new" className="admin-btn admin-btn--primary">
        New Registration
      </Link>
    </div>
  );

  const tabs = [
    { label: 'Vehicles', path: '/vehicles' },
    { label: 'Categories', path: '/vehicles/categories' },
    { label: 'Types', path: '/vehicles/types' }
  ];

  return (
    <PageShell 
      title="Vehicle Master" 
      description="Manage all registered logistics equipment across the organization."
      toolbar={toolbar}
    >
      <PageTabs tabs={tabs} />
      <div className="admin-dashboard">
        
        {/* ROW 1: Summary Cards */}
        <div className="admin-metrics-grid" style={{ marginBottom: '1.5rem' }}>
          <VehicleSummaryCard 
            title="Total Equipment" 
            count={loading ? '-' : vehicles.length} 
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
          <VehicleSummaryCard 
            title="Categories" 
            count={loading ? '-' : uniqueCategories} 
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>}
            iconType="primary"
          />
        </div>

        {/* ROW 2: Filters */}
        <VehicleFilters filter={filter} setFilter={setFilter} onReset={handleResetFilters} />

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
          logs={vehicleLogs} 
          onClose={closeDrawer} 
        />
      )}
    </PageShell>
  );
}
