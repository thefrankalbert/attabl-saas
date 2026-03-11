'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import {
  Palette,
  UtensilsCrossed,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EstablishmentStep } from '@/components/onboarding/EstablishmentStep';
import { TablesStep } from '@/components/onboarding/TablesStep';
import { BrandingStep } from '@/components/onboarding/BrandingStep';
import { MenuStep } from '@/components/onboarding/MenuStep';
import { LaunchStep } from '@/components/onboarding/LaunchStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { PhonePreview } from '@/components/onboarding/PhonePreview';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

// ─── Phase / sub-screen definitions ────────────────────────────────────────────

type ScreenKey = 'establishment' | 'branding' | 'details' | 'tables' | 'menu' | 'qr' | 'summary';

interface PhaseDefinition {
  labelKey: string;
  icon: typeof Palette;
  subScreens: ScreenKey[];
}

const PHASES: PhaseDefinition[] = [
  {
    labelKey: 'phaseIdentity',
    icon: Palette,
    subScreens: ['establishment', 'branding', 'details'],
  },
  { labelKey: 'phaseMenu', icon: UtensilsCrossed, subScreens: ['tables', 'menu'] },
  { labelKey: 'phaseLaunch', icon: Rocket, subScreens: ['qr', 'summary'] },
];

/** Map screen key → old API step number for saving */
const SCREEN_TO_API_STEP: Record<ScreenKey, number> = {
  establishment: 1,
  branding: 3,
  details: 1,
  tables: 2,
  menu: 4,
  qr: 5,
  summary: 5,
};

/** Convert old saved step → new phase/subScreen */
function oldStepToPhaseScreen(oldStep: number): { phase: number; subScreen: number } {
  switch (oldStep) {
    case 1:
      return { phase: 1, subScreen: 0 };
    case 2:
      return { phase: 2, subScreen: 0 };
    case 3:
      return { phase: 1, subScreen: 1 };
    case 4:
      return { phase: 2, subScreen: 1 };
    case 5:
      return { phase: 3, subScreen: 0 };
    default:
      return { phase: 0, subScreen: 0 };
  }
}

