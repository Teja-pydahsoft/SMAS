'use client';

import { useAuth } from '@/components/AuthProvider';

/** Renders children only when the user has write access to a module (or any of several). */
export default function WriteAccess({ module, modules, children, fallback = null }) {
  const { can } = useAuth();
  const list = modules?.length ? modules : module ? [module] : [];
  const allowed = list.some((key) => can(key, 'write'));
  if (!allowed) return fallback;
  return children;
}
