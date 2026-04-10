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
  { code: 'XAF', label: 'FCFA (BEAC)' },
  { code: 'EUR', label: 'Euro' },
  { code: 'USD', label: 'Dollar' },
];

// Reusable row subcomponent - kept inside file to preserve single-file structure
function SettingsRow({
  icon,
  iconBg = '#F6F6F6',
  iconColor = '#737373',
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
          <p className="text-[13px] font-bold truncate" style={{ color: '#1A1A1A' }}>
            {label}
          </p>
          <p className="text-[12px] font-medium truncate" style={{ color: '#737373' }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        {right ?? <ChevronRight className="w-[18px] h-[18px]" style={{ color: '#B0B0B0' }} />}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'w-full min-h-[44px] px-4 py-3.5 flex items-center justify-between',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="w-full min-h-[44px] px-4 py-3.5 flex items-center justify-between">
      {content}
    </div>
  );
}

function SectionDivider() {
  return <div className="mx-4" style={{ height: '1px', backgroundColor: '#EEEEEE' }} />;
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

  const goToOrders = useCallback(() => {
    router.push(`/sites/${tenantSlug}/orders`);
  }, [router, tenantSlug]);

  const fullAddress = [tenantAddress, tenantCity].filter(Boolean).join(', ');
  const hasAddress = Boolean(tenantAddress || tenantCity || tenantCountry);

  // Render

  return (
    <main
      className="h-full bg-white"
      style={{
        color: '#1A1A1A',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Back button - detached, no background bar */}
      <div className="max-w-lg mx-auto px-3 py-2">
        <button
          type="button"
          onClick={() => router.push(`/sites/${tenantSlug}`)}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: '#F6F6F6', color: '#1A1A1A' }}
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-5">
        {/* 1. Restaurant Profile Card */}
        <section
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: '1px solid #EEEEEE' }}
        >
          <div className="px-4 py-6 flex flex-col items-center text-center">
            <div
              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-3"
              style={{ backgroundColor: '#F6F6F6' }}
            >
              {tenantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenantLogo} alt={tenantName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold" style={{ color: '#B0B0B0' }}>
                  {tenantName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <h2 className="text-[20px] font-bold leading-tight" style={{ color: '#1A1A1A' }}>
              {tenantName}
            </h2>
            {tenantDescription ? (
              <p
                className="text-[13px] mt-1.5 line-clamp-2 max-w-xs"
                style={{ color: '#737373', lineHeight: 1.4 }}
              >
                {tenantDescription}
              </p>
            ) : null}
          </div>
        </section>

        {/* 2. MES COMMANDES */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: '#B0B0B0' }}>
            {t('ordersSection')}
          </h2>

          <section
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid #EEEEEE' }}
          >
            <SettingsRow
              icon={<Clock className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#1A1A1A"
              label={t('orderHistoryLabel')}
              subtitle={t('orderHistorySubtitle')}
              onClick={goToOrders}
            />
            <SectionDivider />
            <SettingsRow
              icon={<MapPin className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#737373"
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
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: '#B0B0B0' }}>
            {t('preferencesSection')}
          </h2>

          <section
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid #EEEEEE' }}
          >
            {/* Language */}
            <div className="px-4 py-3.5 flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#F6F6F6' }}
                >
                  <Globe
                    className="w-[18px] h-[18px]"
                    style={{ color: '#1A1A1A' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: '#1A1A1A' }}>
                    {t('languageLabel')}
                  </p>
                  <p className="text-[12px] font-medium" style={{ color: '#737373' }}>
                    {t('currentLanguage')}
                  </p>
                </div>
              </div>
              <div className="flex p-0.5 rounded-lg" style={{ backgroundColor: '#F6F6F6' }}>
                <button
                  onClick={() => setLanguage('fr')}
                  className={cn(
                    'text-[11px] font-bold px-3 py-1.5 rounded-md transition-all',
                    lang === 'fr' ? 'bg-white' : '',
                  )}
                  style={lang === 'fr' ? { color: '#1A1A1A' } : { color: '#737373' }}
                >
                  FR
                </button>
                <button
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'text-[11px] font-bold px-3 py-1.5 rounded-md transition-all',
                    lang === 'en' ? 'bg-white' : '',
                  )}
                  style={lang === 'en' ? { color: '#1A1A1A' } : { color: '#737373' }}
                >
                  EN
                </button>
              </div>
            </div>

            <SectionDivider />

            {/* Currency */}
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3.5 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#F6F6F6' }}
                >
                  <DollarSign
                    className="w-[18px] h-[18px]"
                    style={{ color: '#1A1A1A' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: '#1A1A1A' }}>
                    {t('currencyLabel')}
                  </p>
                  <p className="text-[12px] font-medium" style={{ color: '#737373' }}>
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
                      'flex-1 min-h-[44px] py-2.5 rounded-xl text-[13px] font-semibold transition-all',
                      displayCurrency === c.code ? 'text-white' : 'bg-white',
                    )}
                    style={
                      displayCurrency === c.code
                        ? { backgroundColor: '#1A1A1A' }
                        : { border: '1px solid #EEEEEE', color: '#737373' }
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* 4. NOTIFICATIONS */}
        <div>
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: '#B0B0B0' }}>
            {t('notificationsSection')}
          </h2>

          <section
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid #EEEEEE' }}
          >
            <SettingsRow
              icon={<Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#737373"
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
                    backgroundColor: notificationsEnabled ? '#1A1A1A' : '#EEEEEE',
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
            <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: '#B0B0B0' }}>
              {t('restaurantSection')}
            </h2>

            <section
              className="bg-white rounded-xl overflow-hidden"
              style={{ border: '1px solid #EEEEEE' }}
            >
              {hasAddress && (
                <>
                  <SettingsRow
                    icon={<MapPin className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                    iconBg="#F6F6F6"
                    iconColor="#1A1A1A"
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
                  iconBg="#F6F6F6"
                  iconColor="#1A1A1A"
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
          <h2 className="text-[13px] font-bold pl-1 mb-2.5" style={{ color: '#B0B0B0' }}>
            {t('supportSection')}
          </h2>

          <section
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid #EEEEEE' }}
          >
            <SettingsRow
              icon={<HelpCircle className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#1A1A1A"
              label={t('helpAndSupport')}
              subtitle={t('helpAndSupportSubtitle')}
              onClick={() => setShowHelpModal(true)}
            />
            <SectionDivider />
            <SettingsRow
              icon={<Shield className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#737373"
              label={t('privacyPolicy')}
              subtitle={t('privacySubtitle')}
              onClick={() => setShowPrivacyModal(true)}
            />
            <SectionDivider />
            <SettingsRow
              icon={<Info className="w-[18px] h-[18px]" strokeWidth={1.5} />}
              iconBg="#F6F6F6"
              iconColor="#1A1A1A"
              label={t('aboutLabel')}
              subtitle={tenantName}
              onClick={() => setShowAboutModal(true)}
            />
          </section>
        </div>

        {/* 7. Footer */}
        <div className="text-center pt-4 pb-6 space-y-1">
          <p className="text-[11px] font-medium" style={{ color: '#B0B0B0' }}>
            {t('poweredBy')}
          </p>
          <p className="text-[11px] font-medium" style={{ color: '#B0B0B0' }}>
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
              style={{ borderBottom: '1px solid #EEEEEE' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                {t('privacyTitle')}
              </h2>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ backgroundColor: '#F6F6F6' }}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: '#B0B0B0' }} />
              </button>
            </div>
            <div className="p-6 pb-24 overflow-y-auto max-h-[75vh] space-y-5">
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#1A1A1A' }}>
                  {t('dataCollectionTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#737373' }}>
                  {t('dataCollectionDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#1A1A1A' }}>
                  {t('usageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#737373' }}>
                  {t('usageDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#1A1A1A' }}>
                  {t('storageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#737373' }}>
                  {t('storageDesc')}
                </p>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#1A1A1A' }}>
                  {t('rightsTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#737373' }}>
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
              style={{ borderBottom: '1px solid #EEEEEE' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                {t('aboutTitle')}
              </h2>
              <button
                onClick={() => setShowAboutModal(false)}
                className="p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ backgroundColor: '#F6F6F6' }}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: '#B0B0B0' }} />
              </button>
            </div>
            <div className="px-10 py-10 pb-20 overflow-y-auto max-h-[85vh]">
              <div className="text-center mb-10">
                <h3 className="text-[11px] font-medium" style={{ color: '#1A1A1A' }}>
                  ATTABL
                </h3>
              </div>
              <div className="text-center max-w-xs mx-auto">
                <p className="text-[15px] font-bold leading-relaxed" style={{ color: '#1A1A1A' }}>
                  {t('aboutAppDesc')}
                </p>
              </div>
              <p className="text-center text-[11px] mt-4" style={{ color: '#B0B0B0' }}>
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
              style={{ borderBottom: '1px solid #EEEEEE' }}
            >
              <div className="w-8" />
              <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                {t('helpModalTitle')}
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ backgroundColor: '#F6F6F6' }}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" style={{ color: '#B0B0B0' }} />
              </button>
            </div>

            <div className="py-2">
              <SettingsRow
                icon={<Mail className="w-[18px] h-[18px]" strokeWidth={1.5} />}
                iconBg="#F6F6F6"
                iconColor="#1A1A1A"
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
                iconBg="#F6F6F6"
                iconColor="#737373"
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
                iconBg="#F6F6F6"
                iconColor="#737373"
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
