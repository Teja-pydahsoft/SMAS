'use client';

import { useAuth } from '@/components/AuthProvider';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayoutShell({ children }) {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) return children;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
