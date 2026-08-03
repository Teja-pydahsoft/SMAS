'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';
import DeviceDashboard    from '@/components/devices/DeviceDashboard';
import DeviceList         from '@/components/devices/DeviceList';
import DevicePendingQueue from '@/components/devices/DevicePendingQueue';
import DeviceAuditLogs    from '@/components/devices/DeviceAuditLogs';
import DeviceSettings     from '@/components/devices/DeviceSettings';
import DeviceDownloads    from '@/components/devices/DeviceDownloads';
import Link from 'next/link';

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'list',       label: 'All Devices' },
  { key: 'pending',    label: 'Pending Approval' },
  { key: 'audit',      label: 'Audit Logs' },
  { key: 'settings',   label: 'Settings' },
  { key: 'downloads',  label: 'Downloads' },
];

export default function DevicesTabPage() {
  const { tab } = useParams();
  const { can } = useAuth();

  if (!can('devices', 'read')) {
    return (
      <PageShell title="Device Maintenance" description="Manage registered devices and approval workflow">
        <div className="empty-state card">
          <p>You do not have permission to access Device Maintenance.</p>
        </div>
      </PageShell>
    );
  }

  const activeTab = TABS.find((t) => t.key === tab)?.key ?? 'overview';

  function renderTab() {
    switch (activeTab) {
      case 'overview':  return <DeviceDashboard />;
      case 'list':      return <DeviceList />;
      case 'pending':   return <DevicePendingQueue />;
      case 'audit':     return <DeviceAuditLogs />;
      case 'settings':  return <DeviceSettings canWrite={can('devices', 'write')} />;
      case 'downloads': return <DeviceDownloads />;
      default:          return <DeviceDashboard />;
    }
  }

  return (
    <PageShell title="Device Maintenance" description="Register, approve, and monitor devices accessing SAMS">
      {/* Tab bar */}
      <div className="dm-tabs" role="tablist" aria-label="Device Maintenance sections">
        {TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/system/devices/${key}`}
            role="tab"
            aria-selected={activeTab === key}
            className={`dm-tabs__item${activeTab === key ? ' dm-tabs__item--active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="dm-tab-content admin-fade-in" key={activeTab}>
        {renderTab()}
      </div>
    </PageShell>
  );
}
