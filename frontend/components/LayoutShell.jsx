'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AuthGuard from '@/components/AuthGuard';

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <div className="login-shell">{children}</div>;
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
