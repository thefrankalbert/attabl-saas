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
        <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('qrCtaLabel')}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CTA_PRESETS.map((preset) => {
            const isActive = data.qrCta === preset.value;
            return (
              <Button
                key={preset.key}
                type="button"
                variant="ghost"
                onClick={() => updateData({ qrCta: preset.value })}
                className={`h-auto rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-app-hover text-app-text shadow-sm ring-1 ring-accent hover:bg-app-hover'
                    : 'border border-app-border bg-app-elevated text-app-text-secondary hover:bg-app-hover'
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
          className="h-10 w-full rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
          maxLength={60}
        />
      </div>

      {/* Description */}
      <div>
        <p className="mb-2 block text-xs font-medium text-app-text-secondary">
          {t('qrDescriptionLabel')}
        </p>
        <Textarea
          value={data.qrDescription}
          onChange={(e) => updateData({ qrDescription: e.target.value })}
          placeholder={t('qrDescriptionLabel')}
          rows={2}
          maxLength={120}
          className="w-full resize-none rounded-lg border-app-border bg-app-elevated px-3.5 py-2.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
        />
      </div>
    </div>
  );
}
