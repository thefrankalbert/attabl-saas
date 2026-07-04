'use client';

import { ArrowRight, ArrowLeft, Loader2, Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { ScreenKey } from './onboarding-steps';

interface OnboardingBottomNavProps {
  canGoBack: boolean;
  isLastScreen: boolean;
  saving: boolean;
  screenKey: ScreenKey | null;
  tenantName: string;
  t: (key: string) => string;
  goPrev: () => void;
  goNext: () => void;
  completeOnboarding: () => void;
}

export function OnboardingBottomNav({
  canGoBack,
  isLastScreen,
  saving,
  screenKey,
  tenantName,
  t,
  goPrev,
  goNext,
  completeOnboarding,
}: OnboardingBottomNavProps) {
  return (
    /* --- Fixed bottom navigation bar --- */
    <div className="shrink-0 border-t border-app-border/50 bg-app-card/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between">
        {/* Back button */}
        {canGoBack ? (
          <Button
            type="button"
            variant="ghost"
            onClick={goPrev}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-app-text-secondary hover:text-app-text hover:bg-app-hover transition-colors h-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('back')}</span>
          </Button>
        ) : (
          <span />
        )}

        {/* Continue / Launch button */}
        {isLastScreen ? (
          <Button
            variant="default"
            onClick={completeOnboarding}
            disabled={saving}
            className="h-11 rounded-xl gap-2 text-sm font-bold px-6"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t('launchCTA')}
                <Rocket className="h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <Button
            variant="default"
            onClick={goNext}
            disabled={saving || (screenKey === 'establishment' && !tenantName.trim())}
            className="h-11 rounded-xl gap-2 text-sm font-bold px-6"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t('next')}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
