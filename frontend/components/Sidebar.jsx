'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getGateSession } from '@/lib/gateSession';
import { buildEntryExitUrl } from '@/lib/entryExit';
import { hasAssignedEntryExitScope } from '@/lib/auth/routing';

const STORAGE_WIDTH = 'smas-sidebar-width';
const STORAGE_COLLAPSED = 'smas-sidebar-collapsed';
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = 76;

const navItems = [
  {
    path: '/',
    label: 'Dashboard',
    module: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    path: '/access-scope',
    label: 'Gate Access',
    module: 'gate',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
  {
    path: '/entry-exit',
    label: 'Entry & Exit',
    module: 'gate',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
  },
  {
    path: '/roles',
    label: 'Roles',
    module: 'registration_roles',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    path: '/registrations',
    label: 'Registrations',
    module: 'registrations',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    path: '/divisions',
    label: 'Divisions',
    module: 'divisions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <path d="M3 14h7v7H3z" />
        <path d="M14 14h7v7h-7z" />
      </svg>
    ),
  },
  {
    path: '/departments',
    label: 'Departments',
    module: 'departments',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9v0" />
        <path d="M9 12v0" />
        <path d="M9 15v0" />
        <path d="M9 18v0" />
      </svg>
    ),
  },
  {
    path: '/reports',
    label: 'Reports',
    module: 'reports',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    path: '/system/users/manage',
    label: 'System Access',
    module: 'system_users',
    altModule: 'system_roles',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15v2" />
        <path d="M12 7v2" />
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

function clampWidth(value) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function applySidebarWidth(width, collapsed) {
  const applied = collapsed ? COLLAPSED_WIDTH : width;
  document.documentElement.style.setProperty('--sidebar-width', `${applied}px`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [gateSessionUrl, setGateSessionUrl] = useState(null);
  const widthRef = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    setMobileMenuOpen(false);
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
    const savedWidth = Number(localStorage.getItem(STORAGE_WIDTH));
    const savedCollapsed = localStorage.getItem(STORAGE_COLLAPSED) === 'true';
    const nextWidth = Number.isFinite(savedWidth) && savedWidth > 0 ? clampWidth(savedWidth) : DEFAULT_WIDTH;

    setWidth(nextWidth);
    widthRef.current = nextWidth;
    setCollapsed(savedCollapsed);
    applySidebarWidth(nextWidth, savedCollapsed);

    const media = window.matchMedia('(max-width: 768px)');
    const syncMobile = () => setIsMobile(media.matches);
    syncMobile();
    media.addEventListener('change', syncMobile);
    return () => media.removeEventListener('change', syncMobile);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    applySidebarWidth(width, collapsed);
  }, [width, collapsed, isMobile]);

  const stopResize = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(STORAGE_WIDTH, String(widthRef.current));
  }, []);

  useEffect(() => {
    if (!isResizing) return undefined;

    function onMouseMove(event) {
      const nextWidth = clampWidth(event.clientX);
      widthRef.current = nextWidth;
      setWidth(nextWidth);
      applySidebarWidth(nextWidth, false);
    }

    function onMouseUp() {
      stopResize();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, stopResize]);

  function isActive(path) {
    if (path === '/') return pathname === '/';
    if (path.startsWith('/system')) {
      return pathname === path || pathname.startsWith('/system/');
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => {
      if (item.path === '/entry-exit') {
        if (user?.isSuperAdmin) return can('gate', 'read');
        return Boolean(gateSessionUrl);
      }
      if (item.path === '/access-scope') {
        if (user?.isSuperAdmin) return false;
        return hasAssignedEntryExitScope(user);
      }
      if (!item.module) return true;
      if (can(item.module, 'read')) return true;
      if (item.altModule && can(item.altModule, 'read')) return true;
      return false;
    });
  }, [can, gateSessionUrl, user]);

  function startResize(event) {
    if (collapsed || isMobile) return;
    event.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_COLLAPSED, String(next));
    applySidebarWidth(widthRef.current, next);
  }

  function resetWidth() {
    if (collapsed || isMobile) return;
    widthRef.current = DEFAULT_WIDTH;
    setWidth(DEFAULT_WIDTH);
    localStorage.setItem(STORAGE_WIDTH, String(DEFAULT_WIDTH));
    applySidebarWidth(DEFAULT_WIDTH, false);
  }

  return (
    <aside
      className={[
        'sidebar',
        collapsed ? 'sidebar-collapsed' : '',
        isResizing ? 'sidebar-resizing' : '',
        isMobile && mobileMenuOpen ? 'sidebar-mobile-open' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="sidebar-mobile-bar">
        <div className="brand">
          <span className="brand-icon">S</span>
          <div className="brand-text">
            <h1>SAMS</h1>
            <p>Access System</p>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            className="sidebar-mobile-toggle"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {mobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      <nav>
        {visibleNavItems.map((item) => {
          const href = item.path === '/entry-exit' && gateSessionUrl ? gateSessionUrl : item.path;
          return (
            <Link
              key={item.path}
              href={href}
              className={isActive(item.path) ? 'active' : ''}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-user">
        {(!collapsed || isMobile) && user && (
          <div className="sidebar-user-info">
            <strong>{user.displayName}</strong>
            <span>{user.isSuperAdmin ? 'Super Admin' : user.systemRoleId?.name || 'System User'}</span>
          </div>
        )}
        <button type="button" className="btn-secondary sidebar-logout" onClick={logout} title="Sign out">
          {collapsed && !isMobile ? '⎋' : 'Sign Out'}
        </button>
      </div>

      {!isMobile && (
        <>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>

          {!collapsed && (
            <div
              className={`sidebar-resizer ${isResizing ? 'sidebar-resizer-active' : ''}`}
              onMouseDown={startResize}
              onDoubleClick={resetWidth}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              title="Drag to resize. Double-click to reset."
            />
          )}
        </>
      )}
    </aside>
  );
}
