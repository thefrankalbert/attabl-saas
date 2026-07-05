'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { useDisplayCurrency, type DisplayCurrency } from '@/contexts/CurrencyContext';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';
import type { QRScanResult } from '@/components/tenant/QRScanner';

// Persisted notification preference (per device). '1' = on, '0' = off.
const NOTIF_PREF_KEY = 'attabl_notif_pref';

export function useClientSettings(tenantSlug: string) {
  const router = useRouter();
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  // Notifications
  const notificationsSupported = useSyncExternalStore(
    noopSubscribe,
    () => 'Notification' in window,
    () => false,
  );
  const browserGranted = useSyncExternalStore(
    noopSubscribe,
    () => 'Notification' in window && Notification.permission === 'granted',
    () => false,
  );
  // Persisted preference (per device), read hydration-safe via the external
  // store: '1' = on, '0' = off, null = follow browser permission.
  const storedNotifPref = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(NOTIF_PREF_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const persistedPref = storedNotifPref === '1' ? true : storedNotifPref === '0' ? false : null;
  // In-session override (takes precedence until reload, when the store wins).
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const notificationsEnabled = userToggled ?? persistedPref ?? browserGranted;

  // Past order count from localStorage (hydration-safe SSR default).
  const orderCount = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        const raw = localStorage.getItem(`attabl_${tenantSlug}_order_ids`);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? String(parsed.length) : '0';
      } catch {
        return '0';
      }
    },
    () => '0',
  );

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const setLanguage = useCallback((l: string) => {
    const newLocale = l === 'fr' ? 'fr-FR' : 'en-US';
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Strict;Secure`;
    window.location.reload();
  }, []);

  const handleCurrencyChange = useCallback(
    (code: string) => setDisplayCurrency(code as DisplayCurrency),
    [setDisplayCurrency],
  );

  const toggleNotifications = useCallback(async () => {
    if (!notificationsSupported) return;
    if (!notificationsEnabled) {
      try {
        const isSecure =
          window.isSecureContext ||
          window.location.protocol === 'https:' ||
          window.location.hostname === 'localhost';
        if (!isSecure) return;
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setUserToggled(true);
          try {
            localStorage.setItem(NOTIF_PREF_KEY, '1');
          } catch {
            // ignore persistence failure
          }
        }
      } catch (error) {
        logger.error('Notification permission error', error);
      }
    } else {
      setUserToggled(false);
      try {
        localStorage.setItem(NOTIF_PREF_KEY, '0');
      } catch {
        // ignore persistence failure
      }
    }
  }, [notificationsEnabled, notificationsSupported]);

  const goToOrderHistory = useCallback(() => {
    router.push(`/sites/${tenantSlug}/orders?history=true`);
  }, [router, tenantSlug]);

  const handleQRScan = useCallback(
    (result: QRScanResult) => {
      if (result.tableNumber) {
        try {
          localStorage.setItem(`attabl_${tenantSlug}_table`, result.tableNumber);
        } catch {
          // localStorage unavailable - the table still flows through the URL below
        }
      }
      setIsScannerOpen(false);
      const target = result.menuSlug
        ? `/sites/${tenantSlug}/menu?menu=${result.menuSlug}${result.tableNumber ? `&table=${result.tableNumber}` : ''}`
        : result.tableNumber
          ? `/sites/${tenantSlug}/menu?table=${result.tableNumber}`
          : `/sites/${tenantSlug}/menu`;
      router.push(target);
    },
    [router, tenantSlug],
  );

  return {
    displayCurrency,
    notificationsSupported,
    notificationsEnabled,
    orderCount,
    showPrivacyModal,
    setShowPrivacyModal,
    showAboutModal,
    setShowAboutModal,
    showHelpModal,
    setShowHelpModal,
    isScannerOpen,
    setIsScannerOpen,
    setLanguage,
    handleCurrencyChange,
    toggleNotifications,
    goToOrderHistory,
    handleQRScan,
  };
}
