'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import { Palette, UtensilsCrossed, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/use-toast';
import { getSegmentFeatures } from '@/lib/segment-features';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';

import { SCREEN_TO_API_STEP, oldStepToPhaseScreen, type ScreenKey } from './onboarding-steps';
import type { PhaseDefinition } from './onboarding-steps';
import type { OnboardingData } from './types';

export function useOnboarding() {
  const t = useTranslations('onboarding');
  const { toast } = useToast();

  // Navigation state: phase 0 = welcome, 1-3 = studio phases
  const [phase, setPhase] = useState(0);
  const [subScreen, setSubScreen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const touchStartXRef = useRef(0);
  const lastSavedPayload = useRef<string>('');
  const autoSaveErrorShown = useRef(false);
  /** Skip native "leave site?" dialog when redirecting after successful completion */
  const skipUnloadWarningRef = useRef(false);

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

  // --- Derived values --------------------------------------------------------

  // Compute adaptive phases based on establishment type
  const segmentFeatures = getSegmentFeatures(data.establishmentType);
  const phases: PhaseDefinition[] = [
    {
      labelKey: 'phaseIdentity',
      icon: Palette,
      subScreens: ['establishment', 'branding', 'details'],
    },
    {
      labelKey: 'phaseMenu',
      icon: UtensilsCrossed,
      subScreens: segmentFeatures.showTables ? ['tables', 'menu'] : ['menu'],
    },
    { labelKey: 'phaseLaunch', icon: Rocket, subScreens: ['qr', 'summary'] },
  ];

  const currentPhase = phase >= 1 && phase <= 3 ? phases[phase - 1] : null;
  const screenKey: ScreenKey | null = currentPhase
    ? (currentPhase.subScreens[subScreen] ?? null)
    : null;
  const apiStep = screenKey ? SCREEN_TO_API_STEP[screenKey] : 0;

  const isLastScreen = phase === 3 && subScreen === phases[2].subScreens.length - 1;

  // --- Step completeness check (adapted for phases) --------------------------

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

  // --- Fetch saved state -----------------------------------------------------

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load saved onboarding state once on mount; re-running on toast/t changes would refetch and clobber in-progress edits (2026-06-18)
  }, []);

  // --- Auto-save debounced ---------------------------------------------------

  useEffect(() => {
    if (loading || phase === 0 || isLastScreen) return;
    const timer = setTimeout(async () => {
      // Deduplicate: skip save if payload hasn't changed since last save
      const draftPayload = {
        ...data,
        _phase: phase,
        _subScreen: subScreen,
      };
      const payloadJson = JSON.stringify({ step: apiStep, data: draftPayload });
      if (payloadJson === lastSavedPayload.current) return;

      setAutoSaveStatus('saving');
      try {
        const res = await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
        });
        if (res.ok) {
          lastSavedPayload.current = payloadJson;
          autoSaveErrorShown.current = false;
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
          return;
        }

        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        if (!autoSaveErrorShown.current) {
          autoSaveErrorShown.current = true;
          const description =
            errBody.error === 'RESTAURANT_NAME_TAKEN' ? t('nameTaken') : errBody.error || undefined;
          toast({
            title: t('saveError'),
            description,
            variant: 'destructive',
          });
        }
        if (res.status === 401 || res.status === 403) {
          lastSavedPayload.current = payloadJson;
        }
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: toast/t are referenced only on the error path and are stable across renders; including them would reset the 2s auto-save debounce on every locale/toast identity change (2026-06-18)
  }, [data, phase, subScreen, loading, apiStep, isLastScreen]);

  // --- Save on tab close / navigate away (beacon API for reliability) ------

  useEffect(() => {
    if (loading || phase === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Warn when leaving mid-flow, but not after "Lancer mon etablissement" (redirect)
      if (phase > 0 && !skipUnloadWarningRef.current) {
        e.preventDefault();
      }
      // Persist draft via beacon regardless
      const draftPayload = {
        ...data,
        _phase: phase,
        _subScreen: subScreen,
      };
      const body = JSON.stringify({ step: apiStep, data: draftPayload });
      void fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [data, phase, subScreen, loading, apiStep]);

  // --- Data update callback -------------------------------------------------

  const updateData = useCallback((newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  const scrollToTop = () => {
    document.querySelector('[data-onboarding-scroll]')?.scrollTo({ top: 0, behavior: 'instant' });
  };

  // --- Navigation -----------------------------------------------------------

  const goNext = () => {
    // Establishment name is required; block advancing (button click OR swipe) with an
    // empty name so onboarding never completes with a nameless tenant.
    if (screenKey === 'establishment' && !data.tenantName.trim()) {
      setError(t('nameRequired'));
      return;
    }

    setError(null);
    setDirection('forward');

    // No explicit saveStep() here - the debounced auto-save handles persistence
    // whenever data or navigation changes, avoiding double-save token waste.

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
      const prevPhase = phases[phase - 2];
      setPhase((p) => p - 1);
      setSubScreen(prevPhase.subScreens.length - 1);
    }
    scrollToTop();
  };

  // --- Keyboard navigation --------------------------------------------------

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: goNext/goPrev are recreated each render but close over phase/subScreen which are already deps; listing them would re-bind the keydown listener on every render with no behavior change (2026-06-18)
  }, [phase, subScreen, isLastScreen]);

  const goToPhase = (targetPhase: number) => {
    if (targetPhase >= phase) return; // only allow going to completed phases
    setError(null);
    setDirection('backward');
    setPhase(targetPhase);
    setSubScreen(0);
    scrollToTop();
  };

  // --- Complete onboarding --------------------------------------------------

  const completeOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      const result = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string[];
        slug?: string;
      };

      if (!res.ok) {
        if (result.details && Array.isArray(result.details)) {
          throw new Error(`${t('validationFailed')}: ${result.details.join(', ')}`);
        }
        if (result.error === 'RESTAURANT_NAME_TAKEN') {
          throw new Error(t('nameTaken'));
        }
        throw new Error(result.error || t('completeError'));
      }

      const slug = (result.slug || data.tenantSlug || '').trim();
      if (!slug || isReservedSiteSlug(slug)) {
        throw new Error(t('completeError'));
      }

      skipUnloadWarningRef.current = true;
      const origin = window.location.origin;
      window.location.href = `${origin}/sites/${slug}/admin`;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('completeError');
      setError(message);
      toast({ title: t('completeError'), description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const startStudio = () => {
    setDirection('forward');
    setPhase(1);
    setSubScreen(0);
  };

  // --- Studio layout (phases 1-3) -------------------------------------------

  const canGoBack = phase > 1 || subScreen > 0;

  return {
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
  };
}
