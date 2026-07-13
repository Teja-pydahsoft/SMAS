let deferredPrompt = null;
const listeners = new Set();

function readWindowPrompt() {
  if (typeof window !== 'undefined' && window.__SMAS_DEFERRED_PWA_PROMPT__) {
    deferredPrompt = window.__SMAS_DEFERRED_PWA_PROMPT__;
  }
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener(deferredPrompt);
    } catch {
      /* ignore */
    }
  });
}

export function getDeferredInstallPrompt() {
  readWindowPrompt();
  return deferredPrompt;
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener);
  readWindowPrompt();
  listener(deferredPrompt);
  return () => listeners.delete(listener);
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  if (typeof window !== 'undefined') {
    window.__SMAS_DEFERRED_PWA_PROMPT__ = null;
  }
  notify();
}

export function bindInstallPromptEvents() {
  if (typeof window === 'undefined') return undefined;
  if (window.__SMAS_PWA_LISTENERS_BOUND__) return undefined;
  window.__SMAS_PWA_LISTENERS_BOUND__ = true;

  readWindowPrompt();
  if (deferredPrompt) notify();

  window.addEventListener('sams-pwa-installable', () => {
    readWindowPrompt();
    notify();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.__SMAS_DEFERRED_PWA_PROMPT__ = event;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    clearDeferredInstallPrompt();
  });

  return undefined;
}
