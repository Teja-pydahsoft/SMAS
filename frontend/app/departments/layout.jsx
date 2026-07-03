'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/departments/create', label: 'Create Department', requiresWrite: true },
  { path: '/departments/manage', label: 'Manage Departments' },
];

export default function DepartmentsLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = allTabs.filter((tab) => !tab.requiresWrite || can('departments', 'write'));

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
      title="Departments"
      description="Create departments and link each one to one or more divisions"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
