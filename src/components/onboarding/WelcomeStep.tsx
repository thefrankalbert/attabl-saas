'use client';

import { Building2, UtensilsCrossed, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

const PHASES = [
  { icon: Building2, label: 'phaseIdentity', desc: 'phaseIdentityDesc', num: '01' },
  { icon: UtensilsCrossed, label: 'phaseMenu', desc: 'phaseMenuDesc', num: '02' },
  { icon: Rocket, label: 'phaseLaunch', desc: 'phaseLaunchDesc', num: '03' },
] as const;

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 bg-app-bg relative overflow-hidden">
      {/* Subtle radial glow behind content */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
        style={{
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, var(--app-accent) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Brand mark with decorative lines */}
        <div className="flex items-center gap-4 mb-12">
          <div className="h-px w-8 bg-app-border" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-app-text-muted">
            ATTABL
          </p>
          <div className="h-px w-8 bg-app-border" />
        </div>

        {/* Headline — large, warm, commanding */}
        <h1 className="text-3xl sm:text-4xl font-bold text-app-text mb-3 leading-tight tracking-tight">
          {t('welcomeTitle', { name: tenantName || '' })}
        </h1>
        <p className="text-sm sm:text-base text-app-text-secondary mb-14 max-w-sm leading-relaxed">
          {t('studioSubtitle')}
        </p>

        {/* Phase journey — horizontal with connecting line */}
        <div className="w-full max-w-md mb-14">
          <div className="relative flex items-start justify-between">
            {/* Connecting line behind the icons */}
            <div className="absolute top-5 left-[calc(16.67%)] right-[calc(16.67%)] h-px bg-app-border" />

            {PHASES.map((phase, i) => {
              const Icon = phase.icon;
              return (
                <div
                  key={i}
                  className="relative flex flex-col items-center gap-3 w-1/3 animate-in fade-in slide-in-from-bottom-2 duration-500"
                  style={{ animationDelay: `${200 + i * 150}ms`, animationFillMode: 'both' }}
                >
                  {/* Numbered icon container */}
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center">
                      <Icon className="h-4 w-4 text-accent" />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-app-elevated border border-app-border flex items-center justify-center text-[9px] font-bold text-app-text-muted">
                      {phase.num}
                    </span>
                  </div>

                  {/* Labels */}
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-xs font-semibold text-app-text">{t(phase.label)}</p>
                    <p className="text-[10px] text-app-text-muted leading-snug max-w-[120px]">
                      {t(phase.desc)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA — premium feel */}
        <div
          className="flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: '650ms', animationFillMode: 'both' }}
        >
          <Button
            variant="default"
            onClick={onStart}
            className="h-12 rounded-full gap-2.5 text-sm font-bold px-10 active:scale-[0.97] transition-all"
          >
            {t('welcomeCTA')}
            <ArrowRight className="h-4 w-4" />
          </Button>

          {/* Trial pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-app-border bg-app-card/50">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <p className="text-[10px] font-medium text-app-text-muted">{t('trialReminder')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
