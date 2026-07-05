'use client';

import { useCallback, useRef } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/qr/ColorPicker';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { SliderField } from './SliderField';
import { Section } from './Section';
import { ERROR_CORRECTION_LEVELS } from './constants';

interface QrCodeTabProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  tenantLogoUrl?: string;
}

export function QrCodeTab({ config, updateField, tenantLogoUrl }: QrCodeTabProps) {
  // --- Logo nested field helper -----------------------
  const updateLogo = useCallback(
    <K extends keyof QRDesignConfig['logo']>(key: K, value: QRDesignConfig['logo'][K]) => {
      updateField('logo', { ...config.logo, [key]: value });
    },
    [config.logo, updateField],
  );

  // --- Logo file upload --------------------------------
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

  return (
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
                {' - '}
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
                          {config.logo.src.startsWith('data:') ? 'Image importée' : config.logo.src}
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
                  <Label className="text-xs text-app-text-muted">Découper le QR sous le logo</Label>
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
  );
}
