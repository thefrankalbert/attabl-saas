'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Globe,
  ChevronRight,
  Bell,
  Shield,
  Info,
  X,
  DollarSign,
  ArrowLeft,
  Clock,
  Mail,
  MapPin,
  Phone,
  HelpCircle,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { useDisplayCurrency, type DisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import BottomNav from './BottomNav';

// Types

interface ClientSettingsProps {
  tenantSlug: string;
  tenantName: string;
  tenantLogo: string | null;
  tenantDescription?: string | null;
  tenantAddress?: string | null;
  tenantCity?: string | null;
  tenantCountry?: string | null;
  tenantPhone?: string | null;
  currency: string;
  supportedCurrencies?: string[];
}

const CURRENCY_OPTIONS: { code: DisplayCurrency; label: string }[] = [
  { code: 'XOF', label: 'FCFA' },
  { code: 'EUR', label: 'Euro' },
  { code: 'USD', label: 'Dollar' },
];

// Reusable row subcomponent - kept inside file to preserve single-file structure
function SettingsRow({
  icon,
  iconBg = 'rgb(246, 246, 246)',
  iconColor = 'rgb(115, 115, 115)',
  label,
  subtitle,
  onClick,
  right,
  disabled,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  label: string;
  subtitle: string;
  onClick?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <span style={{ color: iconColor }} aria-hidden>
            {icon}
          </span>
        </div>
        <div className="text-left min-w-0">
          <p className="text-[13px] font-bold truncate" style={{ color: 'rgb(26, 26, 26)' }}>
            {label}
          </p>
          <p className="text-[12px] font-normal truncate" style={{ color: 'rgb(115, 115, 115)' }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        {right ?? (
          <ChevronRight className="w-[18px] h-[18px]" style={{ color: 'rgb(176, 176, 176)' }} />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'w-full min-h-[44px] px-4 py-3.5 flex items-center justify-between rounded-none h-auto',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {content}
      </Button>
    );
  }

  return (
    <div className="w-full min-h-[44px] px-4 py-3.5 flex items-center justify-between">
      {content}
    </div>
  );
}

function SectionDivider() {
  return <div className="mx-4" style={{ height: '1px', backgroundColor: 'rgb(238, 238, 238)' }} />;
}

// Component

export default function ClientSettings({
  tenantSlug,
  tenantName,
  tenantLogo,
  tenantDescription,
  tenantAddress,
  tenantCity,
  tenantCountry,
  tenantPhone,
  supportedCurrencies,
}: ClientSettingsProps) {
  const locale = useLocale();
  const t = useTranslations('tenant');
  const router = useRouter();
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const lang = locale.startsWith('fr') ? 'fr' : 'en';

  // Notifications
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

  // Current table from localStorage (stable default for SSR to avoid hydration mismatch)
  const currentTable = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(`attabl_${tenantSlug}_table`);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

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

  const goToOrderHistory = useCallback(() => {
    router.push(`/sites/${tenantSlug}/orders?history=true`);
  }, [router, tenantSlug]);

  const fullAddress = [tenantAddress, tenantCity].filter(Boolean).join(', ');
  const hasAddress = Boolean(tenantAddress || tenantCity || tenantCountry);

  // Render

  return (
    <main
      className="h-full bg-white"
      style={{
        color: 'rgb(26, 26, 26)',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Back button - fixed at top, same bg as page, content scrolls beneath */}
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-lg mx-auto px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/sites/${tenantSlug}`)}
            className="w-9 h-9 rounded-full bg-app-elevated text-app-text"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-5">
        {/* 1. Restaurant Profile Card */}
        <section
          className="bg-white rounded-[10px] overflow-hidden"
          style={{ border: '1px solid rgb(238, 238, 238)' }}
        >
          <div className="px-4 py-6 flex flex-col items-center text-center">
            <div
              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-3"
              style={{ backgroundColor: 'rgb(246, 246, 246)' }}
            >
              {tenantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenantLogo} alt={tenantName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold" style={{ color: 'rgb(176, 176, 176)' }}>
                  {tenantName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <h2
              className="text-[20px] font-bold leading-tight"
              style={{ color: 'rgb(26, 26, 26)' }}
            >
              {tenantName}
            </h2>
            {tenantDescription ? (
              <p
                className="text-[13px] mt-1.5 line-clamp-2 max-w-xs"
                style={{ color: 'rgb(115, 115, 115)', lineHeight: 1.4 }}
              >
                {tenantDescription}
              </p>
            ) : null}
          </div>
        </section>

        {/* 2. MES COMMANDES */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('ordersSection')}
          </h2>

          <section
            className="bg-white rounded-[10px] overflow-hidden"
            style={{ border: '1px solid rgb(238, 238, 238)' }}
          >
            <SettingsRow
              icon={<Clock className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(26, 26, 26)"
              label={t('orderHistoryLabel')}
              subtitle={t('orderHistorySubtitle')}
              onClick={goToOrderHistory}
            />
            <SectionDivider />
            <SettingsRow
              icon={<MapPin className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(115, 115, 115)"
              label={t('currentTableLabel')}
              subtitle={
                currentTable
                  ? t('currentTableSubtitle', { number: currentTable })
                  : t('currentTableNone')
              }
              onClick={() => router.push(`/sites/${tenantSlug}`)}
            />
          </section>
        </div>

        {/* 3. PREFERENCES */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('preferencesSection')}
          </h2>

          <section
            className="bg-white rounded-[10px] overflow-hidden"
            style={{ border: '1px solid rgb(238, 238, 238)' }}
          >
            {/* Language */}
            <div className="px-4 py-3.5 flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgb(246, 246, 246)' }}
                >
                  <Globe
                    className="w-[18px] h-[18px]"
                    style={{ color: 'rgb(26, 26, 26)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                    {t('languageLabel')}
                  </p>
                  <p className="text-[12px] font-normal" style={{ color: 'rgb(115, 115, 115)' }}>
                    {t('currentLanguage')}
                  </p>
                </div>
              </div>
              <div
                className="flex p-0.5 rounded-lg"
                style={{ backgroundColor: 'rgb(246, 246, 246)' }}
              >
                <Button
                  variant="ghost"
                  onClick={() => setLanguage('fr')}
                  className={cn(
                    'text-[11px] font-bold px-3 py-1.5 rounded-md h-auto',
                    lang === 'fr' ? 'bg-white' : '',
                  )}
                  style={
                    lang === 'fr' ? { color: 'rgb(26, 26, 26)' } : { color: 'rgb(115, 115, 115)' }
                  }
                >
                  FR
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'text-[11px] font-bold px-3 py-1.5 rounded-md h-auto',
                    lang === 'en' ? 'bg-white' : '',
                  )}
                  style={
                    lang === 'en' ? { color: 'rgb(26, 26, 26)' } : { color: 'rgb(115, 115, 115)' }
                  }
                >
                  EN
                </Button>
              </div>
            </div>

            <SectionDivider />

            {/* Currency */}
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3.5 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgb(246, 246, 246)' }}
                >
                  <DollarSign
                    className="w-[18px] h-[18px]"
                    style={{ color: 'rgb(26, 26, 26)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                    {t('currencyLabel')}
                  </p>
                  <p className="text-[12px] font-normal" style={{ color: 'rgb(115, 115, 115)' }}>
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
                  <Button
                    key={c.code}
                    variant="outline"
                    onClick={() => handleCurrencyChange(c.code)}
                    className={cn(
                      'flex-1 min-h-[44px] py-2.5 rounded-[10px] text-[13px] font-bold',
                      displayCurrency === c.code ? 'text-white' : 'bg-white',
                    )}
                    style={
                      displayCurrency === c.code
                        ? { backgroundColor: 'rgb(26, 26, 26)' }
                        : { border: '1px solid rgb(238, 238, 238)', color: 'rgb(115, 115, 115)' }
                    }
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* 4. NOTIFICATIONS */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('notificationsSection')}
          </h2>

          <section
            className="bg-white rounded-[10px] overflow-hidden"
            style={{ border: '1px solid rgb(238, 238, 238)' }}
          >
            <SettingsRow
              icon={<Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(115, 115, 115)"
              label={t('notificationsLabel')}
              subtitle={
                !notificationsSupported
                  ? t('notificationsNotSupported')
                  : notificationsEnabled
                    ? t('notificationsEnabled')
                    : t('notificationsDisabled')
              }
              onClick={toggleNotifications}
              disabled={!notificationsSupported}
              right={
                <div
                  className="w-11 h-6 rounded-full p-1 transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: notificationsEnabled
                      ? 'rgb(26, 26, 26)'
                      : 'rgb(238, 238, 238)',
                  }}
                >
                  <div
                    className="w-4 h-4 bg-white rounded-full transition-transform"
                    style={{
                      transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              }
            />
          </section>
        </div>

        {/* 5. LE RESTAURANT */}
        {(hasAddress || tenantPhone) && (
          <div>
            <h2
              className="text-[13px] font-bold pl-1 mb-2.5"
              style={{ color: 'rgb(176, 176, 176)' }}
            >
              {t('restaurantSection')}
            </h2>

            <section
              className="bg-white rounded-[10px] overflow-hidden"
              style={{ border: '1px solid rgb(238, 238, 238)' }}
            >
              {hasAddress && (
                <>
                  <SettingsRow
                    icon={<MapPin className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                    iconBg="rgb(246, 246, 246)"
                    iconColor="rgb(26, 26, 26)"
                    label={t('addressLabel')}
                    subtitle={fullAddress || tenantCountry || t('notAvailable')}
                    right={<span />}
                  />
                  {tenantPhone && <SectionDivider />}
                </>
              )}
              {tenantPhone && (
                <SettingsRow
                  icon={<Phone className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                  iconBg="rgb(246, 246, 246)"
                  iconColor="rgb(26, 26, 26)"
                  label={t('phoneLabel')}
                  subtitle={tenantPhone}
                  onClick={() => {
                    window.location.href = `tel:${tenantPhone}`;
                  }}
                />
              )}
            </section>
          </div>
        )}

        {/* 6. SUPPORT */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('supportSection')}
          </h2>

          <section
            className="bg-white rounded-[10px] overflow-hidden"
            style={{ border: '1px solid rgb(238, 238, 238)' }}
          >
            <SettingsRow
              icon={<HelpCircle className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(26, 26, 26)"
              label={t('helpAndSupport')}
              subtitle={t('helpAndSupportSubtitle')}
              onClick={() => setShowHelpModal(true)}
            />
            <SectionDivider />
            <SettingsRow
              icon={<Shield className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(115, 115, 115)"
              label={t('privacyPolicy')}
              subtitle={t('privacySubtitle')}
              onClick={() => setShowPrivacyModal(true)}
            />
            <SectionDivider />
            <SettingsRow
              icon={<Info className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="rgb(246, 246, 246)"
              iconColor="rgb(26, 26, 26)"
              label={t('aboutLabel')}
              subtitle={tenantName}
              onClick={() => setShowAboutModal(true)}
            />
          </section>
        </div>

        {/* 7. Footer */}
        <div className="text-center pt-4 pb-6 space-y-1">
          <p className="text-[11px] font-normal" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('poweredBy')}
          </p>
          <p className="text-[11px] font-normal" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('appVersion')}
          </p>
        </div>
      </div>

      {/* Bottom Nav */}
      <BottomNav tenantSlug={tenantSlug} />

      {/* Privacy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowPrivacyModal(false)}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}
          />
          <div
            className="relative bg-white w-full max-w-lg max-h-[85vh] rounded-t-2xl overflow-hidden"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="px-4 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                {t('privacyTitle')}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-full min-h-[44px] min-w-[44px] bg-app-elevated"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>
            <div className="p-6 pb-24 overflow-y-auto max-h-[75vh] space-y-5">
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('dataCollectionTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('dataCollectionDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('usageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('usageDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('storageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('storageDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('rightsTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('rightsDesc')}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowAboutModal(false)}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}
          />
          <div
            className="relative bg-white w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="px-4 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                {t('aboutTitle')}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAboutModal(false)}
                className="rounded-full min-h-[44px] min-w-[44px] bg-app-elevated"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>
            <div className="px-10 py-10 pb-20 overflow-y-auto max-h-[85vh]">
              <div className="text-center mb-10">
                <h3 className="text-[11px] font-normal" style={{ color: 'rgb(26, 26, 26)' }}>
                  ATTABL
                </h3>
              </div>
              <div className="text-center max-w-xs mx-auto">
                <p
                  className="text-[15px] font-bold leading-relaxed"
                  style={{ color: 'rgb(26, 26, 26)' }}
                >
                  {t('aboutAppDesc')}
                </p>
              </div>
              <p className="text-center text-[11px] mt-4" style={{ color: 'rgb(176, 176, 176)' }}>
                {t('appVersion')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowHelpModal(false)}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="px-4 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                {t('helpModalTitle')}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHelpModal(false)}
                className="rounded-full min-h-[44px] min-w-[44px] bg-app-elevated"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>

            <div className="py-2">
              <SettingsRow
                icon={<Mail className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                iconBg="rgb(246, 246, 246)"
                iconColor="rgb(26, 26, 26)"
                label={t('helpEmailLabel')}
                subtitle={t('helpEmailSubtitle')}
                onClick={() => {
                  window.location.href = `mailto:support@attabl.com?subject=${encodeURIComponent(
                    `[${tenantName}] Demande d'assistance`,
                  )}`;
                  setShowHelpModal(false);
                }}
              />
              <SectionDivider />
              <SettingsRow
                icon={<Phone className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                iconBg="rgb(246, 246, 246)"
                iconColor="rgb(115, 115, 115)"
                label={t('helpCallBurkinaLabel')}
                subtitle={t('helpCallBurkinaSubtitle')}
                onClick={() => {
                  window.location.href = 'tel:+22665565411';
                  setShowHelpModal(false);
                }}
              />
              <SectionDivider />
              <SettingsRow
                icon={<Phone className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                iconBg="rgb(246, 246, 246)"
                iconColor="rgb(115, 115, 115)"
                label={t('helpCallChadLabel')}
                subtitle={t('helpCallChadSubtitle')}
                onClick={() => {
                  window.location.href = 'tel:+23564940372';
                  setShowHelpModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
