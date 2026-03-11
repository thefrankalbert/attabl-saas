'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

/**
 * Client-side notification sound file.
 * Uses gentle-chime to differentiate from the admin kitchen bell.
 */
const CLIENT_NOTIFICATION_SOUND = '/sounds/gentle-chime.wav';

interface UseClientOrderNotificationReturn {
  /** Request browser notification permission (call on user gesture) */
  requestPermission: () => Promise<void>;
  /** Current permission state */
  permissionState: NotificationPermission | 'unsupported';
  /** Fire notification for a ready order */
  notifyOrderReady: (orderNumber: string) => void;
  /** Whether a "ready" banner should be shown */
  showReadyBanner: boolean;
  /** Dismiss the ready banner */
  dismissBanner: () => void;
  /** The order number that triggered the banner */
  readyOrderNumber: string | null;
}

/**
 * Hook for client-facing order-ready notifications.
 *
 * When an order status changes to "ready", this hook:
 * 1. Shows an in-app banner
 * 2. Plays a gentle notification sound (different from admin KDS sound)
 * 3. Vibrates the device (if supported)
 * 4. Sends a browser Notification (if permission was granted)
 *
 * No server-side push infrastructure needed — uses the built-in
 * browser Notification API + Supabase Realtime (handled by caller).
 */
export function useClientOrderNotification(): UseClientOrderNotificationReturn {
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    () => {
      if (typeof window === 'undefined') return 'unsupported';
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },
  );

  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const [readyOrderNumber, setReadyOrderNumber] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Preload the notification sound
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio(CLIENT_NOTIFICATION_SOUND);
    audio.preload = 'auto';
    audio.load();
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }

    if (Notification.permission === 'granted') {
      setPermissionState('granted');
      return;
    }

    if (Notification.permission === 'denied') {
      setPermissionState('denied');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
    } catch {
      logger.warn('Notification.requestPermission() failed');
      setPermissionState('denied');
    }
  }, []);

  const notifyOrderReady = useCallback((orderNumber: string) => {
    // 1. Show in-app banner
    setShowReadyBanner(true);
    setReadyOrderNumber(orderNumber);

    // 2. Play notification sound
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        logger.warn('Client notification sound play() blocked');
      });
    }

    // 3. Vibrate device (mobile)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // Vibration not available — silently ignore
      }
    }

    // 4. Browser notification (if tab is in background or permission granted)
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const notification = new Notification('Commande prête !', {
          body: `Votre commande #${orderNumber} est prête.`,
          icon: '/icons/icon-192x192.png',
          tag: `order-ready-${orderNumber}`,
          requireInteraction: false,
        });

        // Auto-close after 8 seconds
        setTimeout(() => notification.close(), 8000);
      } catch {
        logger.warn('Browser Notification constructor failed');
      }
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setShowReadyBanner(false);
    setReadyOrderNumber(null);
  }, []);

  return {
    requestPermission,
    permissionState,
    notifyOrderReady,
    showReadyBanner,
    dismissBanner,
    readyOrderNumber,
  };
}
