/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { HexColorPicker } from 'react-colorful';
import {
  ExternalLink,
  Copy,
  CheckCheck,
  Upload,
  Trash2,
  Loader2,
  RotateCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { QRTemplateId } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { getSegmentFeatures } from '@/lib/segment-features';
import { getTenantUrl } from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'qr' | 'summary';
}

type LaunchTab = 'style' | 'text';

const TEMPLATES: Array<{ id: QRTemplateId; labelKey: string }> = [
  { id: 'standard', labelKey: 'qrTemplateStandard' },
  { id: 'carte', labelKey: 'qrTemplateCarte' },
  { id: 'chevalet', labelKey: 'qrTemplateChevalet' },
];

const CTA_PRESETS = [
  { key: 'qrCtaScan', value: 'Scannez pour commander' },
  { key: 'qrCtaMenu', value: 'Scannez pour voir le menu' },
  { key: 'qrCtaDiscover', value: 'Scannez pour decouvrir' },
  { key: 'qrCtaCard', value: 'Scannez notre carte' },
];

// Dimension constraints: from business card (50mm) to A3 (420mm)
const MIN_DIM_MM = 50;
const MAX_DIM_MM = 420;
const FORMAT_PRESETS = [
  { id: 'carte', label: 'Carte', width: 85, height: 55 },
  { id: 'a6', label: 'A6', width: 105, height: 148 },
  { id: 'a5', label: 'A5', width: 148, height: 210 },
  { id: 'a4', label: 'A4', width: 210, height: 297 },
];

/** Rainbow conic gradient swatch — opens the custom HEX color picker.
 *  Replaces the old "Custom" text button with an intuitive icon-like swatch. */
