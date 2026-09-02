'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdminIcon from '@/components/admin/AdminIcons';
import { getNavItemsForUser, getUserRoleLabel } from '@/lib/app/navItems';
import { getGateSession } from '@/lib/gateSession';
import { buildEntryExitUrl } from '@/lib/entryExit';
import { isPathActive, isGroupActive } from '@/lib/pathMatcher';

// Exclude primary items that are on the bottom nav
const EXCLUDED_PATHS = ['/', '/entry-exit', '/equipment/dashboard', '/registrations'];

export default function MobileDrawer({ onClose }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, can, logout } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  
  const gateSessionUrl = useMemo(() => {
    const session = getGateSession();
    return session ? buildEntryExitUrl(session) : null;
  }, []);

  const visibleNavItems = useMemo(
    () => getNavItemsForUser(user, can, gateSessionUrl),
    [can, gateSessionUrl, user]
  );

  const moreItems = visibleNavItems.filter(item => !EXCLUDED_PATHS.includes(item.path) && !item.path.startsWith('/equipment'));
  const roleLabel = getUserRoleLabel(user);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 240); // Matches the 0.25s animation duration
  };

  return (
    <div className={`mobile-drawer-overlay ${isClosing ? 'mobile-drawer-overlay--closing' : ''}`} onClick={handleClose}>
      <aside className={`mobile-drawer ${isClosing ? 'mobile-drawer--closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="mobile-drawer__header">
          <span className="mobile-drawer__title">More</span>
          <button className="mobile-drawer__close" onClick={handleClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <nav className="mobile-drawer__nav">
          {moreItems.map((item) => {
            if (item.children?.length) {
              const visibleChildren = item.children.filter((child) =>
                !child.module || can(child.module, 'read')
              );
              if (!visibleChildren.length) return null;
              
              return (
                <MobileNavGroup 
                  key={item.path} 
                  item={item} 
                  visibleChildren={visibleChildren} 
                  pathname={pathname} 
                  searchParams={searchParams}
                  router={router}
                  onClose={onClose} 
                />
              );
            }

            const href = item.path === '/entry-exit' && gateSessionUrl ? gateSessionUrl : item.path;
            const active = isPathActive(pathname, searchParams, item.path);
            return (
              <Link
                key={item.path}
                href={href}
                prefetch={true}
                onMouseEnter={() => router?.prefetch?.(href)}
                onTouchStart={() => router?.prefetch?.(href)}
                onClick={onClose}
                className={`mobile-drawer__link mobile-drawer__link--top ${active ? 'active' : ''}`}
              >
                <AdminIcon name={item.icon} className="mobile-drawer__icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mobile-drawer__footer">
          {user && (
            <div className="mobile-drawer__profile">
              <div className="mobile-drawer__avatar">
                {(user.displayName || 'U').charAt(0).toUpperCase()}
                <span className="mobile-drawer__online-dot" />
              </div>
              <div className="mobile-drawer__profile-info">
                <strong>{user.displayName}</strong>
                <span>{roleLabel}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="mobile-drawer__logout"
            onClick={() => {
              logout();
              onClose();
            }}
          >
            <AdminIcon name="logout" className="mobile-drawer__icon" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function MobileNavGroup({ item, visibleChildren, pathname, searchParams, router, onClose }) {
  const groupActive = isGroupActive(pathname, searchParams, item);
  const [open, setOpen] = useState(groupActive);

  return (
    <div className="mobile-drawer__group">
      <button 
        type="button"
        className={`mobile-drawer__group-label ${open ? 'mobile-drawer__group-label--open' : ''} ${groupActive ? 'mobile-drawer__group-label--active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AdminIcon name={item.icon} className="mobile-drawer__icon" />
          <span>{item.label}</span>
        </div>
        <span className={`mobile-drawer__chevron ${open ? 'mobile-drawer__chevron--open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </button>
      {open && (
        <div className="mobile-drawer__sub-nav">
          {visibleChildren.map((child) => {
            if (child.isSeparator || child.isSection) return null;
            const childActive = isPathActive(pathname, searchParams, child.path);
            return (
              <Link
                key={child.path}
                href={child.path}
                prefetch={true}
                onMouseEnter={() => router?.prefetch?.(child.path)}
                onTouchStart={() => router?.prefetch?.(child.path)}
                onClick={onClose}
                className={`mobile-drawer__link ${childActive ? 'active' : ''}`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
