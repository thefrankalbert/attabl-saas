'use client';

import { useCallback, useRef } from 'react';
import {
  Layout,
  QrCode,
  Palette,
  Type,
  Settings2,
  Check,
  ImagePlus,
  Upload,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <Label className="text-xs text-app-text-muted">{label}</Label>
        <span className="text-xs font-mono text-app-text-muted">
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
      <h3 className="text-sm font-semibold text-app-text">{title}</h3>
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

  // ─── Logo file upload ────────────────────────────────
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (typeof dataUrl === 'string') {
          updateLogo('src', dataUrl);
        }
      };
      reader.readAsDataURL(file);

      // Reset file input so the same file can be re-selected
      e.target.value = '';
    },
    [updateLogo],
  );

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="bg-app-card rounded-xl border border-app-border p-4">
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
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  onClick={() => setTemplate(id)}
                  className={`
                    relative flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left
                    h-auto whitespace-normal
                    ${isSelected ? 'border-accent bg-app-bg' : 'border-app-border hover:border-app-text-muted bg-app-card'}
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
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
                  <span className="text-sm font-semibold text-app-text">{defaults.name}</span>
                  <span className="text-xs text-app-text-muted leading-tight">
                    {defaults.description}
                  </span>
                </Button>
              );

              if (isFree) {
                return card;
              }

              return (
                <FeatureGate key={id} feature="canAccessQrCustomization">
                  {card}
                </FeatureGate>
              );
            })}
          </div>
        </TabsContent>

        {/* ────────────────────────── Tab 2: QR Code ─────────────────────────── */}
        <TabsContent value="qrcode" className="space-y-6">
          {/* QR colors */}
          <FeatureGate feature="canAccessQrCustomization">
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
          <FeatureGate feature="canAccessQrCustomization">
            <Section title="Correction d'erreur">
              <div className="grid grid-cols-2 gap-2">
                {ERROR_CORRECTION_LEVELS.map(({ value, label }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={config.errorCorrection === value ? 'default' : 'outline'}
                    onClick={() => updateField('errorCorrection', value)}
                    className={`
                      px-3 py-2 rounded-lg text-xs font-medium h-auto
                      ${
                        config.errorCorrection === value
                          ? 'border-accent bg-accent text-white'
                          : 'border-app-border bg-app-card text-app-text-secondary hover:border-app-text-muted'
                      }
                    `}
                  >
                    <span className="font-bold">{value}</span>
                    {' \u2014 '}
                    {label}
                  </Button>
                ))}
              </div>
            </Section>
          </FeatureGate>

          {/* QR margin (quiet zone) */}
          <FeatureGate feature="canAccessQrCustomization">
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
          <FeatureGate feature="canAccessQrCustomization">
            <Section title="Logo dans le QR">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-app-text">Activer le logo</Label>
                  <Switch
                    checked={config.logo.enabled}
                    onCheckedChange={(checked) => updateLogo('enabled', checked)}
                  />
                </div>

                {config.logo.enabled && (
                  <div className="space-y-4 pl-1">
                    <p className="text-xs text-app-text-muted">
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

                    {/* File upload for custom logo */}
                    <div className="space-y-2">
                      <Label className="text-xs text-app-text-muted">Importer une image</Label>
                      {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => logoFileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        Choisir un fichier
                      </Button>

                      {/* Preview of uploaded/selected logo */}
                      {config.logo.src && (
                        <div className="relative rounded-xl border border-app-border p-2 bg-app-elevated">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={config.logo.src}
                              alt="Aperçu du logo"
                              className="h-10 w-10 rounded-lg object-contain bg-app-card border border-app-border"
                            />
                            <span className="text-xs text-app-text-muted break-all flex-1">
                              {config.logo.src.startsWith('data:')
                                ? 'Image importée'
                                : config.logo.src}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => updateLogo('src', '')}
                              className="p-1 h-auto w-auto text-app-text-muted hover:text-red-500 hover:bg-red-500/10"
                              title="Supprimer"
                              aria-label="Supprimer le logo"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-app-text-muted">Ou entrer une URL</Label>
                      <Input
                        value={config.logo.src.startsWith('data:') ? '' : config.logo.src}
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
                      <Label className="text-xs text-app-text-muted">
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
          <FeatureGate feature="canAccessQrCustomization">
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
          <FeatureGate feature="canAccessQrCustomization">
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
                  <Label className="text-xs text-app-text-muted">Ombre</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {SHADOW_OPTIONS.map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        variant={config.shadow === value ? 'default' : 'outline'}
                        onClick={() => updateField('shadow', value)}
                        className={`
                          px-2 py-1.5 rounded-lg text-xs font-medium h-auto
                          ${
                            config.shadow === value
                              ? 'border-accent bg-accent text-white'
                              : 'border-app-border bg-app-card text-app-text-secondary hover:border-app-text-muted'
                          }
                        `}
                      >
                        {label}
                      </Button>
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
                <Label className="text-xs text-app-text-muted">Texte pr\u00e9d\u00e9fini</Label>
                <Select
                  value={config.ctaPreset}
                  onValueChange={(val) => {
                    const preset = val as QRCTAPreset;
                    updateField('ctaPreset', preset);
                    if (preset !== 'custom') {
                      updateField('ctaText', CTA_PRESETS[preset]);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_PRESET_ENTRIES.map(([key, text]) => (
                      <SelectItem key={key} value={key}>
                        {text}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Personnalis\u00e9...</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <FeatureGate feature="canAccessQrCustomization">
                <div className="space-y-2">
                  <Label className="text-xs text-app-text-muted">Texte personnalis\u00e9</Label>
                  <Input
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
          <FeatureGate feature="canAccessQrCustomization">
            <Section title="Description">
              <div className="space-y-2">
                <Label className="text-xs text-app-text-muted">Description additionnelle</Label>
                <Textarea
                  value={config.descriptionText}
                  onChange={(e) => updateField('descriptionText', e.target.value)}
                  placeholder="Ajoutez une description..."
                  rows={3}
                  className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
                />
              </div>
            </Section>
          </FeatureGate>

          {/* Footer */}
          <FeatureGate feature="canAccessQrCustomization" planRequired="enterprise">
            <Section title="Pied de page">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-app-text-muted">Texte de pied de page</Label>
                  <Input
                    value={config.footerText}
                    onChange={(e) => updateField('footerText', e.target.value)}
                    placeholder="Ex: Wi-Fi: MonReseau / mdp123"
                    className="text-sm"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm text-app-text">
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
          <FeatureGate feature="canAccessQrCustomization" planRequired="enterprise">
            <div className="space-y-6">
              {/* Gradient */}
              <Section title="D\u00e9grad\u00e9">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-app-text">Activer le d\u00e9grad\u00e9</Label>
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
                    <Label className="text-sm text-app-text">Activer l&apos;image</Label>
                    <Switch
                      checked={config.backgroundImage.enabled}
                      onCheckedChange={(checked) => updateBackgroundImage('enabled', checked)}
                    />
                  </div>

                  {config.backgroundImage.enabled && (
                    <div className="space-y-4 pl-1">
                      <div className="space-y-1">
                        <Label className="text-xs text-app-text-muted">URL de l&apos;image</Label>
                        <Input
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
                  <Label className="text-xs text-app-text-muted">Police</Label>
                  <Select
                    value={config.fontFamily}
                    onValueChange={(val) => updateField('fontFamily', val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              {/* White-label */}
              <Section title="White-label">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-app-text">Masquer le branding Attabl</Label>
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
