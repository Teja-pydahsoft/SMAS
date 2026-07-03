'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/system/roles/create', label: 'Create System Role', module: 'system_roles', requiresWrite: true },
  { path: '/system/roles/manage', label: 'Manage System Roles', module: 'system_roles' },
  { path: '/system/users/create', label: 'Create System User', module: 'system_users', requiresWrite: true },
  { path: '/system/users/manage', label: 'Manage System Users', module: 'system_users' },
];

export default function SystemLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();

  const tabs = allTabs.filter((tab) => {
    if (!can(tab.module, 'read')) return false;
    if (tab.requiresWrite && !can(tab.module, 'write')) return false;
    return true;
  });

  function isActive(path) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const toolbar = (
    <div className="sub-nav sub-nav-wrap">
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
      title="System Access"
      description="Create system roles, assign privileges, and manage system users"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
