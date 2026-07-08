'use client';

import PageShell from '@/components/PageShell';

export default function ShiftsLayout({ children }) {
  return (
    <PageShell
      title="Shifts"
      description="Define work shifts like Morning, Afternoon, and Night for role-based scheduling"
    >
      {children}
    </PageShell>
  );
}
