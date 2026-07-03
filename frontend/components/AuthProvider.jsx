'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { clearSession, getStoredUser, getToken, setSession, hasPermission } from '@/lib/auth/session';
import { clearGateFlowState } from '@/lib/gateSession';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const me = await api.auth.me();
      setUser(me);
      setSession(token, me);
      return me;
    } catch {
      clearSession();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (username, password) => {
      const result = await api.auth.login(username, password);
      clearGateFlowState();
      setSession(result.token, result.user);
      setUser(result.user);
      return result.user;
    },
    []
  );

  const logout = useCallback(() => {
    clearGateFlowState();
    clearSession();
    setUser(null);
    router.push('/login');
  }, [router]);

  const can = useCallback(
    (module, action = 'read') => hasPermission(user, module, action),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, can }),
    [user, loading, login, logout, refreshUser, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
