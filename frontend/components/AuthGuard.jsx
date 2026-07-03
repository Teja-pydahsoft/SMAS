'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getToken } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/registrations/register', '/register'];

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
    return <p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading session...</p>;
  }

  if (!user) return null;

  return children;
}
