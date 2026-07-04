'use client';

import { useTranslations } from 'next-intl';

import './onboarding-brand.css';

import { BrandingStep } from '@/components/onboarding/BrandingStep';
import { EstablishmentStep } from '@/components/onboarding/EstablishmentStep';
import { LaunchStep } from '@/components/onboarding/LaunchStep';
import { MenuStep } from '@/components/onboarding/MenuStep';
import { OnboardingBottomNav } from '@/components/onboarding/OnboardingBottomNav';
import { OnboardingLoadingSkeleton } from '@/components/onboarding/OnboardingLoadingSkeleton';
import { OnboardingTopNav } from '@/components/onboarding/OnboardingTopNav';
import { PhonePreview } from '@/components/onboarding/PhonePreview';
import { StepErrorBoundary } from '@/components/onboarding/StepErrorBoundary';
import { TablesStep } from '@/components/onboarding/TablesStep';
import { useOnboarding } from '@/components/onboarding/use-onboarding';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type { OnboardingData } from '@/components/onboarding/types';

// --- Component -----------------------------------------------------------------

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');

  const {
    phase,
    subScreen,
    loading,
    saving,
    error,
    setError,
    direction,
    autoSaveStatus,
    data,
    updateData,
    phases,
    screenKey,
    isLastScreen,
    canGoBack,
    touchStartXRef,
    phaseIsComplete,
    goNext,
    goPrev,
    goToPhase,
    completeOnboarding,
    startStudio,
  } = useOnboarding();

  // --- Content rendering ----------------------------------------------------

  const renderScreen = () => {
    if (!screenKey) return null;
    switch (screenKey) {
      case 'establishment':
        return <EstablishmentStep data={data} updateData={updateData} />;
      case 'branding':
        return <BrandingStep data={data} updateData={updateData} />;
      case 'details':
        return <EstablishmentStep data={data} updateData={updateData} variant="details" />;
      case 'tables':
        return <TablesStep data={data} updateData={updateData} />;
      case 'menu':
        return <MenuStep data={data} updateData={updateData} />;
      case 'qr':
        return <LaunchStep data={data} updateData={updateData} variant="qr" />;
      case 'summary':
        return <LaunchStep data={data} updateData={updateData} variant="summary" />;
    }
  };

  // --- Loading skeleton -----------------------------------------------------

  if (loading) {
    return <OnboardingLoadingSkeleton />;
  }

  // --- Welcome screen (phase 0) ---------------------------------------------

  if (phase === 0) {
    return (
      /* Standalone page - h-dvh is intentional */
      <div className="onboarding-brand h-dvh overflow-hidden flex flex-col bg-app-bg relative">
        <WelcomeStep tenantName={data.tenantName} onStart={startStudio} />
      </div>
    );
  }

  // --- Studio layout (phases 1-3) -------------------------------------------

  return (
    /* Standalone page - h-dvh is intentional */
    <div className="onboarding-brand h-dvh overflow-hidden flex flex-col bg-app-bg">
      <OnboardingTopNav
        phases={phases}
        phase={phase}
        tenantName={data.tenantName}
        autoSaveStatus={autoSaveStatus}
        t={t}
        phaseIsComplete={phaseIsComplete}
        goToPhase={goToPhase}
      />

      {/* --- Content area: config panel + phone preview --- */}
      <div className="flex-1 min-h-0 flex">
        {/* Config panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <main
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
            data-onboarding-scroll
            onTouchStart={(e) => {
              touchStartXRef.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const diff = touchStartXRef.current - e.changedTouches[0].clientX;
              if (Math.abs(diff) > 80) {
                if (diff > 0 && !isLastScreen) goNext();
                if (diff < 0 && canGoBack) goPrev();
              }
            }}
          >
            {/* Animated content */}
            <div
              key={`${phase}-${subScreen}`}
              className={
                direction === 'forward'
                  ? 'animate-in slide-in-from-right-4 fade-in duration-200'
                  : 'animate-in slide-in-from-left-4 fade-in duration-200'
              }
            >
              <StepErrorBoundary
                key={`eb-${phase}-${subScreen}`}
                fallback={
                  <div className="p-8 text-center">
                    <p className="text-status-error">{t('stepError')}</p>
                  </div>
                }
              >
                {renderScreen()}
              </StepErrorBoundary>

              {error && (
                <div className="px-4 sm:px-6 lg:px-8 pb-2">
                  <Alert variant="destructive">
                    <AlertDescription className="flex items-center justify-between">
                      <span>{error}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={tc('aria.close')}
                        onClick={() => setError(null)}
                        className="text-destructive/60 hover:text-destructive ml-3 shrink-0 h-8 w-8"
                      >
                        <span className="sr-only">Close</span>
                        &times;
                      </Button>
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Bottom spacer so content doesn't hide behind fixed nav */}
              <div className="h-20" />
            </div>
          </main>

          <OnboardingBottomNav
            canGoBack={canGoBack}
            isLastScreen={isLastScreen}
            saving={saving}
            screenKey={screenKey}
            tenantName={data.tenantName}
            t={t}
            goPrev={goPrev}
            goNext={goNext}
            completeOnboarding={completeOnboarding}
          />
        </div>

        {/* Phone preview - desktop only */}
        <div className="hidden lg:flex w-80 items-center justify-center border-l border-app-border bg-app-elevated shrink-0">
          <PhonePreview data={data} phase={phase} />
        </div>
      </div>
    </div>
  );
}
