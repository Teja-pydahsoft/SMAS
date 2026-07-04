'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdminLayoutShell from '@/components/admin/AdminLayoutShell';
import Sidebar from '@/components/Sidebar';
import AuthGuard from '@/components/AuthGuard';

function AppLayout({ children }) {
  const { user, loading } = useAuth();

  if (!loading && user?.isSuperAdmin) {
    return <AdminLayoutShell>{children}</AdminLayoutShell>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-area">
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const isGateLanding = pathname === '/access-scope';
  const isPassVerify = pathname.startsWith('/pass/verify');

  if (isLogin) {
    return <div className="login-shell">{children}</div>;
  }

  if (isPassVerify) {
    return <div className="pass-verify-shell">{children}</div>;
  }

  if (isGateLanding) {
    return (
      <AuthGuard>
        <div className="gate-landing-shell">{children}</div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppLayout>{children}</AppLayout>
    </AuthGuard>
  );
}
