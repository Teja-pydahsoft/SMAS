'use client';

import PageShell from '@/components/PageShell';

export default function DivisionsLayout({ children }) {
  return (
    <PageShell
      title="Divisions & Gates"
      description="Create divisions and configure physical gates for entry, exit, or both"
    >
      {children}
    </PageShell>
  );
}
