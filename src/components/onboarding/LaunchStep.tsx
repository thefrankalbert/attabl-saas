/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { HexColorPicker } from 'react-colorful';
import {
  Check,
  ExternalLink,
  Layout,
  Copy,
  CheckCheck,
  Paintbrush,
  Type,
  Download,
  Upload,
  Trash2,
  Loader2,
  RotateCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LaunchQR } from '@/components/qr/LaunchQR';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import type { QRTemplateId } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import { getSegmentFeatures } from '@/lib/segment-features';
import { getTenantUrl } from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'qr' | 'summary';
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

const CTA_PRESETS = [
  { key: 'qrCtaScan', value: 'Scannez pour commander' },
  { key: 'qrCtaMenu', value: 'Scannez pour voir le menu' },
  { key: 'qrCtaDiscover', value: 'Scannez pour decouvrir' },
  { key: 'qrCtaCard', value: 'Scannez notre carte' },
];

// Dimension constraints (A5 -> A4 with portrait/landscape)
const MIN_DIM_MM = 148;
const MAX_DIM_MM = 297;
const FORMAT_PRESETS = [
  { id: 'a5', label: 'A5', width: 148, height: 210 },
  { id: 'a4', label: 'A4', width: 210, height: 297 },
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

  const templateHeightPx = defaults.height * 3.78;
  const templateWidthPx = defaults.width * 3.78;
  const scale = Math.min(86 / templateHeightPx, 110 / templateWidthPx, 0.22);

  return (
    <div
      className="relative overflow-hidden flex items-center justify-center"
      style={{ height: 90, width: '100%' }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
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

/** Color preset swatch - clickable to select a quick color.
 *  Renders a checkered pattern when color === 'transparent' to make it visually distinct. */
function ColorSwatch({
  color,
  isActive,
  onClick,
  ariaLabel,
}: {
  color: string;
  isActive: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  const isTransparent = color === 'transparent';
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-9 h-9 rounded-full border-2 p-0 transition-all overflow-hidden ${
        isActive
          ? 'border-accent ring-2 ring-accent/30 ring-offset-1'
          : 'border-app-border hover:border-app-border-hover'
      }`}
      style={
        isTransparent
          ? {
              backgroundImage:
                'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
              backgroundColor: '#ffffff',
            }
          : { backgroundColor: color }
      }
    />
  );
}

export function LaunchStep({ data, updateData, variant = 'qr' }: LaunchStepProps) {
  const t = useTranslations('onboarding');
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<LaunchTab>('style');
  const [showFgPicker, setShowFgPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showQr = variant === 'qr';
  const showSummary = variant === 'summary';

  const menuUrl = data.tenantSlug ? getTenantUrl(data.tenantSlug) : 'https://attabl.com';

  const features = getSegmentFeatures(data.establishmentType);
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

  const accentColor = data.primaryColor || '#000';

  const tabs: Array<{ id: LaunchTab; icon: typeof Paintbrush; label: string }> = [
    { id: 'style', icon: Paintbrush, label: t('qrStyleTab') },
    { id: 'text', icon: Type, label: t('qrTextTab') },
    { id: 'export', icon: Download, label: t('qrExportTab') },
  ];

  const qrConfig = useMemo(() => onboardingDataToQRConfig(data), [data]);

  // ─── Color helpers ───────────────────────────────
  const fgColor = data.qrCustomFgColor ?? '#000000';
  const bgColor = data.qrCustomBgColor ?? '#FFFFFF';
  const cardBgColor = data.qrCustomCardBgColor ?? '#FFFFFF';

  // Logo: explicit toggle. Default ON if user has a logoUrl, OFF otherwise.
  const showLogo = data.qrShowLogo === undefined ? !!data.logoUrl : data.qrShowLogo;

  const fgPresets = [
    { color: '#000000', label: 'Noir' },
    { color: '#FFFFFF', label: 'Blanc' },
    { color: data.primaryColor || '#000000', label: 'Couleur de marque' },
  ];

  const bgPresets = [
    { color: '#FFFFFF', label: 'Blanc' },
    { color: '#F6F6F6', label: 'Gris clair' },
    { color: 'transparent', label: 'Transparent' },
  ];

  const cardBgPresets = [
    { color: '#FFFFFF', label: 'Blanc' },
    { color: '#F6F6F6', label: 'Gris clair' },
    { color: data.primaryColor || '#000000', label: 'Couleur de marque' },
    { color: 'transparent', label: 'Sans fond' },
  ];

  // ─── Dimensions helpers ───────────────────────────
  const defaults = TEMPLATE_DEFAULTS[data.qrTemplate ?? 'standard'];
  const widthMm = data.qrSupportWidth ?? defaults.width;
  const heightMm = data.qrSupportHeight ?? defaults.height;
  const orientation = data.qrOrientation ?? 'portrait';

  const clampDim = (n: number) => Math.min(MAX_DIM_MM, Math.max(MIN_DIM_MM, Math.round(n)));

  const setDimensions = (w: number, h: number) => {
    updateData({
      qrSupportWidth: clampDim(w),
      qrSupportHeight: clampDim(h),
    });
  };

  // Local edit state for dimension inputs - allows free typing, only clamps on blur
  const [widthInput, setWidthInput] = useState<string>(String(widthMm));
  const [heightInput, setHeightInput] = useState<string>(String(heightMm));

  // Sync local state when external value changes (orientation toggle, format preset)
  useEffect(() => {
    setWidthInput(String(widthMm));
    setHeightInput(String(heightMm));
  }, [widthMm, heightMm]);

  const toggleOrientation = (next: 'portrait' | 'landscape') => {
    if (next === orientation) return;
    // Swap width and height
    updateData({
      qrOrientation: next,
      qrSupportWidth: heightMm,
      qrSupportHeight: widthMm,
    });
  };

  const applyFormatPreset = (preset: (typeof FORMAT_PRESETS)[number]) => {
    if (orientation === 'landscape') {
      setDimensions(preset.height, preset.width);
    } else {
      setDimensions(preset.width, preset.height);
    }
  };

  // ─── Upload handler ───────────────────────────────
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/onboarding/upload-qr-design', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        toast({
          title: t('qrUploadError'),
          description: typeof result.error === 'string' ? result.error : undefined,
          variant: 'destructive',
        });
        return;
      }

      updateData({ qrUploadedDesignUrl: result.url });
      toast({
        title: t('qrUploadSuccess'),
      });
    } catch {
      toast({
        title: t('qrUploadError'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveUpload = () => updateData({ qrUploadedDesignUrl: undefined });

  const hasUpload = !!data.qrUploadedDesignUrl;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-app-text mb-1">
              {showSummary ? t('launchTitle') : t('qrCodeTitle')}
            </h1>
            <p className="text-app-text-secondary text-sm">{t('launchSubtitle')}</p>
          </div>

          {/* Summary Card -- Full width */}
          {showSummary && (
            <div className="mb-6 p-5 rounded-xl bg-app-elevated/40 border border-app-border">
              <div className="flex items-center gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-app-border/50"
                  style={{ backgroundColor: accentColor }}
                >
                  {data.logoUrl ? (
                    <img
                      src={data.logoUrl}
                      alt="Logo"
                      className="w-full h-full rounded-xl object-cover"
                    />
                  ) : (
                    <Layout className="h-7 w-7 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-app-text">{data.tenantName}</h2>
                  <p className="text-app-text-secondary capitalize text-sm">
                    {data.establishmentType} &bull; {data.city || 'Non defini'}
                  </p>
                </div>
              </div>

              {/* Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {completedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={
                        item.done
                          ? { backgroundColor: accentColor, color: '#fff' }
                          : {
                              backgroundColor: 'var(--app-elevated)',
                              color: 'var(--app-text-muted)',
                            }
                      }
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
          )}

          {/* Menu URL */}
          {showSummary && (
            <div className="mb-6 p-4 rounded-xl bg-app-elevated/40 border border-app-border">
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-3">
                Lien du menu
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-app-bg rounded-xl border border-app-border font-mono text-xs text-app-text break-all">
                  {menuUrl}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Confirm all"
                  onClick={handleCopyUrl}
                  className="p-2.5 bg-app-bg rounded-xl border border-app-border hover:border-accent/40 transition-colors h-10 w-10"
                  title={t('copyUrl')}
                >
                  {copied ? (
                    <CheckCheck className="h-4 w-4 text-accent" />
                  ) : (
                    <Copy className="h-4 w-4 text-app-text-secondary" />
                  )}
                </Button>
                <a
                  href={menuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-app-bg rounded-xl border border-app-border hover:border-accent/40 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 text-app-text-secondary" />
                </a>
              </div>
              {copied && (
                <p className="text-xs mt-2 font-medium" style={{ color: accentColor }}>
                  {t('urlCopied')}
                </p>
              )}
            </div>
          )}

          {/* LaunchQR export for summary variant */}
          {showSummary && (
            <div className="mb-6">
              <LaunchQR
                config={qrConfig}
                url={menuUrl}
                tenantName={data.tenantName}
                logoUrl={data.logoUrl || undefined}
              />
            </div>
          )}

          {/* QR Customization */}
          {showQr && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                QR Code
              </p>

              {/* Tab Pills */}
              <div className="flex gap-1.5 mb-6 p-1 rounded-xl bg-app-elevated/40 border border-app-border inline-flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={isActive ? 'default' : 'ghost'}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 h-auto ${
                        isActive
                          ? 'bg-accent text-accent-text'
                          : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-hover'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </Button>
                  );
                })}
              </div>

              {/* ────── Style Tab ────── */}
              {activeTab === 'style' && (
                <div className="space-y-7">
                  {/* Templates */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">Template</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {TEMPLATES.map((tmpl) => {
                        const isSelected = data.qrTemplate === tmpl.id;
                        const isDisabledByUpload = hasUpload;
                        return (
                          <Button
                            key={tmpl.id}
                            type="button"
                            variant="outline"
                            onClick={() => updateData({ qrTemplate: tmpl.id })}
                            disabled={isDisabledByUpload}
                            className={`rounded-xl border text-center transition-all duration-200 overflow-hidden h-auto p-0 flex flex-col ${
                              isSelected && !isDisabledByUpload
                                ? 'border-accent bg-accent/5'
                                : 'border-app-border hover:border-app-border-hover'
                            } ${isDisabledByUpload ? 'opacity-40' : ''}`}
                          >
                            <div className="pt-3 px-2">
                              <TemplateMiniPreview templateId={tmpl.id} data={data} />
                            </div>
                            <div className="py-2 border-t border-app-border w-full">
                              <span
                                className={`text-xs font-semibold ${
                                  isSelected && !isDisabledByUpload
                                    ? 'text-accent'
                                    : 'text-app-text-secondary'
                                }`}
                              >
                                {t(tmpl.labelKey)}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                    {hasUpload && (
                      <p className="text-xs text-app-text-muted mt-2 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Templates desactives car un design personnalise est en cours
                      </p>
                    )}
                  </div>

                  {/* QR Foreground Color */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      Couleur du QR
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {fgPresets.map((p) => (
                        <ColorSwatch
                          key={p.color}
                          color={p.color}
                          isActive={fgColor.toLowerCase() === p.color.toLowerCase()}
                          onClick={() => {
                            updateData({ qrCustomFgColor: p.color });
                            setShowFgPicker(false);
                          }}
                          ariaLabel={p.label}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowFgPicker((v) => !v)}
                        className={`h-9 px-3 rounded-full border text-xs ${
                          showFgPicker
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-app-border text-app-text-secondary hover:border-app-border-hover'
                        }`}
                      >
                        Personnalise
                      </Button>
                      <span className="text-[11px] font-mono text-app-text-muted ml-2 tabular-nums">
                        {fgColor.toUpperCase()}
                      </span>
                    </div>
                    {showFgPicker && (
                      <div className="mt-3 inline-block p-3 rounded-xl border border-app-border bg-app-bg shadow-sm">
                        <HexColorPicker
                          color={fgColor}
                          onChange={(c) => updateData({ qrCustomFgColor: c })}
                        />
                      </div>
                    )}
                  </div>

                  {/* QR Background Color */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">Fond du QR</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {bgPresets.map((p) => (
                        <ColorSwatch
                          key={p.color}
                          color={p.color}
                          isActive={bgColor.toLowerCase() === p.color.toLowerCase()}
                          onClick={() => {
                            updateData({ qrCustomBgColor: p.color });
                            setShowBgPicker(false);
                          }}
                          ariaLabel={p.label}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowBgPicker((v) => !v)}
                        className={`h-9 px-3 rounded-full border text-xs ${
                          showBgPicker
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-app-border text-app-text-secondary hover:border-app-border-hover'
                        }`}
                      >
                        Personnalise
                      </Button>
                      <span className="text-[11px] font-mono text-app-text-muted ml-2 tabular-nums">
                        {bgColor.toUpperCase()}
                      </span>
                    </div>
                    {showBgPicker && (
                      <div className="mt-3 inline-block p-3 rounded-xl border border-app-border bg-app-bg shadow-sm">
                        <HexColorPicker
                          color={bgColor}
                          onChange={(c) => updateData({ qrCustomBgColor: c })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Couleur du support (carte) */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      Couleur du support
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {cardBgPresets.map((p) => (
                        <ColorSwatch
                          key={p.color}
                          color={p.color}
                          isActive={cardBgColor.toLowerCase() === p.color.toLowerCase()}
                          onClick={() => {
                            updateData({ qrCustomCardBgColor: p.color });
                            setShowCardPicker(false);
                          }}
                          ariaLabel={p.label}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCardPicker((v) => !v)}
                        className={`h-9 px-3 rounded-full border text-xs ${
                          showCardPicker
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-app-border text-app-text-secondary hover:border-app-border-hover'
                        }`}
                      >
                        Personnalise
                      </Button>
                      <span className="text-[11px] font-mono text-app-text-muted ml-2 tabular-nums">
                        {cardBgColor === 'transparent' ? 'TRANSPARENT' : cardBgColor.toUpperCase()}
                      </span>
                    </div>
                    {showCardPicker && (
                      <div className="mt-3 inline-block p-3 rounded-xl border border-app-border bg-app-bg shadow-sm">
                        <HexColorPicker
                          color={cardBgColor === 'transparent' ? '#ffffff' : cardBgColor}
                          onChange={(c) => updateData({ qrCustomCardBgColor: c })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Logo toggle - only shown if user has uploaded a logo */}
                  {data.logoUrl && (
                    <div className="flex items-center justify-between p-4 rounded-xl border border-app-border bg-app-elevated/30">
                      <div>
                        <p className="text-sm font-semibold text-app-text">
                          Afficher le logo dans le QR
                        </p>
                        <p className="text-xs text-app-text-muted mt-0.5">
                          Place votre logo au centre du QR code
                        </p>
                      </div>
                      <Switch
                        checked={showLogo}
                        onCheckedChange={(checked) => updateData({ qrShowLogo: checked })}
                        aria-label="Afficher le logo dans le QR"
                      />
                    </div>
                  )}

                  {/* Dimensions */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      Dimensions du support
                    </p>

                    {/* Orientation toggle */}
                    <div className="inline-flex items-center h-9 rounded-xl border border-app-border bg-app-elevated overflow-hidden mb-3">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleOrientation('portrait')}
                        className={`h-full px-4 rounded-none border-r border-app-border text-xs font-medium ${
                          orientation === 'portrait'
                            ? 'bg-accent/10 text-accent'
                            : 'text-app-text-secondary hover:bg-app-border/30'
                        } focus-visible:ring-0 focus-visible:ring-offset-0`}
                      >
                        Portrait
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleOrientation('landscape')}
                        className={`h-full px-4 rounded-none text-xs font-medium ${
                          orientation === 'landscape'
                            ? 'bg-accent/10 text-accent'
                            : 'text-app-text-secondary hover:bg-app-border/30'
                        } focus-visible:ring-0 focus-visible:ring-offset-0`}
                      >
                        <RotateCw className="h-3 w-3 mr-1.5" />
                        Paysage
                      </Button>
                    </div>

                    {/* Format presets */}
                    <div className="flex items-center gap-2 mb-3">
                      {FORMAT_PRESETS.map((preset) => {
                        const presetW = orientation === 'landscape' ? preset.height : preset.width;
                        const presetH = orientation === 'landscape' ? preset.width : preset.height;
                        const isActive = widthMm === presetW && heightMm === presetH;
                        return (
                          <Button
                            key={preset.id}
                            type="button"
                            variant="outline"
                            onClick={() => applyFormatPreset(preset)}
                            className={`h-8 px-3 rounded-lg border text-xs font-medium ${
                              isActive
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border text-app-text-secondary'
                            }`}
                          >
                            {preset.label}
                          </Button>
                        );
                      })}
                    </div>

                    {/* Width / Height inputs - local state allows free typing, clamps on blur */}
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <div>
                        <label className="text-[11px] text-app-text-muted block mb-1.5">
                          Largeur (mm)
                        </label>
                        <Input
                          type="number"
                          min={MIN_DIM_MM}
                          max={MAX_DIM_MM}
                          value={widthInput}
                          onChange={(e) => setWidthInput(e.target.value)}
                          onBlur={() => {
                            const n = Number(widthInput);
                            if (!Number.isFinite(n) || n <= 0) {
                              setWidthInput(String(widthMm));
                              return;
                            }
                            setDimensions(n, heightMm);
                          }}
                          className="h-10 bg-app-elevated/50 border-app-border rounded-xl text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-app-text-muted block mb-1.5">
                          Hauteur (mm)
                        </label>
                        <Input
                          type="number"
                          min={MIN_DIM_MM}
                          max={MAX_DIM_MM}
                          value={heightInput}
                          onChange={(e) => setHeightInput(e.target.value)}
                          onBlur={() => {
                            const n = Number(heightInput);
                            if (!Number.isFinite(n) || n <= 0) {
                              setHeightInput(String(heightMm));
                              return;
                            }
                            setDimensions(widthMm, n);
                          }}
                          className="h-10 bg-app-elevated/50 border-app-border rounded-xl text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-app-text-muted mt-2">
                      Entre {MIN_DIM_MM} mm (A5) et {MAX_DIM_MM} mm (A4)
                    </p>
                  </div>

                  {/* Upload custom design */}
                  <div className="border-t border-app-border pt-6">
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      Ou uploadez votre propre design
                    </p>
                    {/* Native file input — exception per react/forbid-elements rule comment */}
                    {/* eslint-disable-next-line react/forbid-elements */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {hasUpload ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-app-border bg-app-elevated/40">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-app-bg flex items-center justify-center shrink-0">
                          {data.qrUploadedDesignUrl?.endsWith('.pdf') ? (
                            <span className="text-[10px] font-bold text-app-text-muted">PDF</span>
                          ) : (
                            <img
                              src={data.qrUploadedDesignUrl}
                              alt="Uploaded design"
                              className="w-full h-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-app-text">Design personnalise</p>
                          <p className="text-[11px] text-app-text-muted truncate">
                            {widthMm} x {heightMm} mm appliques a l&apos;export
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleRemoveUpload}
                          aria-label="Supprimer"
                          className="h-9 w-9 text-app-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleUploadClick}
                        disabled={uploading}
                        className="w-full h-auto py-4 px-4 rounded-xl border border-dashed border-app-border hover:border-accent/40 hover:bg-app-elevated/30 transition-all flex flex-col items-center gap-1.5"
                      >
                        {uploading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-app-text-muted" />
                        ) : (
                          <Upload className="h-5 w-5 text-app-text-muted" />
                        )}
                        <span className="text-sm font-semibold text-app-text-secondary">
                          {uploading ? 'Telechargement...' : 'Glissez ou cliquez pour choisir'}
                        </span>
                        <span className="text-[11px] text-app-text-muted">
                          PNG, JPG, PDF - max 5 Mo
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ────── Text Tab ────── */}
              {activeTab === 'text' && (
                <div className="space-y-6">
                  {/* CTA Presets */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      {t('qrCtaLabel')}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {CTA_PRESETS.map((preset) => {
                        const isActive = data.qrCta === preset.value;
                        return (
                          <Button
                            key={preset.key}
                            type="button"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => updateData({ qrCta: preset.value })}
                            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all h-auto ${
                              isActive
                                ? 'bg-accent text-accent-text'
                                : 'bg-app-elevated text-app-text-secondary hover:bg-app-hover border border-app-border'
                            }`}
                          >
                            {t(preset.key)}
                          </Button>
                        );
                      })}
                    </div>
                    <Input
                      type="text"
                      value={data.qrCta}
                      onChange={(e) => updateData({ qrCta: e.target.value })}
                      placeholder={t('qrCtaLabel')}
                      className="w-full px-4 py-2.5 text-sm border border-app-border rounded-xl bg-app-elevated/50 text-app-text focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                      maxLength={60}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-xs font-semibold text-app-text-secondary mb-3">
                      {t('qrDescriptionLabel')}
                    </p>
                    <Textarea
                      value={data.qrDescription}
                      onChange={(e) => updateData({ qrDescription: e.target.value })}
                      placeholder={t('qrDescriptionLabel')}
                      rows={2}
                      maxLength={120}
                      className="w-full px-4 py-2.5 text-sm border border-app-border rounded-xl bg-app-elevated/50 text-app-text resize-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* ────── Export Tab ────── */}
              {activeTab === 'export' && (
                <div>
                  <div className="rounded-xl border border-app-border bg-app-elevated/40 p-5">
                    <p className="text-sm font-semibold text-app-text mb-1">
                      Telecharger votre QR code
                    </p>
                    <p className="text-xs text-app-text-muted mb-4 tabular-nums">
                      Support : {widthMm} x {heightMm} mm ·{' '}
                      {orientation === 'landscape' ? 'Paysage' : 'Portrait'}
                      {hasUpload ? ' · Design personnalise' : ''}
                    </p>
                    <LaunchQR
                      config={qrConfig}
                      url={menuUrl}
                      tenantName={data.tenantName}
                      logoUrl={data.logoUrl || undefined}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
