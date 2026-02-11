'use client';

import { useCallback } from 'react';
import { Layout, QrCode, Palette, Type, Settings2, Check, ImagePlus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/qr/ColorPicker';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type {
  QRDesignConfig,
  QRTemplateId,
  QRCTAPreset,
  QRErrorCorrectionLevel,
  QRShadowIntensity,
} from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS, CTA_PRESETS, FONT_OPTIONS } from '@/types/qr-design.types';

// ─── Types ─────────────────────────────────────────────

interface QRCustomizerPanelProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  setTemplate: (templateId: QRTemplateId) => void;
  tenantLogoUrl?: string;
}

// ─── Constants ─────────────────────────────────────────

const TEMPLATE_IDS: QRTemplateId[] = [
  'standard',
  'chevalet',
  'carte',
  'minimal',
  'elegant',
  'neon',
];

const FREE_TEMPLATES: QRTemplateId[] = ['standard', 'chevalet', 'carte'];

const ERROR_CORRECTION_LEVELS: {
  value: QRErrorCorrectionLevel;
  label: string;
}[] = [
  { value: 'L', label: 'Basse (7%)' },
  { value: 'M', label: 'Moyenne (15%)' },
  { value: 'Q', label: 'Haute (25%)' },
  { value: 'H', label: 'Max (30%)' },
];

const SHADOW_OPTIONS: { value: QRShadowIntensity; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'light', label: 'L\u00e9g\u00e8re' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'strong', label: 'Forte' },
];

const CTA_PRESET_ENTRIES = (Object.entries(CTA_PRESETS) as [QRCTAPreset, string][]).filter(
  ([key]) => key !== 'custom',
);

// ─── Slider Helper ────────────────────────────────────

