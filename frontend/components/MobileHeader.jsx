'use client';

import { usePathname } from 'next/navigation';
import { APP_NAV_ITEMS } from '@/lib/app/navItems';
import AdminIcon from '@/components/admin/AdminIcons';

function getPageTitle(pathname) {
  if (pathname === '/') return 'Dashboard';
  
  // Recursively find title
  const findTitle = (items) => {
    for (const item of items) {
      if (item.path === pathname) return item.label;
      if (pathname.startsWith(item.path) && item.path !== '/') {
        return item.label;
      }
      if (item.children) {
        const childTitle = findTitle(item.children);
        if (childTitle) return childTitle;
      }
    }
    return null;
  };
  
  return findTitle(APP_NAV_ITEMS) || 'SAMS';
}

export default function MobileHeader({ onOpenDrawer }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="mobile-header">
      <div className="mobile-header__inner">
        <div className="mobile-header__brand">
          <span className="mobile-header__logo">S</span>
          <span className="mobile-header__title">{title}</span>
        </div>
        <button 
          className="mobile-header__hamburger" 
          onClick={onOpenDrawer}
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </header>
  );
}
