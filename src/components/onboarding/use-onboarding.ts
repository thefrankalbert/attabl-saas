'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import { Palette, UtensilsCrossed, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/use-toast';
import { ONBOARDING_LAUNCH_DEFAULTS } from '@/lib/onboarding/launch-defaults';
import { withOnboardingSite } from '@/lib/onboarding/site-param';
import { getSegmentFeatures } from '@/lib/segment-features';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';

import { SCREEN_TO_API_STEP, oldStepToPhaseScreen, type ScreenKey } from './onboarding-steps';
import type { PhaseDefinition } from './onboarding-steps';
import type { OnboardingData } from './types';
import { stepBlockingError } from './utils/step-validation';

export function useOnboarding() {
  const t = useTranslations('onboarding');
  const { toast } = useToast();

  // Navigation state: phase 0 = welcome, 1-3 = studio phases
  const [phase, setPhase] = useState(0);
  const [subScreen, setSubScreen] = useState(0);
  // C-012: passer la carte sans aucun plat lance un restaurant a la carte vide.
  // Premier appui: on previent; second appui: on continue, c'est un choix.
  const [emptyMenuWarned, setEmptyMenuWarned] = useState(false);
  const [loading, setLoading] = useState(true);
  /**
   * The saved state could not be read. The studio is NOT shown: with empty
   * fields, the first keystroke would auto-save them over the real draft.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  /** Bumped every 10 s while the last save failed, to retry it (see below). */
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  /**
   * Bumped on EVERY failed save. A failure while the status is already
   * 'error' does not change the status, so without this the retry timer was
   * never re-armed (e.g. a permanent 400, then a network failure).
   */
  const [saveFailures, setSaveFailures] = useState(0);
  const touchStartXRef = useRef(0);
  /** Last payload sent or given up on: dedupes saves and stops a hopeless retry. */
  const lastSavedPayload = useRef<string>('');
  /**
   * The draft data the server REALLY holds (restored on load, or saved since),
   * without the navigation position. The leave warning compares against it:
   * moving between screens loses nothing, and a refused save (401/403) does
   * not count as saved.
   */
  const persistedDataRef = useRef<string | null>(null);
  const autoSaveErrorShown = useRef(false);
  /**
   * Whether the last failed save can succeed by itself (network, 5xx, 429).
   * A 400 or a taken name will fail identically until the user edits: those
   * are shown but not retried in a loop.
   */
  const retryableRef = useRef(false);
  /** Body of a save-on-leave request still in flight (dedupes the 3 events). */
  const flushInFlightRef = useRef<string | null>(null);
  /** Skip native "leave site?" dialog when redirecting after successful completion */
  const skipUnloadWarningRef = useRef(false);
  /** Leaves the onboarding for good: `replace`, so "back" cannot return here. */
  const leaveToAdmin = (slug: string) => {
    skipUnloadWarningRef.current = true;
    window.location.replace(`${window.location.origin}/sites/${slug}/admin`);
  };

  const [data, setData] = useState<OnboardingData>({
    establishmentType: 'restaurant',
    address: '',
    city: '',
    // Marche de lancement (Burkina Faso, XOF): meme source que le serveur, qui
    // ecrasait auparavant ces valeurs par les defauts de la base (XAF).
    country: ONBOARDING_LAUNCH_DEFAULTS.country,
    phone: '',
    tableCount: 10,
    language: 'fr-FR',
    currency: ONBOARDING_LAUNCH_DEFAULTS.currency,
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
    qrTemplate: 'minimal',
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
        const res = await fetch(withOnboardingSite('/api/onboarding/state'));
        if (res.ok) {
          const state = await res.json();

          // Shown once per establishment: a finished one goes to its space.
          if (state.completed && typeof state.tenantSlug === 'string' && state.tenantSlug) {
            leaveToAdmin(state.tenantSlug);
            return;
          }
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
        } else {
          // Not a silent empty form: an empty form here gets auto-saved over
          // the real draft as soon as the user types.
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || t('saveError'));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('saveError');
        setLoadError(message);
      } finally {
        // Keep the skeleton while redirecting a finished establishment away.
        if (!skipUnloadWarningRef.current) setLoading(false);
      }
    };

    fetchOnboardingState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load saved onboarding state once on mount; re-running on toast/t changes would refetch and clobber in-progress edits (2026-06-18)
  }, []);

  // The restored draft is what the server holds: leaving right after the load
  // loses nothing. Set once, on the first render with the restored data.
  useEffect(() => {
    if (!loading && persistedDataRef.current === null) {
      persistedDataRef.current = JSON.stringify(data);
    }
  }, [loading, data]);

  // --- Auto-save debounced ---------------------------------------------------

  useEffect(() => {
    if (loading || loadError || phase === 0 || isLastScreen) return;
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
        const res = await fetch(withOnboardingSite('/api/onboarding/save'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
        });
        if (res.ok) {
          lastSavedPayload.current = payloadJson;
          persistedDataRef.current = JSON.stringify(data);
          autoSaveErrorShown.current = false;
          setAutoSaveStatus('saved');
          return;
        }

        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
          slug?: string | null;
        };

        // Finished in another tab: this draft must not overwrite anything.
        if (res.status === 409 && errBody.error === 'ONBOARDING_ALREADY_COMPLETED') {
          if (errBody.slug) {
            leaveToAdmin(errBody.slug);
          } else {
            retryableRef.current = false;
            setAutoSaveStatus('error');
            setSaveFailures((n) => n + 1);
          }
          return;
        }

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
          // Retrying cannot succeed (session gone / no access): stop the loop.
          // Nothing was saved, so persistedDataRef stays: leaving still warns.
          lastSavedPayload.current = payloadJson;
          setAutoSaveStatus('idle');
          return;
        }
        // Shown in every case; retried only when a retry can succeed. The
        // next edit retries a permanent failure anyway (new payload).
        retryableRef.current = res.status >= 500 || res.status === 429;
        setAutoSaveStatus('error');
        setSaveFailures((n) => n + 1);
      } catch {
        // Network down: used to fall back to "idle" in silence, so the user
        // believed the draft was kept. Shown, and retried below.
        retryableRef.current = true;
        setAutoSaveStatus('error');
        setSaveFailures((n) => n + 1);
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: toast/t/leaveToAdmin are referenced only on the error path and are stable in behavior across renders; including them would reset the 2s auto-save debounce on every render (2026-11-08)
  }, [data, phase, subScreen, loading, loadError, apiStep, isLastScreen, saveRetryTick]);

  // "Saved" fades back to idle; a failed save that can succeed is retried every
  // 10 s (the payload differs from the last saved one, so the save re-runs).
  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      const id = setTimeout(() => setAutoSaveStatus('idle'), 2000);
      return () => clearTimeout(id);
    }
    if (autoSaveStatus === 'error' && retryableRef.current) {
      const id = setTimeout(() => setSaveRetryTick((n) => n + 1), 10000);
      return () => clearTimeout(id);
    }
  }, [autoSaveStatus, saveRetryTick, saveFailures]);

  // --- Save when the page is left or hidden ---------------------------------
  //
  // `beforeunload` alone missed mobile: iOS Safari does not fire it when the
  // user switches app or closes the tab, so the last ~2 s of typing (the
  // debounce) were lost. `visibilitychange` (hidden) and `pagehide` fire there.
  // A `keepalive` request survives the page going away.

  useEffect(() => {
    if (loading || loadError || phase === 0) return;

    const body = JSON.stringify({
      step: apiStep,
      data: { ...data, _phase: phase, _subScreen: subScreen },
    });
    const dataJson = JSON.stringify(data);

    const flushDraft = () => {
      if (skipUnloadWarningRef.current) return; // leaving after a completed launch
      // Nothing new to keep, or the same body already on its way.
      if (body === lastSavedPayload.current || body === flushInFlightRef.current) return;
      flushInFlightRef.current = body;
      void fetch(withOnboardingSite('/api/onboarding/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
        .then((res) => {
          if (res.ok) {
            lastSavedPayload.current = body;
            persistedDataRef.current = dataJson;
            return;
          }
          // Page still open (tab hidden then shown): show it and retry.
          retryableRef.current = res.status >= 500 || res.status === 429;
          setAutoSaveStatus('error');
          setSaveFailures((n) => n + 1);
        })
        .catch(() => {
          // The page may already be gone (the next visit resumes from the last
          // successful save); if it is still open, show it and retry.
          retryableRef.current = true;
          setAutoSaveStatus('error');
          setSaveFailures((n) => n + 1);
        })
        .finally(() => {
          flushInFlightRef.current = null;
        });
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Warn only when entered data would be lost: not after "Lancer mon
      // etablissement" (redirect), and not when the server already holds this
      // data. A pending, in-flight or refused save still warns. Neither the
      // visual status ("saved" fades back to idle after 2 s) nor the screen
      // position (the recap screen does not auto-save) decides this.
      if (!skipUnloadWarningRef.current && dataJson !== persistedDataRef.current) {
        e.preventDefault();
      }
      flushDraft();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [data, phase, subScreen, loading, loadError, apiStep]);

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

    // Prix negatif, zone sans nom: refuses ici, sur l'ecran fautif.
    const blocage = screenKey ? stepBlockingError(screenKey, data) : null;
    if (blocage) {
      setError(t(blocage));
      return;
    }

    if (
      screenKey === 'menu' &&
      !emptyMenuWarned &&
      !data.menuItems.some((item) => item.name.trim())
    ) {
      setEmptyMenuWarned(true);
      setError(t('emptyMenuWarning'));
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
      const res = await fetch(withOnboardingSite('/api/onboarding/complete'), {
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
        if (result.error === 'ONBOARDING_IN_PROGRESS') {
          throw new Error(t('launchInProgress'));
        }
        throw new Error(result.error || t('completeError'));
      }

      const slug = (result.slug || data.tenantSlug || '').trim();
      if (!slug || isReservedSiteSlug(slug)) {
        throw new Error(t('completeError'));
      }

      leaveToAdmin(slug);
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
    loadError,
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
