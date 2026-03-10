'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import {
  Building2,
  LayoutGrid,
  Palette,
  UtensilsCrossed,
  Rocket,
  Check,
  ArrowRight,
  ArrowLeft,
  Layout,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EstablishmentStep } from '@/components/onboarding/EstablishmentStep';
import { TablesStep } from '@/components/onboarding/TablesStep';
import { BrandingStep } from '@/components/onboarding/BrandingStep';
import { MenuStep } from '@/components/onboarding/MenuStep';
import { LaunchStep } from '@/components/onboarding/LaunchStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const STEP_ICONS = [Building2, LayoutGrid, Palette, UtensilsCrossed, Rocket] as const;

const STEP_KEYS = [
  { name: 'stepEstablishment', desc: 'stepEstablishmentDesc' },
  { name: 'stepTables', desc: 'stepTablesDesc' },
  { name: 'stepBranding', desc: 'stepBrandingDesc' },
  { name: 'stepMenu', desc: 'stepMenuDesc' },
  { name: 'stepLaunch', desc: 'stepLaunchDesc' },
] as const;

export interface OnboardingData {
  // Step 1: Establishment
  establishmentType: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  tableCount: number;
  language: string;
  currency: string;
  // Step 1: Type-specific fields
  starRating?: number;
  hasRestaurant?: boolean;
  hasTerrace?: boolean;
  hasWifi?: boolean;
  registerCount?: number;
  hasDelivery?: boolean;
  totalCapacity?: number;
  // Step 2: Tables
  tableConfigMode: 'complete' | 'minimum' | 'skip';
  tableZones: Array<{ name: string; prefix: string; tableCount: number; defaultCapacity?: number }>;
  // Step 3: Branding
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  // Step 4: Menu
  menuOption: 'manual' | 'import' | 'template' | 'skip';
  menuItems: Array<{ name: string; price: number; category: string; imageUrl?: string }>;
  // Step 5: QR customization
  qrTemplate: 'standard' | 'chevalet' | 'carte' | 'minimal' | 'elegant' | 'neon';
  qrStyle: 'classic' | 'branded' | 'inverted' | 'dark';
  qrCta: string;
  qrDescription: string;
  // Tenant info
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const touchStartX = useRef(0);
  const [data, setData] = useState<OnboardingData>({
    establishmentType: 'restaurant',
    address: '',
    city: '',
    country: 'Cameroun',
    phone: '',
    tableCount: 10,
    language: 'fr-FR',
    currency: 'EUR',
    starRating: undefined,
    hasRestaurant: undefined,
    hasTerrace: undefined,
    hasWifi: undefined,
    registerCount: undefined,
    hasDelivery: undefined,
    totalCapacity: undefined,
    tableConfigMode: 'skip',
    tableZones: [],
    logoUrl: '',
    primaryColor: '#4d7c0f',
    secondaryColor: '#000000',
    description: '',
    menuOption: 'skip',
    menuItems: [],
    qrTemplate: 'standard',
    qrStyle: 'branded',
    qrCta: 'Scannez pour commander',
    qrDescription: '',
    tenantId: '',
    tenantSlug: '',
    tenantName: '',
  });

