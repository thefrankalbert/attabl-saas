/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Copy, CheckCheck, Check, Layout, CheckCircle2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getSegmentFeatures } from '@/lib/segment-features';
import { getTenantUrl } from '@/lib/constants';
import type { OnboardingData } from '@/app/onboarding/page';
import { QRTemplatePreview } from '@/components/onboarding/QRTemplatePreview';

interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'qr' | 'summary';
}

const STYLE_VALUES = ['classic', 'branded', 'inverted', 'dark'] as const;

export function LaunchStep({ data, updateData, variant = 'qr' }: LaunchStepProps) {
  const t = useTranslations('onboarding');
  const [copied, setCopied] = useState(false);

  const displaySlug =
    data.tenantSlug ||
    (data.tenantName
      ? data.tenantName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      : 'votre-restaurant');
  const menuUrl = getTenantUrl(displaySlug);
  const features = getSegmentFeatures(data.establishmentType);
  const accentColor = data.primaryColor || '#006aff';

  const completedItems = [
    { label: t('checkAccountCreated'), done: true },
    { label: t('checkIdentityConfigured'), done: !!data.establishmentType },
    ...(features.showTables
      ? [{ label: t('checkTablesConfigured'), done: data.tableConfigMode !== 'skip' }]
      : []),
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

  const getStyleLabel = (value: (typeof STYLE_VALUES)[number]) => {
    switch (value) {
      case 'classic':
        return t('qrStyleClassic');
      case 'branded':
        return t('qrStyleBranded');
      case 'inverted':
        return t('qrStyleInverted');
      case 'dark':
        return t('qrStyleDark');
    }
  };

  // ─── Summary variant ──────────────────────────────────

  if (variant === 'summary') {
    return (
      <div className="h-full overflow-y-auto" data-onboarding-scroll>
        <div className="max-w-2xl mx-auto px-5 py-5 sm:px-6 sm:py-6 w-full">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-app-text mb-1.5 flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />
              {t('launchTitle')}
            </h1>
            <p className="text-sm text-app-text-secondary">{t('launchSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
            {/* Left: info */}
            <div className="space-y-5">
              {/* Identity section */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
                  {t('stepEstablishment')}
                </p>
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: accentColor }}
                  >
                    {data.logoUrl ? (
                      <img
                        src={data.logoUrl}
                        alt="Logo"
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <Layout className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-app-text">{data.tenantName}</p>
                    <p className="text-xs text-app-text-secondary capitalize mt-0.5">
                      {data.establishmentType} &bull; {data.city || t('cityNotDefined')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Checklist section */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
                  {t('summaryTitle')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {completedItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          item.done
                            ? 'bg-accent text-white'
                            : 'bg-app-elevated border border-app-border text-app-text-muted'
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span
                        className={`text-sm ${item.done ? 'text-app-text' : 'text-app-text-muted'}`}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* URL section */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
                  {t('menuUrl')}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-app-text truncate flex-1">{menuUrl}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('copyUrl')}
                    onClick={handleCopyUrl}
                    className="h-8 w-8 rounded shrink-0 bg-app-bg border-app-border hover:border-accent/40 transition-colors"
                  >
                    {copied ? (
                      <CheckCheck className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-app-text-secondary" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    asChild
                    className="h-8 w-8 rounded shrink-0 bg-app-bg border-app-border hover:border-accent/40 transition-colors"
                  >
                    <a href={menuUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 text-app-text-secondary" />
                    </a>
                  </Button>
                </div>
                {copied && (
                  <p className="text-xs mt-1.5 font-medium text-accent">{t('urlCopied')}</p>
                )}
              </div>
            </div>

            {/* Right: scannable QR + download */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted pb-1.5 border-b border-app-border/50 w-full text-center">
                {t('qrCodeTitle')}
              </p>
              <QRCodeCanvas
                value={menuUrl}
                size={148}
                fgColor="#1a1a1a"
                bgColor="#ffffff"
                level="M"
                style={{ borderRadius: '8px' }}
              />
              <QRTemplatePreview data={data} compact />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── QR variant (style picker) ────────────────────────

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-app-text mb-1.5">{t('qrStepTitle')}</h1>
            <p className="text-sm text-app-text-secondary">{t('qrStepSubtitle')}</p>
          </div>

          {/* Style section */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
              {t('qrStyleSection')}
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_VALUES.map((value) => {
                const isSelected = (data.qrStyle ?? 'classic') === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    onClick={() => updateData({ qrStyle: value })}
                    className={`h-8 px-4 rounded border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-app-border text-app-text-secondary hover:border-app-border-hover hover:text-app-text'
                    }`}
                  >
                    {getStyleLabel(value)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-app-text-muted mt-3">{t('qrCustomizeLaterHint')}</p>
          </div>

          {/* Logo toggle — only if logo uploaded */}
          {data.logoUrl && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
                {t('qrLogoSection')}
              </p>
              <div className="flex items-center justify-between py-1">
                <Label
                  htmlFor="qr-show-logo"
                  className="text-sm text-app-text-secondary cursor-pointer"
                >
                  {t('qrShowLogoLabel')}
                </Label>
                <Switch
                  id="qr-show-logo"
                  checked={data.qrShowLogo !== false}
                  onCheckedChange={(checked) => updateData({ qrShowLogo: checked })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
