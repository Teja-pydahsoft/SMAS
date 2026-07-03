'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function RegisterRedirectPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/registrations/register?role=${params.roleId}`);
  }, [params.roleId, router]);

  return <p style={{ color: 'var(--text-muted)' }}>Redirecting to registrations...</p>;
}
