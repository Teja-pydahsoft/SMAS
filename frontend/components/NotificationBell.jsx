'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminIcon from '@/components/admin/AdminIcons';
import {
  getPushStatus,
  enablePushNotifications,
  disablePushNotifications,
} from '@/lib/pushNotifications';

const STATUS_META = {
  on: { label: 'Alerts On', dot: '#22C55E', hint: 'Push alerts are active on this device. Click to turn off.' },
  off: { label: 'Enable Alerts', dot: '#F59E0B', hint: 'Click to receive overstay push alerts on this device.' },
  blocked: { label: 'Alerts Blocked', dot: '#EF4444', hint: 'Notifications are blocked. Allow them in your browser site settings.' },
  'server-off': { label: 'Alerts Unavailable', dot: '#9CA3AF', hint: 'Push is not configured on the server (VAPID keys missing).' },
  unsupported: { label: 'Alerts Unsupported', dot: '#9CA3AF', hint: 'This browser does not support push notifications.' },
};

/**
 * Bell toggle for overstay push alerts. Clicking asks for notification
 * permission (a user gesture, so browsers show the prompt reliably) and
 * subscribes this device; clicking again unsubscribes.
 */
export default function NotificationBell() {
  const [status, setStatus] = useState('off');
  const [working, setWorking] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushStatus().then((s) => {
      if (!cancelled) {
        setStatus(s);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (working) return;
    if (status === 'unsupported' || status === 'server-off' || status === 'blocked') return;

    setWorking(true);
    try {
      if (status === 'on') {
        const result = await disablePushNotifications();
        setStatus(result.status);
      } else {
        const result = await enablePushNotifications();
        setStatus(result.status);
      }
    } catch (error) {
      console.warn('Push toggle failed:', error?.message || error);
      setStatus(await getPushStatus());
    } finally {
      setWorking(false);
    }
  }, [status, working]);

  if (!ready) return null;

  const meta = STATUS_META[status] || STATUS_META.off;
  const disabled = working || status === 'unsupported' || status === 'server-off' || status === 'blocked';
  const active = status === 'on';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled && status !== 'blocked'}
      title={meta.hint}
      aria-label={meta.hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.9rem',
        borderRadius: '999px',
        border: `1px solid ${active ? 'rgba(34,197,94,0.45)' : 'var(--border, #E5E7EB)'}`,
        background: active ? 'rgba(34,197,94,0.08)' : 'var(--surface, #fff)',
        color: 'var(--text, #111827)',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: working ? 0.7 : 1,
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', width: 18, height: 18 }}>
        <AdminIcon name="notifications" className="admin-icon notif-bell__icon" />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: meta.dot,
            boxShadow: '0 0 0 2px var(--surface, #fff)',
          }}
        />
      </span>
      <span>{working ? 'Please wait…' : meta.label}</span>
    </button>
  );
}
