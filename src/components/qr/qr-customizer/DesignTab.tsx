'use client';

import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/qr/ColorPicker';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { SliderField } from './SliderField';
import { Section } from './Section';
import { SHADOW_OPTIONS } from './constants';

interface DesignTabProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
}

export function DesignTab({ config, updateField }: DesignTabProps) {
  return (
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
  );
}
