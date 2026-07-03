'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/components/AuthProvider';

const allTabs = [
  { path: '/registrations/register', label: 'New Registration', requiresWrite: true },
  { path: '/registrations/manage', label: 'All Registrations' },
];

export default function RegistrationsLayout({ children }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = allTabs.filter((tab) => !tab.requiresWrite || can('registrations', 'write'));

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
      title="Registrations"
      description="Register new users, view passes, and manage all registrations"
      toolbar={toolbar}
    >
      {children}
    </PageShell>
  );
}
