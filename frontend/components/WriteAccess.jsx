'use client';

import { useAuth } from '@/components/AuthProvider';

/** Renders children only when the user has write access to a module. */
export default function WriteAccess({ module, children, fallback = null }) {
  const { can } = useAuth();
  if (!can(module, 'write')) return fallback;
  return children;
}
