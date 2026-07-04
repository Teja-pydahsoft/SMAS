'use client';

import AppSidebar from '@/components/AppSidebar';

export default function AppLayoutShell({ children }) {
  return (
    <div className="admin-layout">
      <AppSidebar />
      <div className="admin-main">
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
