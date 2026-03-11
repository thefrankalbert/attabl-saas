'use client';

import { Building2, UtensilsCrossed, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

const PHASES = [
  { icon: Building2, label: 'phaseIdentity', desc: 'phaseIdentityDesc' },
  { icon: UtensilsCrossed, label: 'phaseMenu', desc: 'phaseMenuDesc' },
  { icon: Rocket, label: 'phaseLaunch', desc: 'phaseLaunchDesc' },
] as const;

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 bg-app-bg">
      <div className="flex flex-col items-center text-center">
        {/* Brand mark */}
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-app-text-muted mb-10">
          ATTABL
        </p>

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl font-bold text-app-text mb-3">
          {t('welcomeTitle', { name: tenantName || '' })}
        </h1>
        <p className="text-base text-app-text-secondary mb-12">{t('studioSubtitle')}</p>

        {/* Phase indicators */}
        <div className="flex items-start gap-8 sm:gap-12 mb-12">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon;
            return (
              <div key={i} className="flex flex-col items-center gap-2.5 max-w-[100px]">
                <div className="w-11 h-11 rounded-xl bg-app-elevated flex items-center justify-center">
                  <Icon className="h-5 w-5 text-app-text-secondary" />
                </div>
                <p className="text-xs font-semibold text-app-text">{t(phase.label)}</p>
                <p className="text-[10px] text-app-text-muted leading-snug">{t(phase.desc)}</p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <Button
          variant="default"
          onClick={onStart}
          className="h-12 rounded-xl gap-2.5 text-sm font-bold px-10 shadow-lg shadow-accent/20 active:scale-[0.97] transition-all"
        >
          {t('welcomeCTA')}
          <ArrowRight className="h-4 w-4" />
        </Button>

        {/* Trial reminder */}
        <p className="text-[10px] text-app-text-muted mt-6">{t('trialReminder')}</p>
      </div>
    </div>
  );
}
