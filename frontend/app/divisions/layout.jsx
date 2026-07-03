'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/divisions/create', label: 'Create Division', requiresWrite: true },
  { path: '/divisions/manage', label: 'Manage Divisions' },
];

export default function DivisionsLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = allTabs.filter((tab) => !tab.requiresWrite || can('divisions', 'write'));

  function isActive(path) {
    if (path === '/divisions/manage') {
      return (
        pathname === '/divisions/manage' ||
        (pathname.startsWith('/divisions/') &&
          !pathname.startsWith('/divisions/create') &&
          !pathname.startsWith('/divisions/manage'))
      );
    }
    return pathname === path;
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
      title="Divisions & Gates"
      description="Create divisions and configure physical gates for entry, exit, or both"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
