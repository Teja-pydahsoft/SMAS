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

  const refreshUser = useCallback(async (options = {}) => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    // Silent refresh: don't set loading, don't wipe user on failure
    if (!options.silent) setLoading(true);

    try {
      const me = await api.auth.me();
      setUser(me);
      setSession(token, me);
      return me;
    } catch {
      if (!options.silent) {
        clearSession();
        setUser(null);
      }
      return null;
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      // Immediately use cached user — no loading flash
      setUser(stored);
      setLoading(false);
      // Silently re-validate in background (don't block UI)
      refreshUser({ silent: true });
    } else {
      refreshUser();
    }
  }, [refreshUser]);

  const login = useCallback(async (username, password, options = {}) => {
    // options.fingerprint is passed by the login page for the bootstrap flow.
    // It is forwarded to the backend so it can auto-approve the first Super Admin
    // device without requiring a manual approval on a fresh installation.
    const result = await api.auth.login(username, password, options.fingerprint || null);
    if (!options.keepGateSession) {
      clearGateFlowState();
    }
    setSession(result.token, result.user);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback((reason) => {
    clearGateFlowState();
    clearSession();
    setUser(null);
    if (reason === 'location_blocked') {
      router.push('/login?error=location_blocked');
    } else {
      router.push('/login');
    }
  }, [router]);

  // Geolocation Continuous Tracking
  useEffect(() => {
    if (!user || user.isSuperAdmin) return;
    
    let watchId;
    let lastCheckTime = 0;
    const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

    const startTracking = async () => {
      try {
        const settings = await api.geoLocations.publicSettings();
        if (!settings.geoLocationEnabled) return;

        if (!navigator.geolocation) return;

        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const now = Date.now();
            if (now - lastCheckTime < THROTTLE_MS) return;
            
            try {
              lastCheckTime = now;
              await api.geoLocations.verify(position.coords.latitude, position.coords.longitude);
            } catch (err) {
              if (err.status === 403) {
                logout('location_blocked');
              }
            }
          },
          (error) => {
            console.warn('Geolocation tracking error:', error);
          },
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      } catch (err) {
        console.warn('Failed to load geo settings for tracking:', err);
      }
    };

    startTracking();

    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user, logout]);

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
