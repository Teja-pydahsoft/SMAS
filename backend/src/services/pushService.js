import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import { hasDivisionScope } from '../middleware/auth.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@sams.local';

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
} else {
  console.warn(
    'Web push disabled — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env (npx web-push generate-vapid-keys)'
  );
}

export function isPushConfigured() {
  return configured;
}

export function getVapidPublicKey() {
  return configured ? VAPID_PUBLIC_KEY : null;
}

export async function saveSubscription(userId, subscription, userAgent = '') {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Invalid push subscription payload');
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, userAgent },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await PushSubscription.deleteOne({ endpoint });
}

async function sendToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    // Subscription is gone (unsubscribed / expired) — clean it up
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
    } else {
      console.warn('Push send failed:', err.statusCode || err.message);
    }
    return false;
  }
}

/**
 * Send a push notification to every subscribed system user that can see the
 * given division (super admins + users whose division scope includes it).
 * When divisionId is null, all subscribers are notified.
 */
export async function notifyDivisionAdmins(divisionId, payload) {
  if (!configured) return { sent: 0, total: 0 };

  const subscriptions = await PushSubscription.find({})
    .populate('userId', 'isSuperAdmin divisionIds isActive')
    .lean();

  const eligible = subscriptions.filter((sub) => {
    const user = sub.userId;
    if (!user || user.isActive === false) return false;
    if (!divisionId) return true;
    return hasDivisionScope(user, divisionId);
  });

  let sent = 0;
  for (const sub of eligible) {
    const ok = await sendToSubscription(sub, payload);
    if (ok) sent += 1;
  }
  return { sent, total: eligible.length };
}
