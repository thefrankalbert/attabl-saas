'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** next-pwa does not emit public/sw.js in development (see next.config.mjs). */
const PUSH_SW_ENABLED = process.env.NODE_ENV === 'production';

function isPushCapableBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    PUSH_SW_ENABLED && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
  );
}

interface UsePushSubscriptionOptions {
  tenantId: string;
  enabled?: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription({ enabled = true }: UsePushSubscriptionOptions) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Register SW and read push subscription (production only - sw.js is build-generated)
  useEffect(() => {
    if (!enabled || !isPushCapableBrowser()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if (cancelled) return;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setIsSupported(true);
        setIsSubscribed(!!subscription);
      } catch (err) {
        logger.warn('Push notifications unavailable', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!cancelled) {
          setIsSupported(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY || !isSupported) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Invalid subscription');
      }

      // Save to server
      const res = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      });

      if (!res.ok) throw new Error('Failed to save subscription');

      setIsSubscribed(true);
      return true;
    } catch (error) {
      logger.error('Push subscribe failed', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (error) {
      logger.error('Push unsubscribe failed', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSubscribed,
    isSupported,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