  useEffect(() => {
    const fetchOnboardingState = async () => {
      try {
        const res = await fetch('/api/onboarding/state');
        if (res.ok) {
          const state = await res.json();
          setData((prev) => ({
            ...prev,
            tenantId: state.tenantId,
            tenantSlug: state.tenantSlug,
            tenantName: state.tenantName,
            ...state.data,
          }));
          setCurrentStep(state.step || 0);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({ title: t('saveError'), description: message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchOnboardingState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save debounced
  useEffect(() => {
    if (loading || currentStep === 0 || currentStep === 5) return;
    setAutoSaveStatus('idle');
    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      try {
        const res = await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: currentStep, data }),
        });
        if (res.ok) {
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        }
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [data, currentStep, loading]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' && currentStep > 0 && currentStep < 5) {
        setError(null);
        setDirection('forward');
        setCurrentStep((prev) => prev + 1);
      }
      if (e.key === 'ArrowLeft' && currentStep > 1) {
        setError(null);
        setDirection('backward');
        setCurrentStep((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  const updateData = useCallback((newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  const saveStep = async () => {
    try {
      const res = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: currentStep, data }),
      });
      if (!res.ok) {
        toast({ title: t('saveError'), variant: 'destructive' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: t('saveError'), description: message, variant: 'destructive' });
    }
  };

  const scrollToTop = () => {
    document.querySelector('[data-onboarding-scroll]')?.scrollTo({ top: 0, behavior: 'instant' });
  };

  const nextStep = () => {
    setError(null);
    setDirection('forward');
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
      scrollToTop();
    }
    // Save in background (non-blocking)
    if (currentStep > 0) {
      saveStep();
    }
  };

  const prevStep = () => {
    setError(null);
    setDirection('backward');
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      scrollToTop();
    }
  };

  // Task 8: Visual validation indicators
  const stepIsComplete = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!data.tenantName && !!data.establishmentType;
      case 2:
        return true; // tables are optional
      case 3:
        return !!data.primaryColor;
      case 4:
        return true; // menu is optional
      case 5:
        return true;
      default:
        return false;
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.details && Array.isArray(errData.details)) {
          throw new Error(`${t('validationFailed')}: ${errData.details.join(', ')}`);
        }
        throw new Error(errData.error || t('completeError'));
      }

      const origin = window.location.origin;
      window.location.href = `${origin}/sites/${data.tenantSlug}/admin`;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('completeError');
      setError(message);
      toast({ title: t('completeError'), description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-dvh bg-app-bg flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 bg-accent rounded-xl" />
          <p className="text-app-text-secondary">...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-app-bg flex overflow-hidden">
      {/* Sidebar — Desktop (lg+): w-72, icons + titles + descriptions */}
      {/* Sidebar — Tablet (md): w-56, icons + titles only */}
      {currentStep > 0 && (
        <aside className="hidden md:flex md:w-56 lg:w-72 shrink-0 flex-col bg-app-elevated border-r border-app-border">
          {/* Logo */}
          <div className="p-6 lg:p-8">
            <Link href="/" className="flex items-center gap-3">
              <div className="bg-accent rounded-xl p-2">
                <Layout className="h-5 w-5 text-accent-text" />
              </div>
              <span className="text-xl font-bold text-app-text">ATTABL</span>
            </Link>
          </div>

          {/* Steps */}
          <nav className="flex-1 px-4 lg:px-6">
            <div className="space-y-1">
              {STEP_KEYS.map((stepKey, index) => {
                const stepId = index + 1;
                const isCompleted = currentStep > stepId;
                const isCurrent = currentStep === stepId;
                const Icon = STEP_ICONS[index];

                return (
                  <div key={stepId} className="relative">
                    {/* Connecting line */}
                    {index < STEP_KEYS.length - 1 && (
                      <div
                        className={`absolute left-[26px] top-[42px] h-[24px] w-[2px] -translate-x-1/2 ${
                          isCompleted ? 'bg-accent' : 'bg-app-elevated'
                        }`}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (isCompleted) {
                          setError(null);
                          setDirection('backward');
                          setCurrentStep(stepId);
                        }
                      }}
                      className={`relative z-10 w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
                        isCurrent
                          ? 'bg-app-card border border-app-border'
                          : isCompleted
                            ? 'hover:bg-app-card/60 cursor-pointer'
                            : 'opacity-50 cursor-default'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCompleted
                            ? 'bg-accent text-accent-text'
                            : isCurrent
                              ? 'bg-accent text-accent-text'
                              : 'bg-app-elevated text-app-text-muted'
                        }`}
                      >
                        {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${
                            isCurrent ? 'text-app-text' : 'text-app-text-secondary'
                          }`}
                        >
                          {t(stepKey.name)}
                        </p>
                        {/* Description: visible on lg+ only */}
                        <p className="hidden lg:block text-xs text-app-text-muted truncate">
                          {t(stepKey.desc)}
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 lg:p-6 border-t border-app-border">
            {data.tenantName && (
              <p className="text-sm font-medium text-app-text truncate">{data.tenantName}</p>
            )}
            <p className="text-xs text-app-text-muted">{t('trialReminder')}</p>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header — only below md (sidebar takes over at md+) */}
        {currentStep > 0 && (
          <div className="md:hidden shrink-0">
            {/* Logo row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
              <Link href="/" className="flex items-center gap-2">
                <div className="bg-accent rounded-lg p-1.5">
                  <Layout className="h-4 w-4 text-accent-text" />
                </div>
                <span className="font-bold text-app-text">ATTABL</span>
              </Link>
              <span className="text-xs text-app-text-muted uppercase tracking-wide font-medium">
                {t('step')} {currentStep} {t('stepOf')} 5
              </span>
            </div>

            {/* Horizontal step circles */}
            <div className="flex items-center justify-center gap-0 py-3 px-2 sm:px-4">
              {STEP_ICONS.map((Icon, index) => {
                const stepId = index + 1;
                const isCompleted = currentStep > stepId;
                const isCurrent = currentStep === stepId;

                return (
                  <div key={stepId} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCompleted) {
                          setError(null);
                          setDirection('backward');
                          setCurrentStep(stepId);
                        }
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isCompleted
                          ? 'bg-accent text-accent-text cursor-pointer'
                          : isCurrent
                            ? 'bg-accent text-accent-text'
                            : 'bg-app-elevated text-app-text-muted'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {/* Connecting line */}
                    {index < STEP_ICONS.length - 1 && (
                      <div
                        className={`w-4 sm:w-10 h-0.5 ${
                          currentStep > stepId ? 'bg-accent' : 'bg-app-elevated'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step Content */}
        <div
          id="onboarding-content"
          className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5 md:p-6 lg:p-8"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const diff = touchStartX.current - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 80) {
              if (diff > 0 && currentStep > 0 && currentStep < 5) nextStep();
              if (diff < 0 && currentStep > 1) prevStep();
            }
          }}
        >
          <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 min-h-0">
            <div
              key={currentStep}
              className={`flex-1 min-h-0 flex flex-col ${
                currentStep > 0
                  ? direction === 'forward'
                    ? 'animate-in slide-in-from-right-4 fade-in duration-200'
                    : 'animate-in slide-in-from-left-4 fade-in duration-200'
                  : ''
              }`}
            >
              {currentStep === 0 && (
                <WelcomeStep
                  tenantName={data.tenantName}
                  onStart={() => {
                    setDirection('forward');
                    setCurrentStep(1);
                  }}
                />
              )}
              {currentStep === 1 && <EstablishmentStep data={data} updateData={updateData} />}
              {currentStep === 2 && <TablesStep data={data} updateData={updateData} />}
              {currentStep === 3 && <BrandingStep data={data} updateData={updateData} />}
              {currentStep === 4 && <MenuStep data={data} updateData={updateData} />}
              {currentStep === 5 && <LaunchStep data={data} updateData={updateData} />}
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 md:mx-6 lg:mx-12 mb-2 shrink-0">
            <div className="w-full max-w-5xl mx-auto p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-500/60 hover:text-red-500 ml-3 shrink-0"
              >
                <span className="sr-only">Close</span>
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation — hidden on step 0 (welcome screen) */}
        {currentStep > 0 && (
          <div className="border-t border-app-border p-4 md:p-6 shrink-0 pb-[env(safe-area-inset-bottom)]">
            <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
              {/* Back button or auto-save status on step 1 */}
              {currentStep === 1 ? (
                <span className="text-xs text-app-text-muted min-w-[80px]">
                  {autoSaveStatus === 'saving' && t('autoSaving')}
                  {autoSaveStatus === 'saved' && `✓ ${t('autoSaved')}`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('back')}</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                {/* Skip button — skips entire step (not on step 5) */}
                {currentStep < 5 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (currentStep < 5) {
                        setDirection('forward');
                        setCurrentStep((prev) => prev + 1);
                      }
                    }}
                    disabled={saving}
                    className="text-app-text-muted hover:text-app-text-secondary"
                  >
                    {t('skip')}
                  </Button>
                )}

                {/* Continue / Launch — with validation opacity (Task 8) */}
                {currentStep < 5 ? (
                  <Button
                    variant="default"
                    onClick={nextStep}
                    disabled={saving}
                    className={!stepIsComplete(currentStep) ? 'opacity-60' : ''}
                  >
                    {saving ? '...' : t('next')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="default" onClick={completeOnboarding} disabled={saving}>
                    {saving ? '...' : t('launchCTA')}
                    <Rocket className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
