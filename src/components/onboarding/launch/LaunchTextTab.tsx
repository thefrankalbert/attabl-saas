'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { OnboardingData } from '@/app/onboarding/page';

const CTA_PRESETS = [
  { key: 'qrCtaScan', value: 'Scannez pour commander' },
  { key: 'qrCtaMenu', value: 'Scannez pour voir le menu' },
  { key: 'qrCtaDiscover', value: 'Scannez pour découvrir' },
  { key: 'qrCtaCard', value: 'Scannez notre carte' },
];

interface LaunchTextTabProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function LaunchTextTab({ data, updateData }: LaunchTextTabProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="space-y-6">
      {/* CTA Presets */}
      <div>
        <p className="text-xs font-semibold text-app-text-secondary mb-3">{t('qrCtaLabel')}</p>
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
          className="w-full px-4 py-2.5 text-sm border border-app-border rounded-xl bg-app-elevated text-app-text focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
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
          className="w-full px-4 py-2.5 text-sm border border-app-border rounded-xl bg-app-elevated text-app-text resize-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
        />
      </div>
    </div>
  );
}
