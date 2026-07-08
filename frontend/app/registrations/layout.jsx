'use client';

import PageShell from '@/components/PageShell';

export default function RegistrationsLayout({ children }) {
  return (
    <PageShell
      title="Registrations"
      description="Manage all registrations and register new users"
    >
      {children}
    </PageShell>
  );
}
