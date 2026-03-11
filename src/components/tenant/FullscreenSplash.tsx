'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

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

/** Check if splash should show — evaluated once at mount via useSyncExternalStore */
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
  primaryColor = '#000000',
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
      // Fullscreen not supported or denied — continue normally
    }
    setDismissed(true);
  }, []);

  const handleSkip = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
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
          <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg bg-white">
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
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-white text-4xl font-bold shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            {tenantName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Restaurant name */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tenantName}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('splashSubtitle')}</p>
        </div>

        {/* Enter button */}
        <button
          onClick={handleEnter}
          className="mt-4 px-10 py-3.5 rounded-full text-white font-semibold text-base shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: primaryColor }}
        >
          {t('splashEnter')}
        </button>

        {/* Skip link */}
        <button onClick={handleSkip} className="text-xs text-gray-400 underline underline-offset-2">
          {t('splashSkip')}
        </button>
      </div>

      {/* Powered by */}
      <p className="absolute bottom-8 text-[10px] text-gray-300 tracking-wider uppercase">
        Powered by ATTABL
      </p>
    </div>
  );
}
