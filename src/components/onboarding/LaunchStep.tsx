/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  ExternalLink,
  Layout,
  Copy,
  CheckCheck,
  Paintbrush,
  Type,
  Download,
} from 'lucide-react';
import { LaunchQR } from '@/components/qr/LaunchQR';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import type { QRTemplateId } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

type LaunchTab = 'style' | 'text' | 'export';

const TEMPLATES: Array<{ id: QRTemplateId; labelKey: string }> = [
  { id: 'standard', labelKey: 'qrTemplateStandard' },
  { id: 'chevalet', labelKey: 'qrTemplateChevalet' },
  { id: 'carte', labelKey: 'qrTemplateCarte' },
  { id: 'minimal', labelKey: 'qrTemplateMinimal' },
  { id: 'elegant', labelKey: 'qrTemplateElegant' },
  { id: 'neon', labelKey: 'qrTemplateNeon' },
];

const QR_STYLES: Array<{
  id: OnboardingData['qrStyle'];
  fg: string;
  bg: string;
}> = [
  { id: 'classic', fg: '#000000', bg: '#FFFFFF' },
  { id: 'branded', fg: 'primary', bg: '#FFFFFF' },
  { id: 'inverted', fg: '#FFFFFF', bg: '#000000' },
  { id: 'dark', fg: '#FFFFFF', bg: '#1a1a1a' },
];

const CTA_PRESETS = [
  { key: 'qrCtaScan', value: 'Scannez pour commander' },
  { key: 'qrCtaMenu', value: 'Scannez pour voir le menu' },
  { key: 'qrCtaDiscover', value: 'Scannez pour d\u00e9couvrir' },
  { key: 'qrCtaCard', value: 'Scannez notre carte' },
];

/** Renders a real template at mini scale for the template picker */
function TemplateMiniPreview({
  templateId,
  data,
}: {
  templateId: QRTemplateId;
  data: OnboardingData;
}) {
  const config = useMemo(() => onboardingDataToQRConfig(data, templateId), [data, templateId]);

  const TemplateComponent = TEMPLATE_REGISTRY[templateId];
  const defaults = TEMPLATE_DEFAULTS[templateId];

  // Calculate scale to fit within ~80px tall preview container
  const templateHeightPx = defaults.height * 3.78;
  const templateWidthPx = defaults.width * 3.78;
  const scale = Math.min(70 / templateHeightPx, 100 / templateWidthPx, 0.18);

  return (
    <div
      className="relative overflow-hidden flex items-start justify-center"
      style={{
        height: 72,
        width: '100%',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <TemplateComponent
          config={config}
          url="https://attabl.com"
          tenantName={data.tenantName || 'Mon resto'}
          logoUrl={data.logoUrl || undefined}
        />
      </div>
    </div>
  );
}

export function LaunchStep({ data, updateData }: LaunchStepProps) {
  const t = useTranslations('onboarding');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<LaunchTab>('style');

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

  const tabs: Array<{ id: LaunchTab; icon: typeof Paintbrush; label: string }> = [
    { id: 'style', icon: Paintbrush, label: t('qrStyleTab') },
    { id: 'text', icon: Type, label: t('qrTextTab') },
    { id: 'export', icon: Download, label: t('qrExportTab') },
  ];

  // Build QRDesignConfig for the export tab
  const qrConfig = useMemo(() => onboardingDataToQRConfig(data), [data]);

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
              {data.establishmentType} &bull; {data.city || 'Non d\u00e9fini'}
            </p>
          </div>
        </div>

        {/* Checklist */}
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

      {/* QR Customization Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-100 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-[#CCFF00] text-neutral-900 bg-neutral-50'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Style Tab */}
      {activeTab === 'style' && (
        <div className="space-y-4">
          {/* Templates — Real mini-previews */}
          <div>
            <p className="text-xs font-medium text-neutral-700 mb-2">Template</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((tmpl) => {
                const isSelected = data.qrTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => updateData({ qrTemplate: tmpl.id })}
                    className={`rounded-xl border text-center transition-all overflow-hidden ${
                      isSelected
                        ? 'border-[#CCFF00] ring-1 ring-[#CCFF00] bg-[#CCFF00]/5'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {/* Mini template preview */}
                    <div className="pt-2 px-1">
                      <TemplateMiniPreview templateId={tmpl.id} data={data} />
                    </div>
                    <div className="py-1.5 border-t border-neutral-100">
                      <span className="text-[11px] font-medium text-neutral-700">
                        {t(tmpl.labelKey)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* QR Color Styles */}
          <div>
            <p className="text-xs font-medium text-neutral-700 mb-2">{t('qrCodeTitle')}</p>
            <div className="flex gap-2">
              {QR_STYLES.map((style) => {
                const isActive = data.qrStyle === style.id;
                const previewFg = style.fg === 'primary' ? data.primaryColor || '#000' : style.fg;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => updateData({ qrStyle: style.id })}
                    className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center ${
                      isActive ? 'border-[#CCFF00]' : 'border-neutral-200'
                    }`}
                    style={{ backgroundColor: style.bg }}
                  >
                    <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: previewFg }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Text Tab */}
      {activeTab === 'text' && (
        <div className="space-y-4">
          {/* CTA Presets */}
          <div>
            <p className="text-xs font-medium text-neutral-700 mb-2">{t('qrCtaLabel')}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CTA_PRESETS.map((preset) => {
                const isActive = data.qrCta === preset.value;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => updateData({ qrCta: preset.value })}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      isActive
                        ? 'bg-[#CCFF00] text-black font-medium'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {t(preset.key)}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={data.qrCta}
              onChange={(e) => updateData({ qrCta: e.target.value })}
              placeholder={t('qrCtaLabel')}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-neutral-50"
              maxLength={60}
            />
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-neutral-700 mb-2">{t('qrDescriptionLabel')}</p>
            <textarea
              value={data.qrDescription}
              onChange={(e) => updateData({ qrDescription: e.target.value })}
              placeholder={t('qrDescriptionLabel')}
              rows={2}
              maxLength={120}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-neutral-50 resize-none"
            />
          </div>
        </div>
      )}

      {/* Export Tab — Full template preview + download */}
      {activeTab === 'export' && (
        <div>
          <LaunchQR
            config={qrConfig}
            url={menuUrl}
            tenantName={data.tenantName}
            logoUrl={data.logoUrl || undefined}
          />
        </div>
      )}
    </div>
  );
}
