'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdminIcon from '@/components/admin/AdminIcons';
import { SUPER_ADMIN_NAV_ITEMS } from '@/lib/admin/navItems';
import { getGateSession } from '@/lib/gateSession';
import { buildEntryExitUrl } from '@/lib/entryExit';

const STORAGE_COLLAPSED = 'sams-admin-sidebar-collapsed';

function isPathActive(pathname, searchParams, path) {
  const [basePath, query] = path.split('?');
  if (basePath === '/') return pathname === '/';
  if (basePath.startsWith('/system')) return pathname === basePath || pathname.startsWith('/system/');
  const baseMatch = pathname === basePath || pathname.startsWith(`${basePath}/`);
  if (!baseMatch) return false;
  if (query && searchParams) {
    const [key, val] = query.split('=');
    return searchParams.get(key) === val;
  }
  return true;
}

function isGroupActive(pathname, searchParams, item) {
  const [basePath] = item.path.split('?');
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) return true;
  return (item.children || []).some((child) => isPathActive(pathname, searchParams, child.path));
}

function ChevronIcon({ open }) {
  return (
    <span className={`admin-sidebar__group-chevron ${open ? 'admin-sidebar__group-chevron--open' : ''}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  );
}

function NavGroup({ item, collapsed, pathname, searchParams }) {
  const active = isGroupActive(pathname, searchParams, item);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (collapsed) {
    return (
      <button
        type="button"
        className={`admin-sidebar__group-trigger ${active ? 'admin-sidebar__group-trigger--active' : ''}`}
        title={item.label}
        onClick={() => setOpen((o) => !o)}
      >
        <AdminIcon name={item.icon} className="admin-icon admin-sidebar__icon" />
      </button>
    );
  }

  return (
    <div className="admin-sidebar__group">
      <button
        type="button"
        className={`admin-sidebar__group-trigger ${active ? 'admin-sidebar__group-trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <AdminIcon name={item.icon} className="admin-icon admin-sidebar__icon" />
        <span>{item.label}</span>
        <ChevronIcon open={open} />
      </button>

      <div className={`admin-sidebar__sub-nav ${open ? 'admin-sidebar__sub-nav--open' : ''}`}>
        {item.children.map((child) => {
          const childActive = isPathActive(pathname, searchParams, child.path);
          return (
            <Link
              key={`${child.path}-${child.label}`}
              href={child.path}
              className={`admin-sidebar__sub-link ${childActive ? 'admin-sidebar__sub-link--active' : ''}`}
            >
              {child.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AdminSidebarInner({ can, user, logout }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gateSessionUrl, setGateSessionUrl] = useState(null);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

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

  const visibleNavItems = useMemo(() => {
    return SUPER_ADMIN_NAV_ITEMS.filter((item) => {
      if (!item.module) return true;
      if (can(item.module, 'read')) return true;
      if (item.altModule && can(item.altModule, 'read')) return true;
      return false;
    });
  }, [can]);

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

      <aside className={`admin-sidebar ${collapsed ? 'admin-sidebar--collapsed' : ''} ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
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
            if (item.children?.length) {
              const visibleChildren = item.children.filter((child) =>
                !child.module || can(child.module, 'read')
              );
              if (!visibleChildren.length) return null;
              return (
                <NavGroup
                  key={item.path + item.label}
                  item={{ ...item, children: visibleChildren }}
                  collapsed={collapsed}
                  pathname={pathname}
                  searchParams={searchParams}
                />
              );
            }

            const href = item.path === '/entry-exit' && gateSessionUrl ? gateSessionUrl : item.path;
            const active = isPathActive(pathname, searchParams, item.path);
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
              <span>Super Admin</span>
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

export default function AdminSidebar() {
  const { user, can, logout } = useAuth();
  return (
    <Suspense fallback={null}>
      <AdminSidebarInner user={user} can={can} logout={logout} />
    </Suspense>
  );
}
