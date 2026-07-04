'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdminIcon from '@/components/admin/AdminIcons';
import { getGateSession } from '@/lib/gateSession';
import { buildEntryExitUrl } from '@/lib/entryExit';
import { getNavItemsForUser, getUserRoleLabel } from '@/lib/app/navItems';

const STORAGE_COLLAPSED = 'sams-app-sidebar-collapsed';

function isActive(pathname, item) {
  if (item.path === '/') return pathname === '/';
  if (item.path.startsWith('/system')) {
    return pathname === item.path || pathname.startsWith('/system/');
  }
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gateSessionUrl, setGateSessionUrl] = useState(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncGateSession = () => {
      const session = getGateSession();
      setGateSessionUrl(session ? buildEntryExitUrl(session) : null);
    };
    syncGateSession();
    window.addEventListener('smas-gate-session', syncGateSession);
    return () => window.removeEventListener('smas-gate-session', syncGateSession);
  }, [pathname]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_COLLAPSED);
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_COLLAPSED, String(next));
      document.documentElement.style.setProperty('--admin-sidebar-width', next ? '84px' : '272px');
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--admin-sidebar-width', collapsed ? '84px' : '272px');
  }, [collapsed]);

  const visibleNavItems = useMemo(
    () => getNavItemsForUser(user, can, gateSessionUrl),
    [can, gateSessionUrl, user]
  );

  const roleLabel = getUserRoleLabel(user);

  return (
    <>
      <button
        type="button"
        className="admin-mobile-trigger"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <AdminIcon name="dashboard" className="admin-icon" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`admin-sidebar ${collapsed ? 'admin-sidebar--collapsed' : ''} ${mobileOpen ? 'admin-sidebar--open' : ''}`}
      >
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo">S</span>
          {!collapsed && (
            <div className="admin-sidebar__brand-text">
              <strong>SAMS</strong>
              <span>Smart Access Management</span>
            </div>
          )}
        </div>

        <nav className="admin-sidebar__nav">
          {visibleNavItems.map((item) => {
            const href =
              item.path === '/entry-exit' && gateSessionUrl ? gateSessionUrl : item.path;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.path}
                href={href}
                className={`admin-sidebar__link ${active ? 'admin-sidebar__link--active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <AdminIcon name={item.icon} className="admin-icon admin-sidebar__icon" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar__footer">
          <button
            type="button"
            className="admin-sidebar__link admin-sidebar__logout"
            onClick={logout}
            title={collapsed ? 'Sign Out' : undefined}
          >
            <AdminIcon name="logout" className="admin-icon admin-sidebar__icon" />
            {!collapsed && <span>Sign Out</span>}
          </button>
          {!collapsed && user && (
            <div className="admin-sidebar__user">
              <strong>{user.displayName}</strong>
              <span>{roleLabel}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="admin-sidebar__collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </svg>
        </button>
      </aside>
    </>
  );
}
