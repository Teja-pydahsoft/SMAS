'use client';

import { usePathname } from 'next/navigation';
import PwaInstallBanner from '@/components/PwaInstallBanner';
import PwaRegistrar from '@/components/PwaRegistrar';

export default function PwaShell() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <>
      <PwaRegistrar />
      {isLoginPage && <PwaInstallBanner />}
    </>
  );
}
