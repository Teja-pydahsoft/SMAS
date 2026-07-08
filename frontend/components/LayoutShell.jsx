'use client';

import { usePathname } from 'next/navigation';
import AppLayoutShell from '@/components/AppLayoutShell';
import AuthGuard from '@/components/AuthGuard';

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const isGateLanding = pathname === '/access-scope';
  const isPassVerify = pathname.startsWith('/pass/verify');

  if (isLogin) {
    return <>{children}</>;
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
      <AppLayoutShell>{children}</AppLayoutShell>
    </AuthGuard>
  );
}
