'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Globe,
  ChevronRight,
  Bell,
  Shield,
  Info,
  X,
  Coins,
  Clock,
  QrCode,
  Mail,
  MapPin,
  Phone,
  HelpCircle,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { useDisplayCurrency, type DisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';
import { Button } from '@/components/ui/button';
import type { QRScanResult } from '@/components/tenant/QRScanner';

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

// Persisted notification preference (per device). '1' = on, '0' = off.
const NOTIF_PREF_KEY = 'attabl_notif_pref';

const CURRENCY_OPTIONS: { code: DisplayCurrency; label: string }[] = [
  { code: 'XOF', label: 'FCFA' },
  { code: 'EUR', label: 'EUR' },
  { code: 'USD', label: 'USD' },
];

// Segmented toggle (language / currency): active pill = ink, inactive = muted.
function SegmentedToggle({
  options,
  active,
  onSelect,
  label,
}: {
  options: { value: string; label: string }[];
  active: string;
  onSelect: (value: string) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-[3px] rounded-[var(--radius-pill)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] p-[3px]"
    >
      {options.map((o) => {
        const on = active === o.value;
        return (
          <Button
            key={o.value}
            variant="ghost"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(o.value)}
            className={cn(
              'h-auto rounded-[var(--radius-pill)] px-[11px] py-[5px] text-[12px] font-semibold hover:bg-transparent',
              on
                ? 'bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)]',
            )}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

// Reusable info/action row inside a card.
function SettingsRow({
  icon,
  label,
  subtitle,
  onClick,
  trailing,
  disabled,
  switchChecked,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  /** When set, the row acts as an accessible switch (announces on/off state). */
  switchChecked?: boolean;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink-2)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
          {label}
        </span>
        <span className="mt-px block truncate text-[11.5px] text-[var(--color-ink-muted)]">
          {subtitle}
        </span>
      </span>
      <span className="shrink-0">
        {trailing ?? <ChevronRight className="h-[18px] w-[18px] text-[var(--color-ink-soft)]" />}
      </span>
    </>
  );

  if (onClick) {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        role={switchChecked === undefined ? undefined : 'switch'}
        aria-checked={switchChecked}
        className={cn(
          'flex h-auto w-full items-center justify-start gap-3 rounded-none px-[14px] py-[13px] hover:bg-[var(--color-surface-alt)]',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {content}
      </Button>
    );
  }

  return <div className="flex w-full items-center gap-3 px-[14px] py-[13px]">{content}</div>;
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-[6px] font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-ink-soft)]">
        {title}
      </h2>
      <section className="divide-y divide-[var(--color-divider)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white">
        {children}
      </section>
    </div>
  );
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
  isOpen,
  todayHours,
  supportedCurrencies,
}: ClientSettingsProps) {
  const locale = useLocale();
  const t = useTranslations('tenant');
  const tc = useTranslations('common');
  const router = useRouter();
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const lang = locale.startsWith('fr') ? 'fr' : 'en';

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
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[1001] flex items-end justify-center">
          <div
            onClick={() => setShowPrivacyModal(false)}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}
          />
          <div
            className="relative max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-4"
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
                className="min-h-[44px] min-w-[44px] rounded-full bg-app-elevated"
                aria-label={tc('close')}
              >
                <X className="h-4 w-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>
            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-6 pb-24">
              <section>
                <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('dataCollectionTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('dataCollectionDesc')}
                </p>
              </section>
              <section>
                <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('usageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('usageDesc')}
                </p>
              </section>
              <section>
                <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('storageTitle')}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
                  {t('storageDesc')}
                </p>
              </section>
              <section>
                <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
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
            className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-4"
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
                className="min-h-[44px] min-w-[44px] rounded-full bg-app-elevated"
                aria-label={tc('close')}
              >
                <X className="h-4 w-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>
            <div className="max-h-[85vh] overflow-y-auto px-10 py-10 pb-20">
              <div className="mb-10 text-center">
                <h3 className="text-[11px] font-medium" style={{ color: 'rgb(26, 26, 26)' }}>
                  ATTABL
                </h3>
              </div>
              <div className="mx-auto max-w-xs text-center">
                <p
                  className="text-[15px] font-bold leading-relaxed"
                  style={{ color: 'rgb(26, 26, 26)' }}
                >
                  {t('aboutAppDesc')}
                </p>
              </div>
              <p className="mt-4 text-center text-[11px]" style={{ color: 'rgb(176, 176, 176)' }}>
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
            className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
            style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-4"
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
                className="min-h-[44px] min-w-[44px] rounded-full bg-app-elevated"
                aria-label={tc('close')}
              >
                <X className="h-4 w-4" style={{ color: 'rgb(176, 176, 176)' }} />
              </Button>
            </div>

            <div className="py-2">
              <SettingsRow
                icon={<Mail className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                label={t('helpEmailLabel')}
                subtitle={t('helpEmailSubtitle')}
                onClick={() => {
                  window.location.href = `mailto:support@attabl.com?subject=${encodeURIComponent(
                    `[${tenantName}] Demande d'assistance`,
                  )}`;
                  setShowHelpModal(false);
                }}
              />
              <SettingsRow
                icon={<Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                label={t('helpCallBurkinaLabel')}
                subtitle={t('helpCallBurkinaSubtitle')}
                onClick={() => {
                  window.location.href = 'tel:+22665565411';
                  setShowHelpModal(false);
                }}
              />
              <SettingsRow
                icon={<Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />}
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
    </div>
  );
}
