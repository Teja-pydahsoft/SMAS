'use client';

import { useState } from 'react';
import AppSidebar from '@/components/AppSidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import MobileDrawer from '@/components/MobileDrawer';
import MobileVehicleNav from '@/components/MobileVehicleNav';
import MobileEntryExitNav from '@/components/MobileEntryExitNav';

export default function AppLayoutShell({ children }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isVehicleNavOpen, setIsVehicleNavOpen] = useState(false);
  const [isEntryExitMenuOpen, setIsEntryExitMenuOpen] = useState(false);

  return (
    <div className="admin-layout">
      {/* Desktop Sidebar (hidden on mobile via CSS) */}
      <AppSidebar />
      
      {/* Mobile Navigation Layer */}
      <MobileHeader onOpenDrawer={() => setIsDrawerOpen(true)} />
      
      <div className="admin-main">
        <main className="admin-content">{children}</main>
      </div>

      <MobileBottomNav 
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenVehicles={() => setIsVehicleNavOpen(true)}
        onOpenEntryExit={() => setIsEntryExitMenuOpen(true)}
      />

      {isDrawerOpen && (
        <MobileDrawer onClose={() => setIsDrawerOpen(false)} />
      )}

      {isVehicleNavOpen && (
        <MobileVehicleNav onClose={() => setIsVehicleNavOpen(false)} />
      )}

      {isEntryExitMenuOpen && (
        <MobileEntryExitNav onClose={() => setIsEntryExitMenuOpen(false)} />
      )}
    </div>
  );
}
