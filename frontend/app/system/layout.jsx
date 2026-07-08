'use client';

import PageShell from '@/components/PageShell';

export default function SystemLayout({ children }) {
  return (
    <PageShell
      title="System Access"
      description="Create system roles, assign privileges, and manage system users"
    >
      {children}
    </PageShell>
  );
}
