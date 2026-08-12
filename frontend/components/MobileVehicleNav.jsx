'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminIcon from '@/components/admin/AdminIcons';

export default function MobileVehicleNav({ onClose }) {
  const pathname = usePathname();

  const vehicleLinks = [
    { path: '/vehicles/dashboard', label: 'Vehicle Dashboard', icon: 'dashboard', description: 'Overview of vehicle metrics' },
    { path: '/equipment/movements', label: 'Vehicle Entry & Exit', icon: 'entryExit', description: 'Log movements at the gate' },
    { path: '/vehicles/registrations?status=Pending', label: 'Vehicle Registrations', icon: 'registrations', description: 'Manage pending vehicle requests' },
    { path: '/vehicles', label: 'Vehicle Master', icon: 'companies', description: 'Complete database of all vehicles' },
    { path: '/vehicles/reports', label: 'Vehicle Reports', icon: 'reports', description: 'Analytics and exportable data' },
  ];

  return (
    <>
      <div className="mobile-drawer-overlay" onClick={onClose} style={{ zIndex: 1500 }} />
      <div className="mobile-action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-action-sheet__header">
          <span className="mobile-action-sheet__title">Vehicle & Equipment</span>
          <button className="mobile-action-sheet__close" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="mobile-action-sheet__content">
          {vehicleLinks.map((link) => (
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