interface SliderFieldProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function SliderField({ label, value, unit, min, max, step, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500">{label}</Label>
        <span className="text-xs font-mono text-gray-400">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

// ─── Section Helper ───────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────

export function QRCustomizerPanel({
  config,
  updateField,
  setTemplate,
  tenantLogoUrl,
}: QRCustomizerPanelProps) {
  // ─── Logo nested field helpers ──────────────────────

  const updateLogo = useCallback(
    <K extends keyof QRDesignConfig['logo']>(key: K, value: QRDesignConfig['logo'][K]) => {
      updateField('logo', { ...config.logo, [key]: value });
    },
    [config.logo, updateField],
  );

  const updateGradient = useCallback(
    <K extends keyof QRDesignConfig['gradient']>(key: K, value: QRDesignConfig['gradient'][K]) => {
      updateField('gradient', { ...config.gradient, [key]: value });
    },
    [config.gradient, updateField],
  );

  const updateBackgroundImage = useCallback(
    <K extends keyof QRDesignConfig['backgroundImage']>(
      key: K,
      value: QRDesignConfig['backgroundImage'][K],
    ) => {
      updateField('backgroundImage', { ...config.backgroundImage, [key]: value });
    },
    [config.backgroundImage, updateField],
  );

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <Tabs defaultValue="template">
        {/* Tab triggers */}
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="template" className="flex items-center gap-1.5 text-xs">
            <Layout className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Template</span>
          </TabsTrigger>
          <TabsTrigger value="qrcode" className="flex items-center gap-1.5 text-xs">
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">QR Code</span>
          </TabsTrigger>
          <TabsTrigger value="design" className="flex items-center gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Design</span>
          </TabsTrigger>
          <TabsTrigger value="text" className="flex items-center gap-1.5 text-xs">
            <Type className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Texte</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Avanc\u00e9</span>
          </TabsTrigger>
        </TabsList>

        {/* ────────────────────────── Tab 1: Template ────────────────────────── */}
        <TabsContent value="template" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATE_IDS.map((id) => {
              const defaults = TEMPLATE_DEFAULTS[id];
              const isSelected = config.templateId === id;
              const isFree = FREE_TEMPLATES.includes(id);

              const card = (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTemplate(id)}
                  className={`
                    relative flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left
                    transition-all duration-150 cursor-pointer
                    ${isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400 bg-white'}
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-gray-900 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{
                      backgroundColor: isSelected ? '#111827' : '#9CA3AF',
                    }}
                  >
                    {defaults.width}
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{defaults.name}</span>
                  <span className="text-xs text-gray-500 leading-tight">
                    {defaults.description}
                  </span>
                </button>
              );

              if (isFree) {
                return card;
              }

              return (
                <FeatureGate key={id} feature="qrPremiumTemplates">
                  {card}
                </FeatureGate>
              );
            })}
          </div>
        </TabsContent>

        {/* ────────────────────────── Tab 2: QR Code ─────────────────────────── */}
        <TabsContent value="qrcode" className="space-y-6">
          {/* QR colors */}
          <FeatureGate feature="qrCustomColors">
            <Section title="Couleur des modules">
              <div className="space-y-4">
                <ColorPicker
                  value={config.qrFgColor}
                  onChange={(c) => updateField('qrFgColor', c)}
                  label="Couleur des points"
                />
                <ColorPicker
                  value={config.qrBgColor}
                  onChange={(c) => updateField('qrBgColor', c)}
                  label="Fond du QR"
                />
              </div>
            </Section>
          </FeatureGate>

          {/* Error correction */}
          <FeatureGate feature="qrCustomColors">
            <Section title="Correction d'erreur">
              <div className="grid grid-cols-2 gap-2">
                {ERROR_CORRECTION_LEVELS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateField('errorCorrection', value)}
                    className={`
                      px-3 py-2 rounded-lg text-xs font-medium border transition-all
                      ${
                        config.errorCorrection === value
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                      }
                    `}
                  >
                    <span className="font-bold">{value}</span>
                    {' \u2014 '}
                    {label}
                  </button>
                ))}
              </div>
            </Section>
          </FeatureGate>

          {/* QR margin (quiet zone) */}
          <FeatureGate feature="qrSizeAdjust">
            <Section title="Marge du QR">
              <SliderField
                label="Zone calme"
                value={config.marginSize}
                unit="px"
                min={0}
                max={10}
                step={1}
                onChange={(v) => updateField('marginSize', v)}
              />
            </Section>
          </FeatureGate>

          {/* Logo in QR */}
          <FeatureGate feature="qrLogoEmbed">
            <Section title="Logo dans le QR">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-700">Activer le logo</Label>
                  <Switch
                    checked={config.logo.enabled}
                    onCheckedChange={(checked) => updateLogo('enabled', checked)}
                  />
                </div>

                {config.logo.enabled && (
                  <div className="space-y-4 pl-1">
                    <p className="text-xs text-gray-500">
                      Utilisez votre logo ci-dessous ou uploadez une image
                    </p>

                    {tenantLogoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => updateLogo('src', tenantLogoUrl)}
                      >
                        <ImagePlus className="h-4 w-4" />
                        Utiliser le logo du restaurant
                      </Button>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">URL du logo</Label>
                      <Input
                        type="url"
                        value={config.logo.src}
                        onChange={(e) => updateLogo('src', e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="text-sm"
                      />
                    </div>

                    <SliderField
                      label="Largeur"
                      value={config.logo.width}
                      unit="px"
                      min={20}
                      max={80}
                      step={1}
                      onChange={(v) => updateLogo('width', v)}
                    />
                    <SliderField
                      label="Hauteur"
                      value={config.logo.height}
                      unit="px"
                      min={20}
                      max={80}
                      step={1}
                      onChange={(v) => updateLogo('height', v)}
                    />
                    <SliderField
                      label="Opacité"
                      value={Math.round(config.logo.opacity * 100)}
                      unit="%"
                      min={10}
                      max={100}
                      step={5}
                      onChange={(v) => updateLogo('opacity', v / 100)}
                    />

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-500">
                        D\u00e9couper le QR sous le logo
                      </Label>
                      <Switch
                        checked={config.logo.excavate}
                        onCheckedChange={(checked) => updateLogo('excavate', checked)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </FeatureGate>
        </TabsContent>

        {/* ────────────────────────── Tab 3: Design ──────────────────────────── */}
        <TabsContent value="design" className="space-y-6">
          {/* Template colors */}
          <Section title="Couleurs du support">
            <div className="space-y-4">
              <ColorPicker
                value={config.templateBgColor}
                onChange={(c) => updateField('templateBgColor', c)}
                label="Fond"
              />
              <ColorPicker
                value={config.templateAccentColor}
                onChange={(c) => updateField('templateAccentColor', c)}
                label="Accent"
              />
              <ColorPicker
                value={config.templateTextColor}
                onChange={(c) => updateField('templateTextColor', c)}
                label="Texte"
              />
            </div>
          </Section>

          {/* Dimensions */}
          <FeatureGate feature="qrSizeAdjust">
            <Section title="Dimensions">
              <div className="space-y-4">
                <SliderField
                  label="Largeur"
                  value={config.templateWidth}
                  unit="mm"
                  min={50}
                  max={200}
                  step={1}
                  onChange={(v) => updateField('templateWidth', v)}
                />
                <SliderField
                  label="Hauteur"
                  value={config.templateHeight}
                  unit="mm"
                  min={50}
                  max={250}
                  step={1}
                  onChange={(v) => updateField('templateHeight', v)}
                />
                <SliderField
                  label="Taille du QR"
                  value={config.qrSize}
                  unit="px"
                  min={60}
                  max={300}
                  step={5}
                  onChange={(v) => updateField('qrSize', v)}
                />
              </div>
            </Section>
          </FeatureGate>

          {/* Style */}
          <FeatureGate feature="qrSizeAdjust">
            <Section title="Style">
              <div className="space-y-4">
                <SliderField
                  label="Coins arrondis"
                  value={config.cornerRadius}
                  unit="px"
                  min={0}
                  max={32}
                  step={1}
                  onChange={(v) => updateField('cornerRadius', v)}
                />
                <SliderField
                  label="Espacement"
                  value={config.padding}
                  unit="px"
                  min={8}
                  max={64}
                  step={1}
                  onChange={(v) => updateField('padding', v)}
                />

                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Ombre</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {SHADOW_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateField('shadow', value)}
                        className={`
                          px-2 py-1.5 rounded-lg text-xs font-medium border transition-all
                          ${
                            config.shadow === value
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                          }
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          </FeatureGate>
        </TabsContent>

        {/* ────────────────────────── Tab 4: Text ────────────────────────────── */}
        <TabsContent value="text" className="space-y-6">
          {/* CTA presets */}
          <Section title="Appel \u00e0 l'action">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Texte pr\u00e9d\u00e9fini</Label>
                <select
                  value={config.ctaPreset}
                  onChange={(e) => {
                    const preset = e.target.value as QRCTAPreset;
                    updateField('ctaPreset', preset);
                    if (preset !== 'custom') {
                      updateField('ctaText', CTA_PRESETS[preset]);
                    }
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {CTA_PRESET_ENTRIES.map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                  <option value="custom">Personnalis\u00e9...</option>
                </select>
              </div>

              <FeatureGate feature="qrCustomCTA">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Texte personnalis\u00e9</Label>
                  <Input
                    type="text"
                    value={config.ctaText}
                    onChange={(e) => {
                      updateField('ctaText', e.target.value);
                      updateField('ctaPreset', 'custom');
                    }}
                    placeholder="Votre texte ici..."
                    className="text-sm"
                  />
                </div>
              </FeatureGate>
            </div>
          </Section>

          {/* Description */}
          <FeatureGate feature="qrCustomCTA">
            <Section title="Description">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Description additionnelle</Label>
                <textarea
                  value={config.descriptionText}
                  onChange={(e) => updateField('descriptionText', e.target.value)}
                  placeholder="Ajoutez une description..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
            </Section>
          </FeatureGate>

          {/* Footer */}
          <FeatureGate feature="qrEnterpriseDesign" planRequired="enterprise">
            <Section title="Pied de page">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Texte de pied de page</Label>
                  <Input
                    type="text"
                    value={config.footerText}
                    onChange={(e) => updateField('footerText', e.target.value)}
                    placeholder="Ex: Wi-Fi: MonReseau / mdp123"
                    className="text-sm"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-700">
                    Afficher &lsquo;Powered by Attabl&rsquo;
                  </Label>
                  <Switch
                    checked={config.showPoweredBy}
                    onCheckedChange={(checked) => updateField('showPoweredBy', checked)}
                  />
                </div>
              </div>
            </Section>
          </FeatureGate>
        </TabsContent>

        {/* ────────────────────────── Tab 5: Advanced ────────────────────────── */}
        <TabsContent value="advanced" className="space-y-6">
          <FeatureGate feature="qrEnterpriseDesign" planRequired="enterprise">
            <div className="space-y-6">
              {/* Gradient */}
              <Section title="D\u00e9grad\u00e9">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-gray-700">Activer le d\u00e9grad\u00e9</Label>
                    <Switch
                      checked={config.gradient.enabled}
                      onCheckedChange={(checked) => updateGradient('enabled', checked)}
                    />
                  </div>

                  {config.gradient.enabled && (
                    <div className="space-y-4 pl-1">
                      <ColorPicker
                        value={config.gradient.colorStart}
                        onChange={(c) => updateGradient('colorStart', c)}
                        label="Couleur de d\u00e9part"
                      />
                      <ColorPicker
                        value={config.gradient.colorEnd}
                        onChange={(c) => updateGradient('colorEnd', c)}
                        label="Couleur d'arriv\u00e9e"
                      />
                      <SliderField
                        label="Angle"
                        value={config.gradient.angle}
                        unit="\u00b0"
                        min={0}
                        max={360}
                        step={1}
                        onChange={(v) => updateGradient('angle', v)}
                      />
                    </div>
                  )}
                </div>
              </Section>

              {/* Background image */}
              <Section title="Image de fond">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-gray-700">Activer l&apos;image</Label>
                    <Switch
                      checked={config.backgroundImage.enabled}
                      onCheckedChange={(checked) => updateBackgroundImage('enabled', checked)}
                    />
                  </div>

                  {config.backgroundImage.enabled && (
                    <div className="space-y-4 pl-1">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">URL de l&apos;image</Label>
                        <Input
                          type="url"
                          value={config.backgroundImage.src}
                          onChange={(e) => updateBackgroundImage('src', e.target.value)}
                          placeholder="https://example.com/bg.jpg"
                          className="text-sm"
                        />
                      </div>
                      <SliderField
                        label="Opacit\u00e9"
                        value={Math.round(config.backgroundImage.opacity * 100)}
                        unit="%"
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => updateBackgroundImage('opacity', v / 100)}
                      />
                    </div>
                  )}
                </div>
              </Section>

              {/* Typography */}
              <Section title="Typographie">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Police</Label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) => updateField('fontFamily', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Section>

              {/* White-label */}
              <Section title="White-label">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-700">Masquer le branding Attabl</Label>
                  <Switch
                    checked={!config.showPoweredBy}
                    onCheckedChange={(checked) => updateField('showPoweredBy', !checked)}
                  />
                </div>
              </Section>
            </div>
          </FeatureGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}
