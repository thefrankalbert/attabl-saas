'use client';

import { Building2, LayoutGrid, Palette, UtensilsCrossed, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

const STEPS = [
  { icon: Building2, key: 'stepEstablishment' },
  { icon: LayoutGrid, key: 'stepTables' },
  { icon: Palette, key: 'stepBranding' },
  { icon: UtensilsCrossed, key: 'stepMenu' },
  { icon: Rocket, key: 'stepLaunch' },
] as const;

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="bg-[#CCFF00] rounded-2xl p-4 mb-6">
        <Rocket className="h-8 w-8 text-black" />
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 mb-2">
        {t('welcomeTitle', { name: tenantName || '' })}
      </h1>
      <p className="text-neutral-500 text-sm mb-8 max-w-sm">{t('welcomeSubtitle')}</p>

      {/* Step overview */}
      <div className="flex items-center gap-3 mb-8">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-neutral-500" />
                </div>
                <span className="text-[10px] text-neutral-400 font-medium">{t(step.key)}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-neutral-200 mb-5" />}
            </div>
          );
        })}
      </div>

      <Button variant="lime" onClick={onStart}>
        {t('welcomeCTA')}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
