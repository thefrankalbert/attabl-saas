'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Share, X, Download, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    // ─── Check dismiss limits ──────────────────────────
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

  if (!show || isStandalone) return null;

  return (
    <div
      className="fixed left-4 right-4 lg:left-auto lg:right-8 lg:max-w-sm max-w-sm mx-auto z-[55] bg-white rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 transition-[bottom]"
      style={{
        border: '1px solid #EEEEEE',
        color: '#1A1A1A',
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
            className="rounded-lg bg-white p-1"
          />
        ) : (
          <div
            className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-bold text-xl"
            style={{ color: '#1A1A1A' }}
          >
            {appName.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm leading-tight">{t('installApp', { name: appName })}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: '#B0B0B0' }}>
            {t('subtitle')}
          </p>
        </div>

        {isIOS ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1"
            style={{ color: '#1A1A1A' }}
          >
            <Download size={14} /> {t('install')}
          </button>
        ) : (
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1"
            style={{ color: '#1A1A1A' }}
          >
            <Download size={14} /> {t('install')}
          </button>
        )}

        <button onClick={handleDismiss} className="p-1" style={{ color: '#737373' }}>
          <X size={16} />
        </button>
      </div>

      {isIOS && isExpanded && (
        <div
          className="px-3 pb-3 pt-0 border-t border-[#EEEEEE] text-xs space-y-2"
          style={{ color: '#737373' }}
        >
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
