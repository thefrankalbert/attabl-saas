'use client';

import { TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
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
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig, QRCTAPreset } from '@/types/qr-design.types';
import { CTA_PRESETS } from '@/types/qr-design.types';
import { Section } from './Section';
import { CTA_PRESET_ENTRIES } from './constants';

interface TextTabProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
}

export function TextTab({ config, updateField }: TextTabProps) {
  return (
    <TabsContent value="text" className="space-y-6">
      {/* CTA presets */}
      <Section title="Appel à l'action">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-app-text-muted">Texte prédéfini</Label>
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
                <SelectItem value="custom">Personnalisé...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <FeatureGate feature="canAccessQrCustomization">
            <div className="space-y-2">
              <Label className="text-xs text-app-text-muted">Texte personnalisé</Label>
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
  );
}
