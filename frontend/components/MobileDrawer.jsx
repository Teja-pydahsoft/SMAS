'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdminIcon from '@/components/admin/AdminIcons';
import { getNavItemsForUser, getUserRoleLabel } from '@/lib/app/navItems';
import { getGateSession } from '@/lib/gateSession';
import { buildEntryExitUrl } from '@/lib/entryExit';

// Exclude primary items that are on the bottom nav
const EXCLUDED_PATHS = ['/', '/entry-exit', '/equipment/dashboard', '/registrations'];

export default function MobileDrawer({ onClose }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, can, logout } = useAuth();
  
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

  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-drawer__header">
          <span className="mobile-drawer__title">More</span>
          <button className="mobile-drawer__close" onClick={onClose} aria-label="Close">
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
              
              const isGroupActive = pathname === item.path || pathname.startsWith(`${item.path.split('?')[0]}/`) || visibleChildren.some(c => pathname === c.path.split('?')[0]);
              
              return (
                <MobileNavGroup 
                  key={item.path} 
                  item={item} 
                  visibleChildren={visibleChildren} 
                  pathname={pathname} 
                  onClose={onClose} 
                />
              );
            }

            const href = item.path === '/entry-exit' && gateSessionUrl ? gateSessionUrl : item.path;
            const active = pathname === item.path.split('?')[0];
            return (
              <Link
                key={item.path}
                href={href}
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

function MobileNavGroup({ item, visibleChildren, pathname, onClose }) {
  const isGroupActive = pathname === item.path || pathname.startsWith(`${item.path.split('?')[0]}/`) || visibleChildren.some(c => pathname === c.path.split('?')[0]);
  const [open, setOpen] = useState(isGroupActive);

  return (
    <div className="mobile-drawer__group">
      <button 
        type="button"
        className={`mobile-drawer__group-label ${open ? 'mobile-drawer__group-label--open' : ''}`}
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
          {visibleChildren.map((child) => (
            <Link
              key={child.path}
              href={child.path}
              onClick={onClose}
              className={`mobile-drawer__link ${pathname === child.path.split('?')[0] ? 'active' : ''}`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