function RainbowSwatch({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      aria-label={ariaLabel}
      title="Couleur personnalisee"
      className="w-8 h-8 rounded-full p-0 overflow-hidden transition-opacity hover:opacity-80"
      style={{
        background:
          'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
      }}
    />
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
      className={`w-8 h-8 rounded-full border-2 p-0 transition-all overflow-hidden ${
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
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showQr = variant === 'qr';
  const showSummary = variant === 'summary';

  const menuUrl = getTenantUrl(data.tenantSlug || '');

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

  const tabs: Array<{ id: LaunchTab; label: string }> = [
    { id: 'style', label: t('qrStyleTab') },
    { id: 'text', label: t('qrTextTab') },
  ];

  // ─── Color helpers ───────────────────────────────
  const fgColor = data.qrCustomFgColor ?? '#000000';
  const bgColor = data.qrCustomBgColor ?? '#FFFFFF';
  const cardBgColor = data.qrCustomCardBgColor ?? '#FFFFFF';

  // Logo: explicit toggle. Default ON if user has a logoUrl, OFF otherwise.
  const showLogo = data.qrShowLogo === undefined ? !!data.logoUrl : data.qrShowLogo;
  // Per-element controls
  const qrCodeSize = data.qrCodeSize ?? 'md';
  const qrTextSize = data.qrTextSize ?? 'md';
  const showName = data.qrShowName !== false;
  const showCta = data.qrShowCta !== false;
  const qrPosition = data.qrPosition ?? 'center';

  const SIZE_LABELS: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', string> = {
    xs: '50%',
    sm: '75%',
    md: '100%',
    lg: '130%',
    xl: '160%',
    '2xl': '200%',
    '3xl': '250%',
  };
  const QR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

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

  const textColorPresets = [
    { color: '#1A1A1A', label: 'Noir' },
    { color: '#FFFFFF', label: 'Blanc' },
    { color: data.primaryColor || '#000000', label: 'Couleur de marque' },
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
        <div
          className={
            showQr ? 'px-4 pt-2 pb-1 sm:px-6 lg:px-8' : 'px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5'
          }
        >
          {/* Header — compact for QR variant */}
          <div className={showSummary ? 'mb-6' : 'mb-2'}>
            <h1
              className={`font-bold text-app-text ${showSummary ? 'text-lg mb-0.5' : 'text-base'}`}
            >
              {showSummary ? t('launchTitle') : t('qrCodeTitle')}
            </h1>
            {showSummary && (
              <p className="text-app-text-secondary text-sm">{t('launchSubtitle')}</p>
            )}
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
                    <span className="text-xl font-bold text-white select-none">
                      {(data.tenantName || 'A').charAt(0).toUpperCase()}
                    </span>
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
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.done ? accentColor : 'var(--app-border)' }}
                    />
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

          {/* QR Customization */}
          {showQr && (
            <div>
              {/* Tab Pills — compact */}
              <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-app-elevated/40 border border-app-border inline-flex">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={isActive ? 'default' : 'ghost'}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200 h-auto ${
                        isActive
                          ? 'bg-accent text-accent-text'
                          : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-hover'
                      }`}
                    >
                      {tab.label}
                    </Button>
                  );
                })}
              </div>

              {/* ────── Style Tab — Modele/Couleurs full width, puis Elements | Upload, puis Format ────── */}
              {activeTab === 'style' && (
                <div className="divide-y divide-app-border/50">
                  {/* Section 1: Modele */}
                  <section className="pb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-semibold text-app-text">Modele</h3>
                      {hasUpload && (
                        <span className="text-[10px] text-app-text-muted flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Desactive (design personnalise)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATES.map((tmpl) => {
                        const isSelected = data.qrTemplate === tmpl.id;
                        const disabled = hasUpload;
                        return (
                          <Button
                            key={tmpl.id}
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const d = TEMPLATE_DEFAULTS[tmpl.id];
                              updateData({
                                qrTemplate: tmpl.id,
                                qrSupportWidth: d.width,
                                qrSupportHeight: d.height,
                                qrOrientation: d.orientation,
                              });
                            }}
                            disabled={disabled}
                            className={`h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all ${
                              isSelected && !disabled
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border text-app-text-secondary hover:border-app-border-hover hover:text-app-text'
                            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            {t(tmpl.labelKey)}
                          </Button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Section: Style QR */}
                  <section className="py-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Style</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { value: 'classic', label: 'Classique' },
                          { value: 'branded', label: 'Marque' },
                          { value: 'inverted', label: 'Inverse' },
                          { value: 'dark', label: 'Sombre' },
                        ] as const
                      ).map((style) => {
                        const isSelected = data.qrStyle === style.value;
                        return (
                          <Button
                            key={style.value}
                            type="button"
                            variant="outline"
                            onClick={() =>
                              updateData({ qrStyle: style.value as OnboardingData['qrStyle'] })
                            }
                            className={`h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all ${
                              isSelected
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border text-app-text-secondary hover:border-app-border-hover hover:text-app-text'
                            }`}
                          >
                            {style.label}
                          </Button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Section 2: Couleurs */}
                  <section className="py-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Couleurs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                      {/* QR foreground */}
                      <div>
                        <p className="text-[10px] font-semibold text-app-text-secondary mb-1">
                          Couleur du QR
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          <Popover open={showFgPicker} onOpenChange={setShowFgPicker}>
                            <PopoverTrigger asChild>
                              <RainbowSwatch
                                onClick={() => setShowFgPicker((v) => !v)}
                                ariaLabel="Couleur personnalisee du QR"
                              />
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" side="bottom" align="start">
                              <HexColorPicker
                                color={fgColor}
                                onChange={(c) => updateData({ qrCustomFgColor: c })}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setShowFgPicker(false)}
                                className="mt-2 h-7 px-3 text-xs font-semibold w-full"
                              >
                                {t('colorValidate')}
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* QR background */}
                      <div>
                        <p className="text-[10px] font-semibold text-app-text-secondary mb-1">
                          Fond du QR
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          <Popover open={showBgPicker} onOpenChange={setShowBgPicker}>
                            <PopoverTrigger asChild>
                              <RainbowSwatch
                                onClick={() => setShowBgPicker((v) => !v)}
                                ariaLabel="Fond personnalise du QR"
                              />
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" side="bottom" align="start">
                              <HexColorPicker
                                color={bgColor === 'transparent' ? '#ffffff' : bgColor}
                                onChange={(c) => updateData({ qrCustomBgColor: c })}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setShowBgPicker(false)}
                                className="mt-2 h-7 px-3 text-xs font-semibold w-full"
                              >
                                {t('colorValidate')}
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Card support background */}
                      <div>
                        <p className="text-[10px] font-semibold text-app-text-secondary mb-1">
                          Couleur du support
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          <Popover open={showCardPicker} onOpenChange={setShowCardPicker}>
                            <PopoverTrigger asChild>
                              <RainbowSwatch
                                onClick={() => setShowCardPicker((v) => !v)}
                                ariaLabel="Couleur personnalisee du support"
                              />
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" side="bottom" align="start">
                              <HexColorPicker
                                color={cardBgColor === 'transparent' ? '#ffffff' : cardBgColor}
                                onChange={(c) => updateData({ qrCustomCardBgColor: c })}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setShowCardPicker(false)}
                                className="mt-2 h-7 px-3 text-xs font-semibold w-full"
                              >
                                {t('colorValidate')}
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Logo toggle - compact on/off pill */}
                      {data.logoUrl && (
                        <div>
                          <p className="text-[10px] font-semibold text-app-text-secondary mb-1">
                            Logo
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => updateData({ qrShowLogo: !showLogo })}
                            aria-pressed={showLogo}
                            title={showLogo ? 'Masquer le logo' : 'Afficher le logo'}
                            className={`h-8 w-16 px-2 rounded-full border text-[11px] font-bold uppercase transition-all ${
                              showLogo
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border bg-app-elevated/40 text-app-text-muted hover:border-app-border-hover'
                            }`}
                          >
                            {showLogo ? 'On' : 'Off'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Row: Elements (gauche) + Utiliser votre design (droite). Une seule section,
                      un seul separator avant et apres, comme demande par l'utilisateur. */}
                  <section className="py-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 items-start">
                      {/* Colonne gauche : Elements */}
                      <div>
                        <h3 className="text-xs font-semibold text-app-text mb-1.5">Elements</h3>
                        <div className="space-y-2">
                          {/* Taille du QR */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-app-text-secondary w-20 shrink-0">
                              Taille QR
                            </span>
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const idx = QR_SIZES.indexOf(qrCodeSize);
                                  if (idx > 0) updateData({ qrCodeSize: QR_SIZES[idx - 1] });
                                }}
                                disabled={qrCodeSize === 'xs'}
                                aria-label="Reduire la taille du QR"
                                className="h-7 w-7 rounded-full border border-app-border p-0 flex items-center justify-center text-app-text disabled:opacity-40"
                              >
                                <span className="text-sm leading-none select-none">-</span>
                              </Button>
                              <span className="text-[11px] font-semibold text-app-text w-9 text-center tabular-nums">
                                {SIZE_LABELS[qrCodeSize]}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const idx = QR_SIZES.indexOf(qrCodeSize);
                                  if (idx < QR_SIZES.length - 1)
                                    updateData({ qrCodeSize: QR_SIZES[idx + 1] });
                                }}
                                disabled={qrCodeSize === '3xl'}
                                aria-label="Augmenter la taille du QR"
                                className="h-7 w-7 rounded-full border border-app-border p-0 flex items-center justify-center text-app-text disabled:opacity-40"
                              >
                                <span className="text-sm leading-none select-none">+</span>
                              </Button>
                            </div>
                          </div>
                          {/* Visibilite nom + CTA */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-app-text-secondary w-20 shrink-0">
                              Afficher
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => updateData({ qrShowName: !showName })}
                              aria-pressed={showName}
                              className={`h-7 px-3 rounded-full border text-[10px] font-bold uppercase ${
                                showName
                                  ? 'border-accent bg-accent/10 text-accent'
                                  : 'border-app-border bg-app-elevated/40 text-app-text-muted'
                              }`}
                            >
                              Nom {showName ? 'on' : 'off'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => updateData({ qrShowCta: !showCta })}
                              aria-pressed={showCta}
                              className={`h-7 px-3 rounded-full border text-[10px] font-bold uppercase ${
                                showCta
                                  ? 'border-accent bg-accent/10 text-accent'
                                  : 'border-app-border bg-app-elevated/40 text-app-text-muted'
                              }`}
                            >
                              Accroche {showCta ? 'on' : 'off'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {/* Colonne droite : Utiliser votre design */}
                      <div>
                        <h3 className="text-xs font-semibold text-app-text mb-1.5">
                          Ou utilisez votre design
                        </h3>
                        {/* eslint-disable-next-line react/forbid-elements */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {hasUpload ? (
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-app-border bg-app-elevated/40">
                            <div className="w-8 h-8 rounded overflow-hidden bg-app-bg flex items-center justify-center shrink-0">
                              {data.qrUploadedDesignUrl &&
                              data.qrUploadedDesignUrl
                                .split('?')[0]
                                .split('#')[0]
                                .toLowerCase()
                                .endsWith('.pdf') ? (
                                <span className="text-[9px] font-bold text-app-text-muted">
                                  PDF
                                </span>
                              ) : (
                                <img
                                  src={data.qrUploadedDesignUrl}
                                  alt="Uploaded design"
                                  className="w-full h-full object-contain"
                                />
                              )}
                            </div>
                            <p className="flex-1 min-w-0 text-[11px] text-app-text truncate">
                              Design personnalise -{' '}
                              <span className="text-app-text-muted">
                                {widthMm} x {heightMm} mm
                              </span>
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleRemoveUpload}
                              aria-label="Supprimer"
                              className="h-7 w-7 text-app-text-muted hover:text-red-500 hover:bg-red-500/10 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleUploadClick}
                            disabled={uploading}
                            className="w-full h-auto py-3 px-4 rounded-xl border-2 border-dashed border-app-border hover:border-accent/50 hover:bg-app-elevated/30 transition-all flex flex-col items-center justify-center gap-1.5"
                          >
                            {uploading ? (
                              <Loader2 className="h-5 w-5 animate-spin text-app-text-muted" />
                            ) : (
                              <Upload className="h-5 w-5 text-app-text-muted" />
                            )}
                            <span className="text-xs font-semibold text-app-text">
                              {uploading ? 'Telechargement...' : 'Choisir un fichier'}
                            </span>
                            <span className="text-[10px] text-app-text-muted">
                              PNG, JPG, PDF - 5 Mo max
                            </span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section 3: Format - dimensions custom pour tous les templates */}
                  <section className="py-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Format</h3>
                    <div className="flex items-center flex-wrap gap-1.5">
                      {/* Orientation pill toggle */}
                      <div className="inline-flex items-center h-8 rounded-full border border-app-border bg-app-elevated overflow-hidden">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => toggleOrientation('portrait')}
                          className={`h-full px-2.5 rounded-none text-[11px] font-medium ${
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
                          className={`h-full px-2.5 rounded-none border-l border-app-border text-[11px] font-medium ${
                            orientation === 'landscape'
                              ? 'bg-accent/10 text-accent'
                              : 'text-app-text-secondary hover:bg-app-border/30'
                          } focus-visible:ring-0 focus-visible:ring-offset-0`}
                        >
                          <RotateCw className="h-3 w-3 mr-1" />
                          Paysage
                        </Button>
                      </div>

                      {/* Format presets */}
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
                            className={`h-8 px-2.5 rounded-full border text-[11px] font-medium ${
                              isActive
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border text-app-text-secondary'
                            }`}
                          >
                            {preset.label}
                          </Button>
                        );
                      })}

                      {/* Inline width x height inputs */}
                      <div className="flex items-center gap-1 ml-auto">
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
                          aria-label="Largeur en mm"
                          className="h-8 w-14 px-1.5 bg-app-elevated/50 border-app-border rounded-lg text-[11px] tabular-nums text-center"
                        />
                        <span className="text-app-text-muted text-[11px]">x</span>
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
                          aria-label="Hauteur en mm"
                          className="h-8 w-14 px-1.5 bg-app-elevated/50 border-app-border rounded-lg text-[11px] tabular-nums text-center"
                        />
                        <span className="text-app-text-muted text-[10px] ml-0.5">mm</span>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* ────── Text Tab — compact, structure ────── */}
              {activeTab === 'text' && (
                <div className="divide-y divide-app-border/50">
                  {/* Section: Nom affiche */}
                  <section className="pb-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Nom affiche</h3>
                    <Input
                      type="text"
                      value={data.qrCustomName ?? ''}
                      onChange={(e) => updateData({ qrCustomName: e.target.value || undefined })}
                      placeholder={data.tenantName || "Nom de l'etablissement"}
                      className="w-full h-8 px-3 text-xs border border-app-border rounded-lg bg-app-elevated/50 text-app-text focus:border-app-border-hover focus:outline-none"
                      maxLength={60}
                    />
                    <p className="text-[10px] text-app-text-muted mt-1">
                      Laisser vide pour utiliser le nom de votre etablissement.
                    </p>
                  </section>
                  {/* Section: Accroche (CTA) */}
                  <section className="pb-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Accroche</h3>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {CTA_PRESETS.map((preset) => {
                        const isActive = data.qrCta === preset.value;
                        return (
                          <Button
                            key={preset.key}
                            type="button"
                            variant="outline"
                            onClick={() => updateData({ qrCta: preset.value })}
                            className={`h-7 px-2.5 rounded-full border text-[11px] font-medium ${
                              isActive
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-app-border text-app-text-secondary hover:border-app-border-hover hover:text-app-text'
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
                      className="w-full h-8 px-3 text-xs border border-app-border rounded-lg bg-app-elevated/50 text-app-text focus:border-app-border-hover focus:outline-none"
                      maxLength={60}
                    />
                  </section>

                  {/* Section: Description */}
                  <section className="py-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Description</h3>
                    <Textarea
                      value={data.qrDescription}
                      onChange={(e) => updateData({ qrDescription: e.target.value })}
                      placeholder={t('qrDescriptionLabel')}
                      rows={2}
                      maxLength={120}
                      className="w-full px-3 py-2 text-xs border border-app-border rounded-lg bg-app-elevated/50 text-app-text resize-none focus:border-app-border-hover focus:outline-none"
                    />
                  </section>

                  {/* Section: Mise en forme du texte (taille / position / couleur) */}
                  <section className="py-2">
                    <h3 className="text-xs font-semibold text-app-text mb-1.5">Mise en forme</h3>
                    <div className="space-y-2">
                      {/* Taille du texte */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-app-text-secondary w-20 shrink-0">
                          Taille
                        </span>
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const idx = QR_SIZES.indexOf(qrTextSize);
                              if (idx > 0) updateData({ qrTextSize: QR_SIZES[idx - 1] });
                            }}
                            disabled={qrTextSize === 'xs'}
                            aria-label="Reduire la taille du texte"
                            className="h-7 w-7 rounded-full border border-app-border p-0 flex items-center justify-center text-app-text disabled:opacity-40"
                          >
                            <span className="text-sm leading-none select-none">-</span>
                          </Button>
                          <span className="text-[11px] font-semibold text-app-text w-9 text-center tabular-nums">
                            {SIZE_LABELS[qrTextSize]}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const idx = QR_SIZES.indexOf(qrTextSize);
                              if (idx < QR_SIZES.length - 1)
                                updateData({ qrTextSize: QR_SIZES[idx + 1] });
                            }}
                            disabled={qrTextSize === '3xl'}
                            aria-label="Augmenter la taille du texte"
                            className="h-7 w-7 rounded-full border border-app-border p-0 flex items-center justify-center text-app-text disabled:opacity-40"
                          >
                            <span className="text-sm leading-none select-none">+</span>
                          </Button>
                        </div>
                      </div>
                      {/* Position du texte */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-app-text-secondary w-20 shrink-0">
                          Position
                        </span>
                        <div className="inline-flex items-center h-7 rounded-full border border-app-border bg-app-elevated overflow-hidden">
                          {(
                            [
                              {
                                id: 'start',
                                label: orientation === 'landscape' ? 'Gauche' : 'Haut',
                              },
                              { id: 'center', label: 'Centre' },
                              { id: 'end', label: orientation === 'landscape' ? 'Droite' : 'Bas' },
                            ] as const
                          ).map((p, i) => (
                            <Button
                              key={p.id}
                              type="button"
                              variant="ghost"
                              onClick={() => updateData({ qrPosition: p.id })}
                              className={`h-full px-2.5 rounded-none text-[10px] font-medium ${
                                qrPosition === p.id
                                  ? 'bg-accent/10 text-accent'
                                  : 'text-app-text-secondary hover:bg-app-border/30'
                              } ${i > 0 ? 'border-l border-app-border' : ''} focus-visible:ring-0 focus-visible:ring-offset-0`}
                            >
                              {p.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {/* Couleur du texte */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-app-text-secondary w-20 shrink-0">
                          Couleur
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {textColorPresets.map((p) => (
                              <ColorSwatch
                                key={p.color}
                                color={p.color}
                                isActive={
                                  (data.qrCustomTextColor ?? '').toLowerCase() ===
                                  p.color.toLowerCase()
                                }
                                onClick={() => {
                                  updateData({ qrCustomTextColor: p.color });
                                  setShowTextColorPicker(false);
                                }}
                                ariaLabel={p.label}
                              />
                            ))}
                            <Popover
                              open={showTextColorPicker}
                              onOpenChange={setShowTextColorPicker}
                            >
                              <PopoverTrigger asChild>
                                <RainbowSwatch
                                  onClick={() => setShowTextColorPicker((v) => !v)}
                                  ariaLabel="Couleur personnalisee du texte"
                                />
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" side="bottom" align="start">
                                <HexColorPicker
                                  color={data.qrCustomTextColor || '#1A1A1A'}
                                  onChange={(c) => updateData({ qrCustomTextColor: c })}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => setShowTextColorPicker(false)}
                                  className="mt-2 h-7 px-3 text-xs font-semibold w-full"
                                >
                                  {t('colorValidate')}
                                </Button>
                              </PopoverContent>
                            </Popover>
                            {data.qrCustomTextColor && (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => updateData({ qrCustomTextColor: undefined })}
                                className="h-7 px-2 text-[10px] text-app-text-muted hover:text-app-text"
                                title="Reinitialiser (auto)"
                              >
                                Auto
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
