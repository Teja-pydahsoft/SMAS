'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bindInstallPromptEvents,
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  subscribeInstallPrompt,
} from '@/lib/pwa/installPrompt';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function shouldShowIosBanner() {
  return isIosDevice() && !isStandalone();
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const syncVisibility = useCallback((prompt, isDismissed = dismissed) => {
    if (isStandalone() || isDismissed) {
      setVisible(false);
      setDeferredPrompt(null);
      setIosHint(false);
      return;
    }

    if (prompt?.prompt) {
      setDeferredPrompt(prompt);
      setIosHint(false);
      setVisible(true);
      return;
    }

    if (shouldShowIosBanner()) {
      setDeferredPrompt(null);
      setIosHint(true);
      setVisible(true);
      return;
    }

    setDeferredPrompt(null);
    setIosHint(false);
    setVisible(false);
  }, [dismissed]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    bindInstallPromptEvents();

    const params = new URLSearchParams(window.location.search);
    if (process.env.NODE_ENV === 'development' && params.get('pwa') === 'preview') {
      setVisible(true);
      setIosHint(false);
      setDeferredPrompt({ prompt: async () => ({ outcome: 'dismissed' }) });
      return undefined;
    }

    if (isStandalone()) return undefined;

    syncVisibility(getDeferredInstallPrompt());
    return subscribeInstallPrompt((prompt) => syncVisibility(prompt, dismissed));
  }, [dismissed, syncVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onPageShow = () => {
      setDismissed(false);
      syncVisibility(getDeferredInstallPrompt(), false);
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [syncVisibility]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPrompt || getDeferredInstallPrompt();
    if (!prompt?.prompt) return false;

    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        clearDeferredInstallPrompt();
        setVisible(false);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  return {
    visible,
    installing,
    iosHint,
    canInstall: Boolean(deferredPrompt?.prompt),
    dismiss,
    install,
  };
}
