'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminIcon from '@/components/admin/AdminIcons';

export default function MobileEntryExitNav({ onClose }) {
  const pathname = usePathname();

  const links = [
    { path: '/entry-exit', label: 'Person Entry & Exit', icon: 'entryExit', description: 'Log personnel movements' },
    { path: '/equipment/movements', label: 'Vehicle Entry & Exit', icon: 'entryExit', description: 'Log vehicle movements' },
    { path: '/activity', label: 'Activity Monitor', icon: 'cameras', description: 'View live gate activity' },
  ];

  return (
    <>
      <div className="mobile-drawer-overlay" onClick={onClose} style={{ zIndex: 1500 }} />
      <div className="mobile-action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-action-sheet__header">
          <span className="mobile-action-sheet__title">Entry & Activity</span>
          <button className="mobile-action-sheet__close" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="mobile-action-sheet__content">
          {links.map((link) => (
            <Link 
              key={link.label} 
              href={link.path} 
              onClick={onClose}
              className={`mobile-action-sheet__item ${pathname === link.path ? 'active' : ''}`}
            >
              <div className="mobile-action-sheet__icon-wrap">
                <AdminIcon name={link.icon} className="mobile-action-sheet__icon" />
              </div>
              <div className="mobile-action-sheet__text">
                <strong>{link.label}</strong>
                <span>{link.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
