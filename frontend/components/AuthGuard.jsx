'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getToken } from '@/lib/auth/session';
import BotLoader from '@/components/BotLoader';

const PUBLIC_PATHS = ['/login', '/registrations/register', '/register', '/pass/verify'];

export default function AuthGuard({ children }) {
  const { loading, user, refreshUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  useEffect(() => {
    if (loading || isPublic) return;
    const token = getToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!user) refreshUser();
  }, [loading, user, pathname, router, refreshUser, isPublic]);

  if (isPublic) return children;

  if (loading || (!user && getToken())) {
    return <BotLoader message="Loading session…" />;
  }

  if (!user) return null;

  return children;
}
