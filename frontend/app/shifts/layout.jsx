'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/shifts/create', label: 'Create Shift', requiresWrite: true },
  { path: '/shifts/manage', label: 'Manage Shifts' },
];

export default function ShiftsLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = allTabs.filter((tab) => !tab.requiresWrite || can('shifts', 'write'));

  function isActive(path) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const toolbar = (
    <div className="sub-nav">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          href={tab.path}
          className={`sub-nav-item ${isActive(tab.path) ? 'active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );

  return (
    <PageShell
      title="Shifts"
      description="Define work shifts like Morning, Afternoon, and Night for role-based scheduling"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
