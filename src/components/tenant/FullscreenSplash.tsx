'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface FullscreenSplashProps {
  tenantName: string;
  logoUrl?: string | null;
  primaryColor?: string;
}

const noopSubscribe = () => () => {};

function useIsStandalone(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      !!(window.navigator as Navigator & { standalone?: boolean }).standalone,
    () => false,
  );
}

/** Check if splash should show - evaluated once at mount via useSyncExternalStore */
function useShouldShowSplash(isStandalone: boolean): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const params = new URLSearchParams(window.location.search);
      const isQrScan = params.has('table') || params.has('t');
      if (!isQrScan) return false;
      if (isStandalone) return false;
      if (sessionStorage.getItem('fullscreen_splash_shown')) return false;
      if (!document.documentElement.requestFullscreen) return false;
      sessionStorage.setItem('fullscreen_splash_shown', '1');
      return true;
    },
    () => false,
  );
}

/**
 * Full-screen branded splash shown when user arrives via QR code scan.
 * On tap, requests the Fullscreen API to hide the browser URL bar,
 * giving a native app-like experience.
 *
 * - Only shows on first QR scan per session (sessionStorage)
 * - Skipped if already in standalone/fullscreen PWA mode
 * - Falls back gracefully if Fullscreen API is not supported (iOS Safari)
 */
export default function FullscreenSplash({
  tenantName,
  logoUrl,
  primaryColor = '#1A1A1A',
}: FullscreenSplashProps) {
  const t = useTranslations('tenant');
  const isStandalone = useIsStandalone();
  const shouldShow = useShouldShowSplash(isStandalone);
  const [dismissed, setDismissed] = useState(false);
  const show = shouldShow && !dismissed;

  const handleEnter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Fullscreen not supported or denied - continue normally
    }
    setDismissed(true);
  }, []);

  const handleSkip = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-app-bg"
      style={{ touchAction: 'none' }}
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${primaryColor}, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col items-center gap-6 px-8 text-center">
        {/* Logo */}
        {logoUrl ? (
          <div className="w-24 h-24 rounded-[10px] overflow-hidden bg-app-bg border border-app-border">
            <Image
              src={logoUrl}
              alt={tenantName}
              width={96}
              height={96}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="w-24 h-24 rounded-[10px] flex items-center justify-center text-white text-4xl font-bold border border-app-border"
            style={{ backgroundColor: primaryColor }}
          >
            {tenantName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Restaurant name */}
        <div>
          <h1 className="text-2xl font-bold text-app-text">{tenantName}</h1>
          <p className="text-sm mt-1 text-app-text-muted">{t('splashSubtitle')}</p>
        </div>

        {/* Enter button */}
        <Button
          onClick={handleEnter}
          className="mt-4 px-10 py-3.5 rounded-[10px] text-white font-bold text-base active:scale-95 h-auto"
          style={{ backgroundColor: primaryColor }}
        >
          {t('splashEnter')}
        </Button>

        {/* Skip link */}
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-xs underline underline-offset-2 text-app-text-muted h-auto px-0"
        >
          {t('splashSkip')}
        </Button>
      </div>

      {/* Powered by */}
      <p className="absolute bottom-8 text-[12px] text-app-text-secondary">Powered by ATTABL</p>
    </div>
  );
}
