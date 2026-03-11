'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe, ChevronRight, Bell, Shield, Info, X, DollarSign, ArrowLeft } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useDisplayCurrency, type DisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import BottomNav from './BottomNav';

// ─── Types ──────────────────────────────────────────────

interface ClientSettingsProps {
  tenantSlug: string;
  tenantName: string;
  tenantLogo: string | null;
  currency: string;
  supportedCurrencies?: string[];
}

const CURRENCY_OPTIONS: { code: DisplayCurrency; label: string; flag: string }[] = [
  { code: 'XAF', label: 'F CFA', flag: '🇹🇩' },
  { code: 'EUR', label: 'Euro', flag: '🇪🇺' },
  { code: 'USD', label: 'Dollar', flag: '🇺🇸' },
];

// ─── Component ──────────────────────────────────────────

export default function ClientSettings({
  tenantSlug,
  tenantName,
  tenantLogo,
  supportedCurrencies,
}: ClientSettingsProps) {
  const locale = useLocale();
  const t = useTranslations('tenant');
  const router = useRouter();
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const lang = locale.startsWith('fr') ? 'fr' : 'en';

  // Use useSyncExternalStore to read browser Notification API without hydration mismatch
  const noopSubscribe = useCallback(() => () => {}, []);
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
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const notificationsEnabled = userToggled ?? browserGranted;
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const setLanguage = useCallback((l: string) => {
    const newLocale = l === 'fr' ? 'fr-FR' : 'en-US';
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  }, []);

  const handleCurrencyChange = useCallback(
    (code: DisplayCurrency) => setDisplayCurrency(code),
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
        if (permission === 'granted') setUserToggled(true);
      } catch (error) {
        logger.error('Notification permission error', error);
      }
    } else {
      setUserToggled(false);
    }
  }, [notificationsEnabled, notificationsSupported]);

  // ─── Render ─────────────────────────────────────────────

  return (
    <main
      className="min-h-screen bg-app-bg"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ─── HEADER — matching cart page ─────────────── */}
      <div className="sticky top-0 z-40 bg-app-card border-b border-app-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center">
          <button
            onClick={() => router.push(`/sites/${tenantSlug}`)}
            className="p-2 -ml-2 text-app-text-secondary hover:text-app-text transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold text-app-text">{t('settingsTitle')}</h1>
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* ── SECTION: PREFERENCES ──────────────────── */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted pl-1 mb-2.5">
            {t('preferencesSection')}
          </h2>

          <section className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            {/* Language */}
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 10%, transparent)',
                  }}
                >
                  <Globe
                    className="w-[18px] h-[18px]"
                    style={{ color: 'var(--tenant-primary)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-app-text">{t('languageLabel')}</p>
                  <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wide">
                    {t('currentLanguage')}
                  </p>
                </div>
              </div>
              {/* FR / EN pill */}
              <div className="flex bg-app-elevated p-0.5 rounded-lg">
                <button
                  onClick={() => setLanguage('fr')}
                  className={cn(
                    'text-[10px] font-bold px-3 py-1.5 rounded-md transition-all',
                    lang === 'fr' ? 'bg-app-card shadow-sm' : 'text-app-text-muted',
                  )}
                  style={lang === 'fr' ? { color: 'var(--tenant-primary)' } : undefined}
                >
                  FR
                </button>
                <button
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'text-[10px] font-bold px-3 py-1.5 rounded-md transition-all',
                    lang === 'en' ? 'bg-app-card shadow-sm' : 'text-app-text-muted',
                  )}
                  style={lang === 'en' ? { color: 'var(--tenant-primary)' } : undefined}
                >
                  EN
                </button>
              </div>
            </div>

            <div className="h-px bg-app-border/50 mx-4" />

            {/* Currency */}
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <DollarSign className="w-[18px] h-[18px] text-emerald-600" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-app-text">{t('currencyLabel')}</p>
                  <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wide">
                    {t('priceDisplay')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CURRENCY_OPTIONS.filter(
                  (c) =>
                    !supportedCurrencies ||
                    supportedCurrencies.length <= 1 ||
                    supportedCurrencies.includes(c.code),
                ).map((c) => (
                  <button
                    key={c.code}
                    onClick={() => handleCurrencyChange(c.code)}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all',
                      displayCurrency === c.code
                        ? 'text-white shadow-sm'
                        : 'bg-app-card border border-app-border text-app-text-muted',
                    )}
                    style={
                      displayCurrency === c.code
                        ? { backgroundColor: 'var(--tenant-primary)' }
                        : undefined
                    }
                  >
                    <span className="mr-1 opacity-70">{c.flag}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ── SECTION: SUPPORT & INFOS ─────────────── */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted pl-1 mb-2.5">
            {t('supportSection')}
          </h2>

          <section className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            {/* Notifications */}
            <button
              onClick={toggleNotifications}
              disabled={!notificationsSupported}
              className={cn(
                'w-full px-4 py-3.5 flex items-center justify-between',
                !notificationsSupported && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Bell className="w-[18px] h-[18px] text-orange-500" strokeWidth={1.5} />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-bold text-app-text">{t('notificationsLabel')}</p>
                  <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wide">
                    {!notificationsSupported
                      ? t('notificationsNotSupported')
                      : notificationsEnabled
                        ? t('notificationsEnabled')
                        : t('notificationsDisabled')}
                  </p>
                </div>
              </div>
              {/* Toggle switch */}
              <div
                className="w-11 h-6 rounded-full p-1 transition-colors flex-shrink-0"
                style={{
                  backgroundColor: notificationsEnabled ? 'var(--tenant-primary)' : '#e5e7eb',
                }}
              >
                <div
                  className="w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                  style={{
                    transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </div>
            </button>

            <div className="h-px bg-app-border/50 mx-4" />

            {/* Privacy */}
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="w-full px-4 py-3.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Shield className="w-[18px] h-[18px] text-purple-600" strokeWidth={1.5} />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-bold text-app-text">{t('privacyPolicy')}</p>
                  <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wide">
                    {t('yourData')}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-[18px] h-[18px] text-app-text-muted/40" />
            </button>

            <div className="h-px bg-app-border/50 mx-4" />

            {/* About */}
            <button
              onClick={() => setShowAboutModal(true)}
              className="w-full px-4 py-3.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 10%, transparent)',
                  }}
                >
                  <Info
                    className="w-[18px] h-[18px]"
                    style={{ color: 'var(--tenant-primary)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-bold text-app-text">{t('aboutLabel')}</p>
                  <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wide">
                    {tenantName}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-[18px] h-[18px] text-app-text-muted/40" />
            </button>
          </section>
        </div>

        {/* Version */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[10px] font-bold text-app-text-muted/40 uppercase tracking-[0.25em]">
            ATTABL v1.0
          </p>
        </div>
      </div>

      {/* ─── BOTTOM NAV ──────────────────────────── */}
      <BottomNav tenantSlug={tenantSlug} />

      {/* ─── PRIVACY MODAL ───────────────────────── */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowPrivacyModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative bg-app-card w-full max-w-lg max-h-[85vh] rounded-t-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-4 flex items-center justify-between border-b border-app-border/50">
              <div className="w-8" />
              <h2 className="text-sm font-black text-app-text uppercase tracking-widest">
                {t('privacyTitle')}
              </h2>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="p-2 bg-app-elevated rounded-full"
              >
                <X className="w-4 h-4 text-app-text-muted" />
              </button>
            </div>
            <div className="p-6 pb-24 overflow-y-auto max-h-[75vh] space-y-5">
              <section>
                <h3 className="text-sm font-bold text-app-text mb-1.5">
                  {t('dataCollectionTitle')}
                </h3>
                <p className="text-[13px] text-app-text-muted leading-relaxed">
                  {t('dataCollectionDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold text-app-text mb-1.5">{t('usageTitle')}</h3>
                <p className="text-[13px] text-app-text-muted leading-relaxed">{t('usageDesc')}</p>
              </section>
              <section>
                <h3 className="text-sm font-bold text-app-text mb-1.5">{t('storageTitle')}</h3>
                <p className="text-[13px] text-app-text-muted leading-relaxed">
                  {t('storageDesc')}
                </p>
              </section>
              <div className="pt-6 mt-6 border-t border-app-border/50">
                <p className="text-[10px] text-app-text-muted font-bold uppercase tracking-widest">
                  {tenantName} • privacy@attabl.com
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABOUT MODAL ─────────────────────────── */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowAboutModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative bg-app-card w-full max-w-lg rounded-t-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-4 flex items-center justify-between border-b border-app-border/50">
              <div className="w-8" />
              <h2 className="text-sm font-black text-app-text uppercase tracking-widest">
                {t('aboutTitle')}
              </h2>
              <button
                onClick={() => setShowAboutModal(false)}
                className="p-2 bg-app-elevated rounded-full"
              >
                <X className="w-4 h-4 text-app-text-muted" />
              </button>
            </div>
            <div className="px-10 py-10 pb-20 overflow-y-auto max-h-[85vh]">
              <div className="text-center mb-10">
                {tenantLogo && (
                  <div className="mb-6 h-16 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tenantLogo}
                      alt={tenantName}
                      className="h-full w-auto object-contain"
                    />
                  </div>
                )}
                <h3
                  className="text-[11px] font-black uppercase tracking-[0.3em]"
                  style={{ color: 'var(--tenant-primary)' }}
                >
                  {tenantName}
                </h3>
              </div>
              <div className="text-center max-w-xs mx-auto">
                <p className="text-[15px] text-app-text font-bold leading-relaxed mb-4">
                  {t('aboutAppDesc', { name: tenantName })}
                </p>
                <p className="text-[13px] text-app-text-muted leading-relaxed">
                  {t('aboutAppSubtext')}
                </p>
              </div>
              <div className="mt-12 text-center">
                <div className="h-px bg-gradient-to-r from-transparent via-app-border to-transparent mb-6" />
                <p className="text-[9px] text-app-text-muted/40 font-bold uppercase tracking-widest">
                  Powered by ATTABL • v1.0
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
