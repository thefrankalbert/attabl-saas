/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink, Layout, Copy, CheckCheck } from 'lucide-react';
import { LaunchQR } from '@/components/qr/LaunchQR';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
  data: OnboardingData;
}

export function LaunchStep({ data }: LaunchStepProps) {
  const t = useTranslations('onboarding');
  const [copied, setCopied] = useState(false);

  const menuUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/sites/${data.tenantSlug}`
      : `https://attabl.com/sites/${data.tenantSlug}`;

  const completedItems = [
    { label: t('checkAccountCreated'), done: true },
    { label: t('checkIdentityConfigured'), done: !!data.establishmentType },
    { label: t('checkTablesConfigured'), done: data.tableConfigMode !== 'skip' },
    { label: t('checkBrandingCustomized'), done: !!data.primaryColor },
    { label: t('checkMenuInitialized'), done: data.menuOption !== 'skip' },
  ];

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const accentColor = data.primaryColor || '#000';

  return (
    <div>
      {/* Title / Subtitle */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('launchTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('launchSubtitle')}</p>
      </div>

      {/* Summary Card */}
      <div
        className="p-4 rounded-xl bg-white mb-4"
        style={{ border: `1px solid ${accentColor}20` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: accentColor }}
          >
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo"
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <Layout className="h-6 w-6 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{data.tenantName}</h2>
            <p className="text-neutral-500 capitalize text-sm">
              {data.establishmentType} • {data.city || 'Non défini'}
            </p>
          </div>
        </div>

        {/* Checklist — inline */}
        <div className="grid grid-cols-2 gap-2">
          {completedItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={
                  item.done
                    ? { backgroundColor: accentColor, color: '#fff' }
                    : { backgroundColor: '#e5e5e5', color: '#a3a3a3' }
                }
              >
                <Check className="h-2.5 w-2.5" />
              </div>
              <span className={`text-sm ${item.done ? 'text-neutral-900' : 'text-neutral-400'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Menu URL */}
      <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 mb-4">
        <p className="text-xs text-neutral-500 mb-1.5">{t('menuUrl')}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-white rounded-lg border border-neutral-200 font-mono text-xs text-neutral-700 truncate">
            {menuUrl}
          </div>
          <button
            onClick={handleCopyUrl}
            className="p-2 bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
            title={t('copyUrl')}
          >
            {copied ? (
              <CheckCheck className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-neutral-500" />
            )}
          </button>
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-neutral-500" />
          </a>
        </div>
        {copied && (
          <p className="text-xs mt-1.5" style={{ color: accentColor }}>
            {t('urlCopied')}
          </p>
        )}
      </div>

      {/* QR Code */}
      <LaunchQR
        url={menuUrl}
        tenantName={data.tenantName}
        logoUrl={data.logoUrl}
        primaryColor={data.primaryColor}
      />

      {/* Trial Info */}
      <div className="mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-center">
        <p className="text-xs text-neutral-600">{t('trialReminder')}</p>
      </div>
    </div>
  );
}
