'use client';

import PageShell from '@/components/PageShell';

export default function DepartmentsLayout({ children }) {
  return (
    <PageShell
      title="Departments"
      description="Create departments and link each one to one or more divisions"
    >
      {children}
    </PageShell>
  );
}
