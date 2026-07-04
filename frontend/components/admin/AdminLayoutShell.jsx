'use client';

import AppLayoutShell from '@/components/AppLayoutShell';

/** @deprecated Use AppLayoutShell — kept for imports that still reference AdminLayoutShell */
export default function AdminLayoutShell({ children }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
