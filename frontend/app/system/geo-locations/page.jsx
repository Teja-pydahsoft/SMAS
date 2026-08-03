'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import LocationsTab from './LocationsTab';
import UserAssignmentsTab from './UserAssignmentsTab';
import SettingsTab from './SettingsTab';

function GeoLocationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'locations';
  const { can } = useAuth();
  const canRead = can('locations', 'read');
  const canWrite = can('locations', 'write');
  
  if (!canRead) {
    return <div className="card empty-state"><p>You do not have permission to view Geo Locations.</p></div>;
  }

  function setTab(tab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    router.push(`?${nextParams.toString()}`);
  }

  return (
    <div>
      <div className="reports-section-header">
        <div>
          <h2 className="section-title">Geo Location Access</h2>
          <p className="section-desc">Manage permitted login locations, user assignments, and security settings.</p>
        </div>
      </div>

      <div className="page-tabs">
        <button
          className={`page-tab ${currentTab === 'locations' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('locations')}
        >
          Locations
        </button>
        <button
          className={`page-tab ${currentTab === 'assignments' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('assignments')}
        >
          User Assignments
        </button>
        <button
          className={`page-tab ${currentTab === 'settings' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="tab-content" style={{ marginTop: '1.5rem' }}>
        {currentTab === 'locations' && <LocationsTab canWrite={canWrite} />}
        {currentTab === 'assignments' && <UserAssignmentsTab canWrite={canWrite} />}
        {currentTab === 'settings' && <SettingsTab canWrite={canWrite} />}
      </div>
    </div>
  );
}

export default function GeoLocationsPage() {
  return (
    <Suspense fallback={<div className="card empty-state"><p>Loading...</p></div>}>
      <GeoLocationsPageInner />
    </Suspense>
  );
}
