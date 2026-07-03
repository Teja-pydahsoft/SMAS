'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/roles/create', label: 'Create New Role', requiresWrite: true },
  { path: '/roles/manage', label: 'Manage Roles' },
];

export default function RolesLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();

  const tabs = allTabs.filter((tab) => !tab.requiresWrite || can('registration_roles', 'write'));

  function isActive(path) {
    if (path === '/roles/manage') {
      return pathname === '/roles/manage' || /^\/roles\/[^/]+\/form/.test(pathname);
    }
    if (path === '/roles/create') {
      return pathname === '/roles/create';
    }
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
      title="Dynamic Roles"
      description="Create roles with registration forms and manage existing roles"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
