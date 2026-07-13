'use client';

import { useCallback, useEffect, useState } from 'react';

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

  const revealBanner = useCallback((prompt = null) => {
    if (isStandalone()) return;
    if (prompt) {
      setDeferredPrompt(prompt);
      setIosHint(false);
      setVisible(true);
      return;
    }
    if (shouldShowIosBanner()) {
      setIosHint(true);
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onPageShow = () => {
      setDismissed(false);
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (dismissed) return undefined;
    if (deferredPrompt) {
      setVisible(true);
      setIosHint(false);
      return undefined;
    }
    if (shouldShowIosBanner()) {
      setIosHint(true);
      setVisible(true);
    }
    return undefined;
  }, [dismissed, deferredPrompt]);

  useEffect(() => {
    if (typeof window === 'undefined' || dismissed) return undefined;
    if (isStandalone()) return undefined;

    const params = new URLSearchParams(window.location.search);
    if (process.env.NODE_ENV === 'development' && params.get('pwa') === 'preview') {
      setVisible(true);
      setIosHint(params.get('ios') === '1');
      setDeferredPrompt({ prompt: async () => ({ outcome: 'dismissed' }) });
      return undefined;
    }

    const onBeforeInstall = (event) => {
      event.preventDefault();
      revealBanner(event);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setVisible(false);
      setIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if (shouldShowIosBanner()) {
      setIosHint(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dismissed, revealBanner]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
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
    canInstall: Boolean(deferredPrompt),
    dismiss,
    install,
  };
}
