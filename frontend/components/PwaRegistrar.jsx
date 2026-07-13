'use client';

import { useEffect } from 'react';
import { bindInstallPromptEvents } from '@/lib/pwa/installPrompt';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    bindInstallPromptEvents();

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        await registration.update();
      } catch (error) {
        console.warn('SAMS PWA service worker registration failed:', error);
      }
    };

    register();

    return undefined;
  }, []);

  return null;
}
