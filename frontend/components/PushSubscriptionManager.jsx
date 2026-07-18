'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { resyncPushSubscription } from '@/lib/pushNotifications';

/**
 * Silent keeper for push subscriptions: when a signed-in user already granted
 * notification permission, re-registers this browser with the backend so
 * overstay alerts keep working. Never prompts — enabling alerts is done via
 * the NotificationBell on the dashboard.
 */
export default function PushSubscriptionManager() {
  const { user } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (!user || attempted.current) return;
    attempted.current = true;
    resyncPushSubscription();
  }, [user]);

  return null;
}
