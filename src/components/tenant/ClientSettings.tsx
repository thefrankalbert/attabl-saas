'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe, ChevronRight, Bell, Shield, Info, X, DollarSign } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useDisplayCurrency, type DisplayCurrency } from '@/contexts/CurrencyContext';
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
  currency,
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
      style={{
        height: '100dvh',
        backgroundColor: '#F7F7F7',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ─── HEADER ────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #f3f4f6',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <button
          onClick={() => router.push(`/sites/${tenantSlug}`)}
          style={{
            padding: '8px',
            marginLeft: '-8px',
            color: '#9ca3af',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={24} strokeWidth={1.5} />
        </button>
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#111827',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            textAlign: 'center',
            flex: 1,
            paddingRight: '24px',
          }}
        >
          {t('settingsTitle')}
        </h1>
      </div>

      {/* ─── CONTENT (no-scroll, flex distributed) ── */}
      <div
        style={{
          flex: 1,
          maxWidth: '448px',
          width: '100%',
          margin: '0 auto',
          padding: '20px 24px 0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* Top: two sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ── SECTION: PRÉFÉRENCES ──────────────── */}
          <div>
            <h2
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: '#9ca3af',
                paddingLeft: '4px',
                marginBottom: '10px',
              }}
            >
              {t('preferencesSection')}
            </h2>

            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '24px',
                border: '1px solid #f3f4f6',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Langue */}
              <div
                style={{
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: 'rgba(219,234,254,0.5)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Globe
                      style={{
                        width: '18px',
                        height: '18px',
                        color: 'var(--tenant-primary, #002C5F)',
                      }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                      {t('languageLabel')}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {t('currentLanguage')}
                    </p>
                  </div>
                </div>
                {/* FR / EN pill */}
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: '#f3f4f6',
                    padding: '3px',
                    borderRadius: '10px',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                  }}
                >
                  <button
                    onClick={() => setLanguage('fr')}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '5px 11px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: lang === 'fr' ? '#ffffff' : 'transparent',
                      color: lang === 'fr' ? 'var(--tenant-primary, #002C5F)' : '#9ca3af',
                      boxShadow: lang === 'fr' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    FR
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '5px 11px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: lang === 'en' ? '#ffffff' : 'transparent',
                      color: lang === 'en' ? 'var(--tenant-primary, #002C5F)' : '#9ca3af',
                      boxShadow: lang === 'en' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: '#f9fafb', margin: '0 20px' }} />

              {/* Devise / Currency */}
              <div style={{ padding: '14px 20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: 'rgba(220,252,231,0.5)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <DollarSign
                      style={{ width: '18px', height: '18px', color: '#16a34a' }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                      {t('currencyLabel')}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {t('priceDisplay')}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {CURRENCY_OPTIONS.filter(
                    (c) =>
                      !supportedCurrencies ||
                      supportedCurrencies.length <= 1 ||
                      supportedCurrencies.includes(c.code),
                  ).map((c) => (
                    <button
                      key={c.code}
                      onClick={() => handleCurrencyChange(c.code)}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        border:
                          displayCurrency === c.code
                            ? '1px solid var(--tenant-primary, #002C5F)'
                            : '1px solid #f3f4f6',
                        backgroundColor:
                          displayCurrency === c.code ? 'var(--tenant-primary, #002C5F)' : '#ffffff',
                        color: displayCurrency === c.code ? '#ffffff' : '#6b7280',
                        cursor: 'pointer',
                        boxShadow:
                          displayCurrency === c.code ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      <span style={{ marginRight: '4px', opacity: 0.7 }}>{c.flag}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION: SUPPORT & INFOS ─────────── */}
          <div>
            <h2
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: '#9ca3af',
                paddingLeft: '4px',
                marginBottom: '10px',
              }}
            >
              {t('supportSection')}
            </h2>

            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '24px',
                border: '1px solid #f3f4f6',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Notifications */}
              <button
                onClick={toggleNotifications}
                disabled={!notificationsSupported}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: notificationsSupported ? 'pointer' : 'not-allowed',
                  opacity: notificationsSupported ? 1 : 0.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: 'rgba(255,237,213,0.5)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Bell
                      style={{ width: '18px', height: '18px', color: '#f97316' }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                      {t('notificationsLabel')}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
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
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '9999px',
                    padding: '4px',
                    transition: 'all 0.3s',
                    backgroundColor: notificationsEnabled
                      ? 'var(--tenant-primary, #002C5F)'
                      : '#e5e7eb',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#ffffff',
                      borderRadius: '9999px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      transition: 'transform 0.3s',
                      transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </button>

              <div style={{ height: '1px', backgroundColor: '#f9fafb', margin: '0 20px' }} />

              {/* Confidentialité */}
              <button
                onClick={() => setShowPrivacyModal(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: 'rgba(243,232,255,0.5)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Shield
                      style={{ width: '18px', height: '18px', color: '#9333ea' }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                      {t('privacyPolicy')}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {t('yourData')}
                    </p>
                  </div>
                </div>
                <ChevronRight style={{ width: '18px', height: '18px', color: '#d1d5db' }} />
              </button>

              <div style={{ height: '1px', backgroundColor: '#f9fafb', margin: '0 20px' }} />

              {/* À propos */}
              <button
                onClick={() => setShowAboutModal(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: 'rgba(219,234,254,0.5)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Info
                      style={{ width: '18px', height: '18px', color: '#2563eb' }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                      {t('aboutLabel')}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {tenantName}
                    </p>
                  </div>
                </div>
                <ChevronRight style={{ width: '18px', height: '18px', color: '#d1d5db' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: version */}
        <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
          <p
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#d1d5db',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
            }}
          >
            ATTABL v1.0
          </p>
        </div>
      </div>

      {/* ─── BOTTOM NAV ──────────────────────────── */}
      <BottomNav tenantSlug={tenantSlug} />

      {/* ─── PRIVACY MODAL ───────────────────────── */}
      {showPrivacyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1001,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={() => setShowPrivacyModal(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
          <div
            style={{
              position: 'relative',
              backgroundColor: '#ffffff',
              width: '100%',
              maxWidth: '512px',
              maxHeight: '85vh',
              borderRadius: '32px 32px 0 0',
              overflow: 'hidden',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <h2
                style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#111827',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  flex: 1,
                  marginLeft: '32px',
                }}
              >
                {t('privacyTitle')}
              </h2>
              <button
                onClick={() => setShowPrivacyModal(false)}
                style={{
                  padding: '8px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} style={{ color: '#9ca3af' }} />
              </button>
            </div>
            <div
              style={{
                padding: '32px',
                paddingBottom: '100px',
                overflowY: 'auto',
                maxHeight: '75vh',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <section>
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#111827',
                      marginBottom: '6px',
                    }}
                  >
                    {t('dataCollectionTitle')}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7 }}>
                    {t('dataCollectionDesc')}
                  </p>
                </section>
                <section>
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#111827',
                      marginBottom: '6px',
                    }}
                  >
                    {t('usageTitle')}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7 }}>
                    {t('usageDesc')}
                  </p>
                </section>
                <section>
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#111827',
                      marginBottom: '6px',
                    }}
                  >
                    {t('storageTitle')}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7 }}>
                    {t('storageDesc')}
                  </p>
                </section>
              </div>
              <div
                style={{
                  paddingTop: '24px',
                  marginTop: '24px',
                  borderTop: '1px solid #f9fafb',
                }}
              >
                <p
                  style={{
                    fontSize: '10px',
                    color: '#9ca3af',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                  }}
                >
                  {tenantName} • privacy@attabl.com
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABOUT MODAL ─────────────────────────── */}
      {showAboutModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1001,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={() => setShowAboutModal(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
          <div
            style={{
              position: 'relative',
              backgroundColor: '#ffffff',
              width: '100%',
              maxWidth: '512px',
              borderRadius: '32px 32px 0 0',
              overflow: 'hidden',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f9fafb',
              }}
            >
              <h2
                style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#111827',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  flex: 1,
                  marginLeft: '32px',
                }}
              >
                {t('aboutTitle')}
              </h2>
              <button
                onClick={() => setShowAboutModal(false)}
                style={{
                  padding: '8px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} style={{ color: '#9ca3af' }} />
              </button>
            </div>
            <div
              style={{
                padding: '40px',
                paddingBottom: '80px',
                overflowY: 'auto',
                maxHeight: '85vh',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                {tenantLogo && (
                  <div
                    style={{
                      marginBottom: '24px',
                      height: '64px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={tenantLogo}
                      alt={tenantName}
                      style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
                    />
                  </div>
                )}
                <h3
                  style={{
                    fontSize: '11px',
                    fontWeight: 900,
                    color: 'var(--tenant-primary, #002C5F)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3em',
                  }}
                >
                  {tenantName}
                </h3>
              </div>
              <div style={{ textAlign: 'center', maxWidth: '320px', margin: '0 auto' }}>
                <p
                  style={{
                    fontSize: '15px',
                    color: '#111827',
                    fontWeight: 700,
                    lineHeight: 1.6,
                    marginBottom: '16px',
                  }}
                >
                  {t('aboutAppDesc', { name: tenantName })}
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7 }}>
                  {t('aboutAppSubtext')}
                </p>
              </div>
              <div style={{ marginTop: '48px', textAlign: 'center' }}>
                <div
                  style={{
                    height: '1px',
                    background: 'linear-gradient(to right, transparent, #f3f4f6, transparent)',
                    width: '100%',
                    marginBottom: '24px',
                  }}
                />
                <p
                  style={{
                    fontSize: '9px',
                    color: '#d1d5db',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                  }}
                >
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
