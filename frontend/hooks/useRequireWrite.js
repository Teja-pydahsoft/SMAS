'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/** Redirects away from create/edit pages when the user lacks write access. */
export default function useRequireWrite(module, redirectTo) {
  const { can, loading } = useAuth();
  const router = useRouter();
  const allowed = can(module, 'write');

  useEffect(() => {
    if (!loading && !allowed) router.replace(redirectTo);
  }, [loading, allowed, redirectTo, router]);

  return { allowed, loading };
}
