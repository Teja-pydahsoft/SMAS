'use client';

import { usePwaInstall } from '@/hooks/usePwaInstall';
import { PWA_APP_NAME } from '@/lib/pwa/constants';

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function PwaInstallBanner() {
  const { visible, installing, iosHint, canInstall, dismiss, install } = usePwaInstall();

  if (!visible) return null;

  return (
    <div className="pwa-install-banner" role="region" aria-label="Install web app">
      <div className="pwa-install-banner__inner">
        <div className="pwa-install-banner__icon" aria-hidden>
          <img src="/icons/icon-192.png" alt="" className="pwa-install-banner__icon-img" width={44} height={44} />
        </div>

        <div className="pwa-install-banner__copy">
          <p className="pwa-install-banner__title">Install {PWA_APP_NAME}</p>
          <p className="pwa-install-banner__subtitle">
            {iosHint
              ? 'Tap Share, then Add to Home Screen for quick access'
              : 'Add to home screen for quick access'}
          </p>
        </div>

        <div className="pwa-install-banner__actions">
          {canInstall && (
            <button
              type="button"
              className="pwa-install-banner__install"
              onClick={install}
              disabled={installing}
            >
              <DownloadIcon />
              <span>{installing ? 'Installing…' : 'Install'}</span>
            </button>
          )}

          <button
            type="button"
            className="pwa-install-banner__close"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