// ─── Exported data interface (used by child components) ────────────────────────

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

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const { toast } = useToast();

  // Navigation state: phase 0 = welcome, 1–3 = studio phases
  const [phase, setPhase] = useState(0);
  const [subScreen, setSubScreen] = useState(0);
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

  // ─── Derived values ────────────────────────────────────────────────────────

  const currentPhase = phase >= 1 && phase <= 3 ? PHASES[phase - 1] : null;
  const screenKey: ScreenKey | null = currentPhase
    ? (currentPhase.subScreens[subScreen] ?? null)
    : null;
  const apiStep = screenKey ? SCREEN_TO_API_STEP[screenKey] : 0;

  const isLastScreen = phase === 3 && subScreen === PHASES[2].subScreens.length - 1;

  // ─── Step completeness check (adapted for phases) ──────────────────────────

  const phaseIsComplete = (p: number): boolean => {
    switch (p) {
      case 1:
        return !!data.tenantName && !!data.establishmentType && !!data.primaryColor;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  // ─── Fetch saved state ─────────────────────────────────────────────────────

  useEffect(() => {
    const fetchOnboardingState = async () => {
      try {
        const res = await fetch('/api/onboarding/state');
        if (res.ok) {
          const state = await res.json();
          const restoredData = state.data || {};

          // Extract navigation position metadata from the draft (if saved)
          const savedPhase =
            typeof restoredData._phase === 'number' ? restoredData._phase : undefined;
          const savedSubScreen =
            typeof restoredData._subScreen === 'number' ? restoredData._subScreen : undefined;

          // Clean metadata keys before setting data state
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _phase: _p, _subScreen: _s, ...cleanData } = restoredData;

          setData((prev) => ({
            ...prev,
            tenantId: state.tenantId,
            tenantSlug: state.tenantSlug,
            tenantName: state.tenantName,
            ...cleanData,
          }));

          // Restore exact position from draft metadata, or fall back to step-based mapping
          if (savedPhase !== undefined && savedSubScreen !== undefined) {
            setPhase(savedPhase);
            setSubScreen(savedSubScreen);
          } else {
            const { phase: restoredPhase, subScreen: restoredSub } = oldStepToPhaseScreen(
              state.step || 0,
            );
            setPhase(restoredPhase);
            setSubScreen(restoredSub);
          }
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

  // ─── Auto-save debounced ───────────────────────────────────────────────────

  useEffect(() => {
    if (loading || phase === 0 || isLastScreen) return;
    setAutoSaveStatus('idle');
    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      try {
        // Send full data with navigation position metadata for exact restoration
        const draftPayload = {
          ...data,
          _phase: phase,
          _subScreen: subScreen,
        };
        const res = await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: apiStep, data: draftPayload }),
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
  }, [data, phase, subScreen, loading, apiStep, isLastScreen]);

  // ─── Save on tab close / navigate away (beacon API for reliability) ──────

  useEffect(() => {
    if (loading || phase === 0) return;
    const handleBeforeUnload = () => {
      const draftPayload = {
        ...data,
        _phase: phase,
        _subScreen: subScreen,
      };
      const blob = new Blob([JSON.stringify({ step: apiStep, data: draftPayload })], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/onboarding/save', blob);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [data, phase, subScreen, loading, apiStep]);

  // ─── Keyboard navigation ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' && phase >= 1 && !isLastScreen) {
        goNext();
      }
      if (e.key === 'ArrowLeft' && (phase > 1 || (phase === 1 && subScreen > 0))) {
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, subScreen]);

  // ─── Data update callback ─────────────────────────────────────────────────

  const updateData = useCallback((newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  // ─── Save current step ────────────────────────────────────────────────────

  const saveStep = async () => {
    try {
      const draftPayload = {
        ...data,
        _phase: phase,
        _subScreen: subScreen,
      };
      const res = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: apiStep, data: draftPayload }),
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

  // ─── Navigation ───────────────────────────────────────────────────────────

  const goNext = () => {
    setError(null);
    setDirection('forward');

    if (phase >= 1) saveStep();

    if (currentPhase && subScreen < currentPhase.subScreens.length - 1) {
      setSubScreen((s) => s + 1);
    } else if (phase < 3) {
      setPhase((p) => p + 1);
      setSubScreen(0);
    }
    scrollToTop();
  };

  const goPrev = () => {
    setError(null);
    setDirection('backward');

    if (subScreen > 0) {
      setSubScreen((s) => s - 1);
    } else if (phase > 1) {
      const prevPhase = PHASES[phase - 2];
      setPhase((p) => p - 1);
      setSubScreen(prevPhase.subScreens.length - 1);
    }
    scrollToTop();
  };

  const goToPhase = (targetPhase: number) => {
    if (targetPhase >= phase) return; // only allow going to completed phases
    setError(null);
    setDirection('backward');
    setPhase(targetPhase);
    setSubScreen(0);
    scrollToTop();
  };

  // ─── Complete onboarding ──────────────────────────────────────────────────

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

  // ─── Content rendering ────────────────────────────────────────────────────

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

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col bg-app-bg">
        {/* Top strip skeleton */}
        <header className="shrink-0 h-14 bg-app-card/80 border-b border-app-border/50 flex items-center px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-app-elevated animate-pulse" />
            <div className="h-4 w-24 rounded bg-app-elevated animate-pulse" />
          </div>
          <div className="flex-1 flex justify-center gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 rounded-full bg-app-elevated animate-pulse"
                style={{ width: `${80 + i * 10}px` }}
              />
            ))}
          </div>
          <div className="h-4 w-12 rounded bg-app-elevated animate-pulse" />
        </header>

        {/* Two-column skeleton */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 p-6 space-y-6 animate-pulse">
            <div className="h-7 w-64 rounded-lg bg-app-elevated/30" />
            <div className="h-4 w-96 rounded bg-app-elevated/20" />
            <div className="space-y-4">
              <div className="h-48 rounded-xl bg-app-elevated/20" />
              <div className="h-32 rounded-xl bg-app-elevated/20" />
            </div>
          </div>
          <div className="hidden lg:flex w-[320px] items-center justify-center p-6">
            <div className="w-[220px] h-[440px] rounded-[2.5rem] bg-app-elevated/20 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Welcome screen (phase 0) ─────────────────────────────────────────────

  if (phase === 0) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col bg-app-bg relative">
        <WelcomeStep
          tenantName={data.tenantName}
          onStart={() => {
            setDirection('forward');
            setPhase(1);
            setSubScreen(0);
          }}
        />
      </div>
    );
  }

  // ─── Studio layout (phases 1–3) ───────────────────────────────────────────

  const canGoBack = phase > 1 || subScreen > 0;

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-app-bg">
      {/* ═══ Floating top navigation strip ═══ */}
      <header className="shrink-0 h-14 bg-app-card/80 backdrop-blur-xl border-b border-app-border/50 flex items-center px-4 sm:px-6 z-10">
        {/* Left: logo link + tenant name */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <Link
            href="/"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-app-hover transition-colors shrink-0"
            title="Accueil"
          >
            <LayoutGrid className="w-4 h-4 text-app-text-muted" />
          </Link>
          <span className="text-sm font-semibold text-app-text truncate max-w-[120px] hidden sm:inline">
            {data.tenantName || 'ATTABL'}
          </span>
        </div>

        {/* Center: 3 phase tabs */}
        <div className="flex-1 flex justify-center gap-1">
          {PHASES.map((phaseDef, idx) => {
            const phaseNum = idx + 1;
            const isActive = phase === phaseNum;
            const isCompleted = phase > phaseNum;
            const isFuture = phase < phaseNum;
            const Icon = phaseDef.icon;

            return (
              <button
                key={phaseNum}
                type="button"
                onClick={() => {
                  if (isCompleted && phaseIsComplete(phaseNum)) goToPhase(phaseNum);
                }}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-accent'
                    : isCompleted
                      ? 'text-app-text-secondary hover:bg-app-hover cursor-pointer'
                      : 'text-app-text-muted opacity-40 cursor-default'
                }`}
                disabled={isFuture}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{t(phaseDef.labelKey)}</span>

                {/* Bottom accent line for active tab — single clean line */}
                {isActive && (
                  <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: auto-save status + theme toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {autoSaveStatus === 'saving' && (
            <span className="text-[10px] text-app-text-muted flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">{t('autoSaving')}</span>
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="text-[10px] text-accent flex items-center gap-1">
              <Check className="w-3 h-3" />
              <span className="hidden sm:inline">{t('autoSaved')}</span>
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* ═══ Content area: config panel + phone preview ═══ */}
      <div className="flex-1 min-h-0 flex">
        {/* Config panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <main
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
            data-onboarding-scroll
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const diff = touchStartX.current - e.changedTouches[0].clientX;
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
              {renderScreen()}

              {/* Error Banner */}
              {error && (
                <div className="px-4 sm:px-6 lg:px-8 pb-2">
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-400/60 hover:text-red-400 ml-3 shrink-0"
                    >
                      <span className="sr-only">Close</span>
                      &times;
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom spacer so content doesn't hide behind fixed nav */}
              <div className="h-20" />
            </div>
          </main>

          {/* ═══ Fixed bottom navigation bar ═══ */}
          <div className="shrink-0 border-t border-app-border/50 bg-app-card/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              {/* Back button */}
              {canGoBack ? (
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-app-text-secondary hover:text-app-text hover:bg-app-hover transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('back')}</span>
                </button>
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
                  disabled={saving}
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
        </div>

        {/* Phone preview — desktop only */}
        <div className="hidden lg:flex w-[320px] items-center justify-center border-l border-app-border/50 bg-app-elevated/30 shrink-0">
          <PhonePreview data={data} phase={phase} />
        </div>
      </div>
    </div>
  );
}
