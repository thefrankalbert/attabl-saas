'use client';

import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  Globe,
  Bell,
  Shield,
  Info,
  Coins,
  Clock,
  QrCode,
  MapPin,
  Phone,
  HelpCircle,
} from 'lucide-react';
import { type DisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SegmentedToggle, SettingsRow, SettingsCard } from './client-settings/SettingsPrimitives';
import { useClientSettings } from './client-settings/useClientSettings';
import { PrivacyModal } from './client-settings/PrivacyModal';
import { AboutModal } from './client-settings/AboutModal';
import { HelpModal } from './client-settings/HelpModal';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), { ssr: false });

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
  isOpen: boolean;
  todayHours?: string | null;
  currency: string;
  supportedCurrencies?: string[];
}

const CURRENCY_OPTIONS: { code: DisplayCurrency; label: string }[] = [
  { code: 'XOF', label: 'FCFA' },
  { code: 'EUR', label: 'EUR' },
  { code: 'USD', label: 'USD' },
];

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
  isOpen,
  todayHours,
  supportedCurrencies,
}: ClientSettingsProps) {
  const locale = useLocale();
  const t = useTranslations('tenant');
  const lang = locale.startsWith('fr') ? 'fr' : 'en';

  const {
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
  } = useClientSettings(tenantSlug);

  const fullAddress = [tenantAddress, tenantCity].filter(Boolean).join(', ');
  const hasAddress = Boolean(tenantAddress || tenantCity || tenantCountry);
  const addressValue = fullAddress || tenantCountry || t('notAvailable');
  const headerLocation = [tenantCity, tenantCountry].filter(Boolean).join(', ');
  const initials =
    tenantName
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'A';

  const currencyOptions = CURRENCY_OPTIONS.filter(
    (c) =>
      !supportedCurrencies ||
      supportedCurrencies.length <= 1 ||
      supportedCurrencies.includes(c.code),
  );

  // Render

  return (
    <div
      className="h-full bg-[var(--color-surface-alt)]"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto max-w-lg">
        {/* Header - restaurant identity */}
        <header className="relative overflow-hidden bg-[var(--color-ink)] px-[18px] pb-[22px] pt-5 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-52 w-52 rounded-full bg-[var(--color-brand)] opacity-[0.16] blur-[34px]"
          />
          <div className="relative flex items-center gap-3.5">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-modal)] border border-white/20 bg-white/10">
              {tenantLogo ? (
                <Image
                  src={tenantLogo}
                  alt={tenantName}
                  width={52}
                  height={52}
                  className="h-full w-full object-cover"
                  unoptimized={tenantLogo.startsWith('data:') || tenantLogo.startsWith('blob:')}
                />
              ) : (
                <span className="font-mono text-[14px] font-bold tracking-[0.5px]">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-semibold tracking-[-0.5px]">
                {tenantName}
              </div>
              {tenantDescription && (
                <div className="truncate text-[12px] leading-[1.4] tracking-[-0.1px] text-white/60">
                  {tenantDescription}
                </div>
              )}
              {headerLocation && (
                <div className="truncate text-[12px] leading-[1.4] tracking-[-0.1px] text-white/60">
                  {headerLocation}
                </div>
              )}
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-tag)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3px]',
                isOpen ? 'bg-[var(--color-brand)] text-white' : 'bg-white/15 text-white/80',
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', isOpen ? 'bg-white' : 'bg-white/70')}
              />
              {isOpen ? t('venueOpen') : t('venueClosed')}
            </span>
          </div>
        </header>

        <div className="space-y-5 px-3 pt-3.5">
          {/* Shortcut tiles */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={goToOrderHistory}
              className="flex h-auto flex-col items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white p-[14px] hover:bg-[var(--color-surface-alt)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
                <Clock className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="text-left">
                <span className="block text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                  {t('historyShort')}
                </span>
                <span className="mt-px block text-[11px] text-[var(--color-ink-muted)]">
                  {t('ordersCountValue', { count: orderCount })}
                </span>
              </span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsScannerOpen(true)}
              className="flex h-auto flex-col items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white p-[14px] hover:bg-[var(--color-surface-alt)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
                <QrCode className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="text-left">
                <span className="block text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                  {t('scanQrShort')}
                </span>
                <span className="mt-px block text-[11px] text-[var(--color-ink-muted)]">
                  {t('changeTable')}
                </span>
              </span>
            </Button>
          </div>

          {/* Preferences */}
          <SettingsCard title={t('preferencesSection')}>
            <div className="flex items-center gap-3 px-[14px] py-[13px]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
                <Globe className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </span>
              <span className="flex-1 text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                {t('languageLabel')}
              </span>
              <SegmentedToggle
                options={[
                  { value: 'fr', label: 'FR' },
                  { value: 'en', label: 'EN' },
                ]}
                active={lang}
                onSelect={setLanguage}
                label={t('languageLabel')}
              />
            </div>

            {currencyOptions.length > 1 && (
              <div className="flex items-center gap-3 px-[14px] py-[13px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
                  <Coins className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </span>
                <span className="flex-1 text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                  {t('currencyLabel')}
                </span>
                <SegmentedToggle
                  options={currencyOptions.map((c) => ({ value: c.code, label: c.label }))}
                  active={displayCurrency === 'XAF' ? 'XOF' : displayCurrency}
                  onSelect={handleCurrencyChange}
                  label={t('currencyLabel')}
                />
              </div>
            )}

            <SettingsRow
              icon={<Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              label={t('notificationsLabel')}
              subtitle={
                notificationsSupported
                  ? t('notificationsTrackingSub')
                  : t('notificationsNotSupported')
              }
              onClick={toggleNotifications}
              disabled={!notificationsSupported}
              switchChecked={notificationsEnabled}
              trailing={
                <span
                  className={cn(
                    'flex h-[22px] w-[38px] items-center rounded-full p-[2px] transition-colors',
                    notificationsEnabled ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-ink-soft)]',
                  )}
                >
                  <span
                    className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_0_rgba(26,26,26,0.2)] transition-transform"
                    style={{
                      transform: notificationsEnabled ? 'translateX(16px)' : 'translateX(0)',
                    }}
                  />
                </span>
              }
            />
          </SettingsCard>

          {/* Restaurant */}
          {(hasAddress || tenantPhone || todayHours) && (
            <SettingsCard title={t('restaurantSection')}>
              {hasAddress && (
                <SettingsRow
                  icon={<MapPin className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  label={t('addressLabel')}
                  subtitle={addressValue}
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [tenantName, fullAddress || tenantCountry].filter(Boolean).join(' '),
                      )}`,
                      '_blank',
                      'noopener,noreferrer',
                    );
                  }}
                />
              )}
              {tenantPhone && (
                <SettingsRow
                  icon={<Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  label={t('phoneLabel')}
                  subtitle={tenantPhone}
                  onClick={() => {
                    window.location.href = `tel:${tenantPhone}`;
                  }}
                />
              )}
              {todayHours && (
                <SettingsRow
                  icon={<Clock className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  label={t('hoursLabel')}
                  subtitle={`${t('hoursTodayLabel')} - ${todayHours}`}
                  trailing={<span />}
                />
              )}
            </SettingsCard>
          )}

          {/* Support (kept per product decision: privacy is useful/legal) */}
          <SettingsCard title={t('supportSection')}>
            <SettingsRow
              icon={<HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              label={t('helpAndSupport')}
              subtitle={t('helpAndSupportSubtitle')}
              onClick={() => setShowHelpModal(true)}
            />
            <SettingsRow
              icon={<Shield className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              label={t('privacyPolicy')}
              subtitle={t('privacySubtitle')}
              onClick={() => setShowPrivacyModal(true)}
            />
            <SettingsRow
              icon={<Info className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              label={t('aboutLabel')}
              subtitle={tenantName}
              onClick={() => setShowAboutModal(true)}
            />
          </SettingsCard>

          {/* Footer */}
          <div className="space-y-1 pb-4 pt-1 text-center">
            <p className="text-[11px] font-medium text-[var(--color-ink-soft)]">{t('poweredBy')}</p>
            <p className="text-[11px] font-medium text-[var(--color-ink-soft)]">
              {t('appVersion')}
            </p>
          </div>
        </div>
      </div>

      {/* QR Scanner */}
      {isScannerOpen && (
        <QRScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleQRScan}
          tenantName={tenantName}
          isOpen_venue={isOpen}
        />
      )}

      {/* Privacy Modal */}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}

      {/* About Modal */}
      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}

      {/* Help Modal */}
      {showHelpModal && (
        <HelpModal tenantName={tenantName} onClose={() => setShowHelpModal(false)} />
      )}
    </div>
  );
}
