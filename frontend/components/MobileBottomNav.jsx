'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import AdminIcon from '@/components/admin/AdminIcons';

export default function MobileBottomNav({ onOpenDrawer, onOpenVehicles, onOpenEntryExit }) {
  const pathname = usePathname();

  const isActive = (path) => pathname === path || pathname.startsWith(`${path}/`);

  return (
    <nav className="mobile-bottom-nav">
      <div className="mobile-bottom-nav__inner">
        <Link 
          href="/" 
          className={`mobile-bottom-nav__item ${pathname === '/' ? 'active' : ''}`}
        >
          <AdminIcon name="dashboard" className="mobile-bottom-nav__icon" />
          <span>Dashboard</span>
        </Link>
        
        <button 
          className={`mobile-bottom-nav__item ${isActive('/entry-exit') || isActive('/activity') ? 'active' : ''}`}
          onClick={onOpenEntryExit}
        >
          <AdminIcon name="entryExit" className="mobile-bottom-nav__icon" />
          <span>Entry & Exit</span>
        </button>
        
        <button 
          className={`mobile-bottom-nav__item ${isActive('/vehicles') || isActive('/equipment') ? 'active' : ''}`}
          onClick={onOpenVehicles}
        >
          <AdminIcon name="companies" className="mobile-bottom-nav__icon" />
          <span>Vehicles</span>
        </button>
        
        <Link 
          href="/registrations" 
          className={`mobile-bottom-nav__item ${isActive('/registrations') ? 'active' : ''}`}
        >
          <AdminIcon name="registrations" className="mobile-bottom-nav__icon" />
          <span>Registrations</span>
        </Link>
        
        <button 
          className="mobile-bottom-nav__item"
          onClick={onOpenDrawer}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mobile-bottom-nav__icon">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
