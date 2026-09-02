'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import AppLayoutShell from '@/components/AppLayoutShell';
import AuthGuard from '@/components/AuthGuard';
import PushSubscriptionManager from '@/components/PushSubscriptionManager';
import NavigationProgressBar from '@/components/NavigationProgressBar';

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const isGateLanding = pathname === '/access-scope';
  const isPassVerify = pathname.startsWith('/pass/verify');

  return (
    <>
      <Suspense fallback={null}>
        <NavigationProgressBar />
      </Suspense>
      {isLogin ? (
        children
      ) : isPassVerify ? (
        <div className="pass-verify-shell">{children}</div>
      ) : isGateLanding ? (
        <AuthGuard>
          <PushSubscriptionManager />
          <div className="gate-landing-shell">{children}</div>
        </AuthGuard>
      ) : (
        <AuthGuard>
          <PushSubscriptionManager />
          <AppLayoutShell>{children}</AppLayoutShell>
        </AuthGuard>
      )}
    </>
  );
}
