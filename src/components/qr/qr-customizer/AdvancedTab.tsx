'use client';

import { useCallback } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/qr/ColorPicker';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { FONT_OPTIONS } from '@/types/qr-design.types';
import { SliderField } from './SliderField';
import { Section } from './Section';

interface AdvancedTabProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
}

export function AdvancedTab({ config, updateField }: AdvancedTabProps) {
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

  return (
    <TabsContent value="advanced" className="space-y-6">
      <FeatureGate feature="canAccessQrCustomization" planRequired="enterprise">
        <div className="space-y-6">
          {/* Gradient */}
          <Section title="Dégradé">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-app-text">Activer le dégradé</Label>
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
                    label="Couleur de départ"
                  />
                  <ColorPicker
                    value={config.gradient.colorEnd}
                    onChange={(c) => updateGradient('colorEnd', c)}
                    label="Couleur d'arrivée"
                  />
                  <SliderField
                    label="Angle"
                    value={config.gradient.angle}
                    unit="°"
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
                    label="Opacité"
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
  );
}
