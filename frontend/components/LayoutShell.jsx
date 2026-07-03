'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AuthGuard from '@/components/AuthGuard';

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const isGateLanding = pathname === '/access-scope';

  if (isLogin) {
    return <div className="login-shell">{children}</div>;
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
      <div className="layout">
        <Sidebar />
        <div className="main-area">
          <main className="content">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
