'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      {/* Warm ambient glow -- two overlapping radials for depth */}
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '900px',
          height: '600px',
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--app-accent) 6%, transparent) 0%, transparent 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: '600px',
          height: '300px',
          background:
            'radial-gradient(ellipse 70% 60% at 50% 100%, color-mix(in srgb, var(--app-accent) 4%, transparent) 0%, transparent 100%)',
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full">
        {/* Branded header pill */}
        <div className="inline-flex items-center gap-3 mb-10 opacity-0 animate-[fadeSlideIn_0.6s_0.1s_ease-out_forwards]">
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-border" />
          <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground">
            ATTABL
          </span>
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-border" />
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-[2.5rem] font-bold text-foreground mb-4 leading-[1.15] tracking-tight opacity-0 animate-[fadeSlideIn_0.7s_0.2s_ease-out_forwards]">
          {t('welcomeTitle', { name: tenantName || '' })}
        </h1>
        <p className="text-sm sm:text-[15px] text-muted-foreground mb-10 max-w-sm leading-relaxed opacity-0 animate-[fadeSlideIn_0.7s_0.35s_ease-out_forwards]">
          {t('studioSubtitle')}
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-5 opacity-0 animate-[fadeSlideIn_0.7s_0.5s_ease-out_forwards]">
          <Button
            variant="default"
            onClick={onStart}
            className="h-12 rounded-full gap-2.5 text-sm font-bold px-10 active:scale-[0.97] transition-transform"
          >
            {t('welcomeCTA')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Keyframe definition */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
