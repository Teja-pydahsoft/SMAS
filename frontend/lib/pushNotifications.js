import { api } from '@/lib/api/client';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Current push state:
 * 'unsupported' | 'server-off' | 'blocked' | 'on' | 'off'
 */
export async function getPushStatus() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';

  try {
    const { enabled } = await api.push.publicKey();
    if (!enabled) return 'server-off';
  } catch {
    return 'server-off';
  }

  if (Notification.permission !== 'granted') return 'off';

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Ask permission (needs a user gesture for best results), subscribe the
 * browser, and register the subscription with the backend.
 */
export async function enablePushNotifications() {
  if (!isPushSupported()) return { ok: false, status: 'unsupported' };

  const { enabled, publicKey } = await api.push.publicKey();
  if (!enabled || !publicKey) return { ok: false, status: 'server-off' };

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { ok: false, status: 'blocked' };
  if (permission !== 'granted') return { ok: false, status: 'off' };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.push.subscribe(subscription.toJSON());
  return { ok: true, status: 'on' };
}

/** Unsubscribe this browser and remove it from the backend. */
export async function disablePushNotifications() {
  if (!isPushSupported()) return { ok: true, status: 'unsupported' };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    await api.push.unsubscribe(endpoint).catch(() => {});
  }
  return { ok: true, status: 'off' };
}

/**
 * Silent re-sync: if permission is already granted, make sure the backend
 * still has this browser's subscription. Never prompts the user.
 */
export async function resyncPushSubscription() {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const { enabled, publicKey } = await api.push.publicKey();
    if (!enabled || !publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api.push.subscribe(subscription.toJSON());
  } catch (error) {
    console.warn('Push subscription re-sync failed:', error?.message || error);
  }
}
