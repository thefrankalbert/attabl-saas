'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Share, X, Download, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  appName?: string;
  logoUrl?: string;
  hasFloatingCart?: boolean;
}

// ─── Storage keys ────────────────────────────────────────
const STORAGE_DISMISSED_AT = 'install_prompt_dismissed_at';
const STORAGE_DISMISS_COUNT = 'install_prompt_dismiss_count';
const STORAGE_VISIT_COUNT = 'install_prompt_visit_count';

const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_DISMISSALS = 3; // Stop showing after 3 dismissals

// ─── Hydration-safe browser detection ────────────────────
const noopSubscribe = () => () => {};

function useIsStandalone(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(window.navigator as Navigator & { standalone?: boolean }).standalone,
    () => false,
  );
}

function useIsIOS(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()),
    () => false,
  );
}

// ─── Component ───────────────────────────────────────────
export default function InstallPrompt({
  appName = 'Attabl',
  logoUrl,
  hasFloatingCart = false,
}: InstallPromptProps) {
  const t = useTranslations('installPrompt');
  const isStandalone = useIsStandalone();
  const isIOS = useIsIOS();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    // ─── Check dismiss limits ──────────────────────────
    // BUG-36: Reset dismiss counter after 30 days so the prompt can reappear
    const lastDismissedAt = localStorage.getItem(STORAGE_DISMISSED_AT);
    if (lastDismissedAt) {
      const daysSinceLast = (Date.now() - parseInt(lastDismissedAt)) / 86400000;
      if (daysSinceLast > 30) {
        localStorage.removeItem(STORAGE_DISMISS_COUNT);
        localStorage.removeItem(STORAGE_DISMISSED_AT);
      }
    }

    const dismissCount = parseInt(localStorage.getItem(STORAGE_DISMISS_COUNT) || '0');
    if (dismissCount >= MAX_DISMISSALS) return;

    const dismissedAt = localStorage.getItem(STORAGE_DISMISSED_AT);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < COOLDOWN_MS) return;

    // ─── Track visits for engagement check ─────────────
    const visitCount = parseInt(localStorage.getItem(STORAGE_VISIT_COUNT) || '0') + 1;
    localStorage.setItem(STORAGE_VISIT_COUNT, String(visitCount));

    // ─── Engagement-based trigger ──────────────────────
    // QR code users (URL has ?table= param): show immediately
    // 2nd+ visit: show after 1.5s
    // 1st visit: show after scroll
    const isQrScan = new URLSearchParams(window.location.search).has('table');
    let showTimer: ReturnType<typeof setTimeout> | undefined;

    const triggerShow = (delay = 1500) => {
      showTimer = setTimeout(() => setShow(true), delay);
    };

    if (isQrScan) {
      triggerShow(800);
    } else if (visitCount >= 2) {
      triggerShow();
    } else {
      // 1st visit: wait for meaningful scroll (200px)
      const onScroll = () => {
        if (window.scrollY > 200) {
          window.removeEventListener('scroll', onScroll);
          triggerShow();
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        if (showTimer) clearTimeout(showTimer);
      };
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
    };
  }, [isStandalone]);

  // ─── Capture beforeinstallprompt (Android/Desktop) ───
  useEffect(() => {
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(STORAGE_DISMISSED_AT, Date.now().toString());
    const count = parseInt(localStorage.getItem(STORAGE_DISMISS_COUNT) || '0') + 1;
    localStorage.setItem(STORAGE_DISMISS_COUNT, String(count));
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      handleDismiss();
    }
  }, [deferredPrompt, handleDismiss]);

  // iOS Safari does NOT allow programmatic install. The closest we can do is
  // open the system Share sheet (where "Add to Home Screen" lives) directly via
  // navigator.share(). The user still has to tap that one entry, but they don't
  // have to find the Share button themselves first.
  const handleIOSInstall = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: appName,
          text: t('installOnHomeScreen', { appName }),
          url: window.location.href,
        });
      } catch {
        // User cancelled or share failed - instructions already visible
      }
    }
  }, [appName, t]);

  if (!show || isStandalone) return null;

  return (
    <div
      className="fixed left-4 right-4 lg:left-auto lg:right-8 lg:max-w-sm max-w-sm mx-auto z-[55] bg-app-bg rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 transition-[bottom] border border-app-border text-app-text"
      style={{
        bottom: hasFloatingCart
          ? 'calc(140px + env(safe-area-inset-bottom, 0px))'
          : 'calc(96px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center gap-3 p-3">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={appName}
            width={40}
            height={40}
            className="rounded-lg bg-app-bg p-1"
          />
        ) : (
          <div className="w-10 h-10 bg-app-bg rounded-lg flex items-center justify-center font-bold text-xl text-app-text">
            {appName.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm leading-tight truncate">{appName}</h3>
          <p className="text-[11px] mt-0.5 text-app-text-muted">{t('subtitle')}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={isIOS ? handleIOSInstall : handleInstall}
          className="px-3 py-1.5 bg-app-bg rounded-lg text-xs font-bold whitespace-nowrap text-app-text h-auto border-none"
        >
          <Download size={14} /> {t('install')}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label={t('close')}
          className="p-1 text-app-text-secondary h-8 w-8"
        >
          <X size={16} />
        </Button>
      </div>

      {isIOS && (
        <div className="px-3 pb-3 pt-0 border-t border-app-border text-xs space-y-2 text-app-text-secondary">
          <p className="flex items-center gap-2 pt-2">
            <Share size={14} className="shrink-0" /> {t('iosStep1')}
          </p>
          <p className="flex items-center gap-2">
            <Plus size={14} className="shrink-0" /> {t('iosStep2')}
          </p>
        </div>
      )}
    </div>
  );
}
