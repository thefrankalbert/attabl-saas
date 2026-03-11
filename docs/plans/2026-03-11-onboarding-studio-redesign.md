# "Le Studio" Onboarding Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Completely redesign the onboarding flow into an immersive "Studio" experience with 3 phases, no sidebar, floating glassmorphism navigation, and a live phone preview — using existing dashboard OKLCH design tokens.

**Architecture:** Replace the current 5-step sidebar wizard with a 3-phase studio layout. The page orchestrator (`page.tsx`) manages phases and sub-screens. Each phase has 2-3 sub-screens that transition smoothly. A persistent top navigation strip with phase pills replaces the sidebar. A live phone mockup preview updates in real-time on the right side. All existing step components are refactored to fit the new split-panel layout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 (OKLCH tokens), Lucide icons, next-intl translations

**Files overview:**

- `src/app/onboarding/page.tsx` — Complete rewrite (orchestrator, 3-phase navigation, layout)
- `src/components/onboarding/WelcomeStep.tsx` — Rewrite (minimal, confident welcome)
- `src/components/onboarding/EstablishmentStep.tsx` — Refactor (split into identity sub-screens)
- `src/components/onboarding/TablesStep.tsx` — Refactor (simplified, fits panel layout)
- `src/components/onboarding/BrandingStep.tsx` — Refactor (merged into identity phase)
- `src/components/onboarding/MenuStep.tsx` — Refactor (fits panel layout)
- `src/components/onboarding/LaunchStep.tsx` — Refactor (summary + QR in panel)
- `src/components/onboarding/PhonePreview.tsx` — **New** (live phone mockup component)
- Translation files — Add new keys for 3-phase labels

**Design tokens used throughout (from globals.css):**

- Surfaces: `bg-app-bg`, `bg-app-card`, `bg-app-elevated`, `bg-app-hover`
- Borders: `border-app-border`, `border-app-border-hover`
- Text: `text-app-text`, `text-app-text-secondary`, `text-app-text-muted`
- Accent: `bg-accent`, `text-accent`, `bg-accent-muted`, `text-accent-text`
- Patterns: `rounded-xl`, `rounded-2xl` for cards, `text-[11px] uppercase tracking-widest` for section labels

---

### Task 1: Create the PhonePreview component

**Files:**

- Create: `src/components/onboarding/PhonePreview.tsx`

**Step 1: Create the PhonePreview component**

This is the live phone mockup that shows the restaurant's menu site being built in real-time. It receives the OnboardingData and renders a miniature version of what their public site will look like.

```tsx
/* eslint-disable @next/next/no-img-element */
'use client';

import { Layout } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface PhonePreviewProps {
  data: OnboardingData;
  phase: number;
}

export function PhonePreview({ data, phase }: PhonePreviewProps) {
  const primaryColor = data.primaryColor || '#CCFF00';
  const secondaryColor = data.secondaryColor || '#000000';

  return (
    <div className="flex items-center justify-center h-full">
      {/* Phone frame */}
      <div className="relative w-[260px] h-[520px] rounded-[2.5rem] border-2 border-app-border bg-app-card shadow-2xl shadow-black/20 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-app-card rounded-b-2xl z-10" />

        {/* Screen content */}
        <div
          className="h-full w-full overflow-hidden rounded-[2.3rem]"
          style={{ backgroundColor: secondaryColor }}
        >
          {/* Status bar mock */}
          <div className="h-10" />

          {/* Restaurant header */}
          <div className="px-5 pt-2 pb-4">
            <div className="flex items-center gap-3 mb-3">
              {data.logoUrl ? (
                <img src={data.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Layout className="h-5 w-5" style={{ color: secondaryColor }} />
                </div>
              )}
              <div>
                <p className="text-sm font-bold leading-tight" style={{ color: primaryColor }}>
                  {data.tenantName || 'Mon restaurant'}
                </p>
                {data.description && (
                  <p
                    className="text-[10px] mt-0.5 opacity-70 line-clamp-1"
                    style={{ color: primaryColor }}
                  >
                    {data.description}
                  </p>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px w-full opacity-20" style={{ backgroundColor: primaryColor }} />
          </div>

          {/* Menu items preview (phases 2+) */}
          {phase >= 2 && data.menuItems.length > 0 ? (
            <div className="px-5 space-y-4">
              {/* Group by category */}
              {Array.from(new Set(data.menuItems.map((i) => i.category)))
                .slice(0, 2)
                .map((cat) => (
                  <div key={cat || 'default'}>
                    {cat && (
                      <p
                        className="text-[9px] font-bold uppercase tracking-wider mb-2"
                        style={{ color: primaryColor }}
                      >
                        {cat}
                      </p>
                    )}
                    {data.menuItems
                      .filter((i) => i.category === cat)
                      .slice(0, 3)
                      .map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2">
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="w-6 h-6 rounded object-cover"
                              />
                            )}
                            <span className="text-[11px]" style={{ color: primaryColor }}>
                              {item.name}
                            </span>
                          </div>
                          {item.price > 0 && (
                            <span
                              className="text-[10px] font-semibold tabular-nums"
                              style={{ color: primaryColor }}
                            >
                              {item.price} {data.currency || 'EUR'}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          ) : (
            /* Placeholder skeleton for early phases */
            <div className="px-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div
                    className="h-2.5 rounded-full opacity-10"
                    style={{ backgroundColor: primaryColor, width: `${40 + i * 15}%` }}
                  />
                  <div
                    className="h-2.5 w-10 rounded-full opacity-10"
                    style={{ backgroundColor: primaryColor }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Bottom CTA mock */}
          <div className="absolute bottom-8 left-5 right-5">
            <div
              className="w-full py-2.5 rounded-xl text-center text-[11px] font-bold"
              style={{ backgroundColor: primaryColor, color: secondaryColor }}
            >
              Commander
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm typecheck`
Expected: PASS (no errors related to PhonePreview)

**Step 3: Commit**

```bash
git add src/components/onboarding/PhonePreview.tsx
git commit -m "feat(onboarding): add PhonePreview live mockup component"
```

---

### Task 2: Add translation keys for 3-phase navigation

**Files:**

- Modify: `src/messages/fr-FR.json` (onboarding section)
- Modify: `src/messages/en-US.json` (onboarding section)

**Step 1: Add new phase-related translation keys**

Add these keys inside the `"onboarding"` object in both translation files:

For `fr-FR.json`:

```json
"phaseIdentity": "Identité",
"phaseMenu": "Menu",
"phaseLaunch": "Lancement",
"phaseIdentityDesc": "Votre établissement et votre marque",
"phaseMenuDesc": "Tables et carte du menu",
"phaseLaunchDesc": "QR code et mise en ligne",
"continueButton": "Continuer",
"optional": "optionnel",
"studioTitle": "Bienvenue dans votre studio",
"studioSubtitle": "Configurez votre menu digital en quelques minutes"
```

For `en-US.json`:

```json
"phaseIdentity": "Identity",
"phaseMenu": "Menu",
"phaseLaunch": "Launch",
"phaseIdentityDesc": "Your establishment and brand",
"phaseMenuDesc": "Tables and menu items",
"phaseLaunchDesc": "QR code and go live",
"continueButton": "Continue",
"optional": "optional",
"studioTitle": "Welcome to your studio",
"studioSubtitle": "Set up your digital menu in just a few minutes"
```

Also add these keys to all other locale files (en-GB, en-IE, en-AU, en-CA, fr-CA, es-ES) — copy from the relevant base language.

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/messages/
git commit -m "feat(onboarding): add translation keys for 3-phase studio layout"
```

---

### Task 3: Rewrite the main orchestrator (page.tsx)

**Files:**

- Modify: `src/app/onboarding/page.tsx` (complete rewrite)

This is the core structural change. The new layout:

- No sidebar
- Floating glassmorphism top strip with 3 phase pills
- Split content: left config panel + right phone preview
- Sub-screen navigation within phases
- Loading skeleton matches the new layout

**Step 1: Rewrite page.tsx**

Key structural changes from current code:

1. Replace `currentStep` (0-5) with `phase` (0-3) and `subScreen` (0-2) tracking
2. Remove sidebar JSX entirely
3. Add floating top navigation strip with phase pills
4. Add split-panel layout with PhonePreview on right
5. Move CTA button into content flow (not fixed footer)
6. Keep all existing logic: auto-save, keyboard nav, touch swipe, API calls, OnboardingData interface

The `OnboardingData` interface and all API interaction logic stays the same — only the layout/navigation JSX changes.

```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2,
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

/* ─── Phase / sub-screen mapping ─── */
const PHASES = [
  {
    key: 'phaseIdentity' as const,
    icon: Building2,
    subScreens: ['establishment', 'branding', 'details'] as const,
  },
  {
    key: 'phaseMenu' as const,
    icon: UtensilsCrossed,
    subScreens: ['tables', 'menu'] as const,
  },
  {
    key: 'phaseLaunch' as const,
    icon: Rocket,
    subScreens: ['qr', 'summary'] as const,
  },
] as const;

/* Map old step numbers for API save compatibility */
function phaseToApiStep(phase: number, subScreen: number): number {
  if (phase === 1) return subScreen === 0 ? 1 : subScreen === 1 ? 3 : 1;
  if (phase === 2) return subScreen === 0 ? 2 : 4;
  if (phase === 3) return 5;
  return 0;
}

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

  // Navigation state: phase 0 = welcome, 1-3 = phases
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

  /* ─── API: Fetch saved state ─── */
  useEffect(() => {
    const fetchState = async () => {
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
          // Convert old step to new phase/subScreen
          const oldStep = state.step || 0;
          if (oldStep === 0) {
            setPhase(0);
            setSubScreen(0);
          } else if (oldStep <= 1) {
            setPhase(1);
            setSubScreen(0);
          } else if (oldStep === 2) {
            setPhase(2);
            setSubScreen(0);
          } else if (oldStep === 3) {
            setPhase(1);
            setSubScreen(1);
          } else if (oldStep === 4) {
            setPhase(2);
            setSubScreen(1);
          } else {
            setPhase(3);
            setSubScreen(0);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({ title: t('saveError'), description: message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── API: Auto-save debounced ─── */
  useEffect(() => {
    if (loading || phase === 0) return;
    setAutoSaveStatus('idle');
    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      try {
        const apiStep = phaseToApiStep(phase, subScreen);
        const res = await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: apiStep, data }),
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
  }, [data, phase, subScreen, loading]);

  /* ─── Keyboard navigation ─── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, subScreen]);

  const updateData = useCallback((newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  /* ─── Navigation helpers ─── */
  const currentPhaseConfig = phase > 0 ? PHASES[phase - 1] : null;
  const maxSubScreens = currentPhaseConfig?.subScreens.length ?? 0;

  const scrollToTop = () => {
    document.querySelector('[data-onboarding-scroll]')?.scrollTo({ top: 0, behavior: 'instant' });
  };

  const saveStep = async () => {
    try {
      const apiStep = phaseToApiStep(phase, subScreen);
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: apiStep, data }),
      });
    } catch {
      // Silent fail for save — auto-save handles it
    }
  };

  const goNext = () => {
    if (phase === 0) return;
    setError(null);
    setDirection('forward');

    if (subScreen < maxSubScreens - 1) {
      // Next sub-screen within phase
      setSubScreen((s) => s + 1);
    } else if (phase < 3) {
      // Next phase
      setPhase((p) => p + 1);
      setSubScreen(0);
    }
    scrollToTop();
    saveStep();
  };

  const goPrev = () => {
    if (phase === 0) return;
    setError(null);
    setDirection('backward');

    if (subScreen > 0) {
      setSubScreen((s) => s - 1);
    } else if (phase > 1) {
      const prevPhaseScreens = PHASES[phase - 2].subScreens.length;
      setPhase((p) => p - 1);
      setSubScreen(prevPhaseScreens - 1);
    }
    scrollToTop();
  };

  const goToPhase = (targetPhase: number) => {
    if (targetPhase >= 1 && targetPhase <= phase) {
      setError(null);
      setDirection('backward');
      setPhase(targetPhase);
      setSubScreen(0);
      scrollToTop();
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

  /* ─── Determine which content to render ─── */
  const renderContent = () => {
    if (phase === 0) {
      return (
        <WelcomeStep
          tenantName={data.tenantName}
          onStart={() => {
            setDirection('forward');
            setPhase(1);
            setSubScreen(0);
          }}
        />
      );
    }

    const screenKey = currentPhaseConfig?.subScreens[subScreen];

    switch (screenKey) {
      case 'establishment':
        return <EstablishmentStep data={data} updateData={updateData} />;
      case 'branding':
        return <BrandingStep data={data} updateData={updateData} />;
      case 'details':
        // Details sub-screen: address, phone, language, currency, type-specific
        // This reuses EstablishmentStep but we'll render the "details" variant
        return <EstablishmentStep data={data} updateData={updateData} variant="details" />;
      case 'tables':
        return <TablesStep data={data} updateData={updateData} />;
      case 'menu':
        return <MenuStep data={data} updateData={updateData} />;
      case 'qr':
        return <LaunchStep data={data} updateData={updateData} variant="qr" />;
      case 'summary':
        return <LaunchStep data={data} updateData={updateData} variant="summary" />;
      default:
        return null;
    }
  };

  /* ─── Total progress calculation ─── */
  const totalScreens = PHASES.reduce((sum, p) => sum + p.subScreens.length, 0); // 7
  const completedScreens =
    phase === 0
      ? 0
      : PHASES.slice(0, phase - 1).reduce((sum, p) => sum + p.subScreens.length, 0) + subScreen;
  const progressPercent = phase === 0 ? 0 : Math.round((completedScreens / totalScreens) * 100);

  const isLastScreen = phase === 3 && subScreen === maxSubScreens - 1;

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col bg-app-bg">
        {/* Top strip skeleton */}
        <div className="shrink-0 h-14 flex items-center px-6 gap-4">
          <div className="w-20 h-5 rounded-lg bg-app-elevated animate-pulse" />
          <div className="flex-1" />
          <div className="flex gap-2">
            <div className="w-20 h-8 rounded-full bg-app-elevated animate-pulse" />
            <div className="w-20 h-8 rounded-full bg-app-elevated animate-pulse" />
            <div className="w-20 h-8 rounded-full bg-app-elevated animate-pulse" />
          </div>
          <div className="flex-1" />
          <div className="w-8 h-4 rounded bg-app-elevated animate-pulse" />
        </div>
        {/* Content skeleton */}
        <div className="flex-1 flex gap-8 px-8 py-6">
          <div className="flex-1 space-y-4">
            <div className="h-8 w-48 rounded-lg bg-app-elevated/40 animate-pulse" />
            <div className="h-4 w-72 rounded bg-app-elevated/20 animate-pulse" />
            <div className="h-64 rounded-2xl bg-app-elevated/20 animate-pulse mt-6" />
          </div>
          <div className="hidden lg:block w-[300px] shrink-0">
            <div className="h-[520px] w-[260px] rounded-[2.5rem] bg-app-elevated/20 animate-pulse mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-app-bg transition-colors duration-200">
      {/* ═══ FLOATING TOP STRIP (glassmorphism) ═══ */}
      {phase > 0 && (
        <header className="shrink-0 h-14 flex items-center px-4 sm:px-6 lg:px-8 bg-app-card/80 backdrop-blur-xl border-b border-app-border/50 z-20">
          {/* Left: Logo / tenant name */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <Link
              href="/"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-app-hover transition-colors"
              title="Accueil"
            >
              <LayoutGrid className="w-4 h-4 text-app-text-muted" />
            </Link>
            <span className="text-sm font-semibold text-app-text truncate max-w-[120px] hidden sm:block">
              {data.tenantName || 'ATTABL'}
            </span>
          </div>

          {/* Center: Phase pills */}
          <nav className="flex-1 flex items-center justify-center gap-1.5">
            {PHASES.map((p, idx) => {
              const phaseNum = idx + 1;
              const isActive = phase === phaseNum;
              const isCompleted = phase > phaseNum;
              const isClickable = isCompleted;
              const Icon = p.icon;

              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => isClickable && goToPhase(phaseNum)}
                  disabled={!isClickable && !isActive}
                  className={`relative flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : isCompleted
                        ? 'text-app-text-secondary hover:text-app-text hover:bg-app-hover cursor-pointer'
                        : 'text-app-text-muted opacity-40 cursor-default'
                  }`}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="hidden sm:inline">{t(p.key)}</span>

                  {/* Sub-screen progress bar under active pill */}
                  {isActive && maxSubScreens > 1 && (
                    <div className="absolute -bottom-0.5 left-3 right-3 h-0.5 rounded-full bg-app-border overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${((subScreen + 1) / maxSubScreens) * 100}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Progress + auto-save */}
          <div className="flex items-center gap-3 shrink-0">
            {autoSaveStatus === 'saving' && (
              <span className="text-[10px] text-app-text-muted animate-pulse">
                {t('autoSaving')}
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-[10px] text-accent">{t('autoSaved')}</span>
            )}
            <span className="text-xs text-app-text-muted tabular-nums font-medium">
              {progressPercent}%
            </span>
          </div>
        </header>
      )}

      {/* ═══ CONTENT AREA ═══ */}
      <div
        className="flex-1 min-h-0 flex"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const diff = touchStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 80) {
            if (diff > 0) goNext();
            if (diff < 0) goPrev();
          }
        }}
      >
        {/* Left: Config panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
            <div
              key={`${phase}-${subScreen}`}
              className={
                phase > 0
                  ? direction === 'forward'
                    ? 'animate-in slide-in-from-right-4 fade-in duration-200'
                    : 'animate-in slide-in-from-left-4 fade-in duration-200'
                  : ''
              }
            >
              {renderContent()}
            </div>

            {/* Bottom navigation — inside scroll, not fixed */}
            {phase > 0 && (
              <div className="px-4 sm:px-6 lg:px-8 pb-6 pt-2">
                {/* Error Banner */}
                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-400/60 hover:text-red-400 ml-3 shrink-0"
                    >
                      &times;
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {/* Back */}
                  {phase === 1 && subScreen === 0 ? (
                    <span className="min-w-[80px]" />
                  ) : (
                    <button
                      type="button"
                      onClick={goPrev}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-app-text-secondary hover:text-app-text hover:bg-app-hover transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('back')}</span>
                    </button>
                  )}

                  {/* Forward */}
                  {isLastScreen ? (
                    <Button
                      variant="default"
                      onClick={completeOnboarding}
                      disabled={saving}
                      className="h-11 rounded-xl gap-2 text-sm font-bold px-8 shadow-lg shadow-accent/20"
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
                      className="h-11 rounded-xl gap-2 text-sm font-bold px-8 shadow-lg shadow-accent/20"
                    >
                      {t('continueButton')}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Right: Phone preview — desktop only */}
        {phase > 0 && (
          <div className="hidden lg:flex w-[320px] shrink-0 items-center justify-center border-l border-app-border/30 bg-app-bg">
            <PhonePreview data={data} phase={phase} />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: Will show errors for `variant` prop on EstablishmentStep and LaunchStep — these will be fixed in Tasks 4 and 7.

**Step 3: Commit (with known type errors to fix in next tasks)**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(onboarding): rewrite orchestrator for 3-phase studio layout

Replaces sidebar wizard with floating glassmorphism nav strip,
split-panel layout with live phone preview, and 3-phase navigation.
WIP: step component variant props not yet added."
```

---

### Task 4: Refactor EstablishmentStep to support `variant` prop

**Files:**

- Modify: `src/components/onboarding/EstablishmentStep.tsx`

The EstablishmentStep now serves two sub-screens:

- Default (no variant or `variant="identity"`): Name + Type selection only
- `variant="details"`: Address, phone, language, currency, type-specific fields

**Step 1: Add variant prop and split the rendering**

Add `variant?: 'identity' | 'details'` to the props interface. When `variant="details"`, render only the address/config section. When default, render only name + type.

Key changes:

1. Add `variant` to `EstablishmentStepProps`
2. Wrap name + type section in a condition: show when `variant !== 'details'`
3. Wrap address + config section in a condition: show when `variant === 'details'`
4. Update section headers for each variant

The complete component keeps all existing logic (ToggleSwitch, NumberStepper, all establishment types, locale labels). Only the render conditionals change.

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: EstablishmentStep variant errors resolved

**Step 3: Commit**

```bash
git add src/components/onboarding/EstablishmentStep.tsx
git commit -m "feat(onboarding): add variant prop to EstablishmentStep for sub-screen splitting"
```

---

### Task 5: Rewrite WelcomeStep (minimal, confident)

**Files:**

- Modify: `src/components/onboarding/WelcomeStep.tsx`

Replace the current decorative hero (gradient cards, sparkles, serif font) with a clean, confident welcome:

- Centered on `bg-app-bg`
- Small ATTABL wordmark at top
- `text-2xl font-bold`: "Bienvenue, {name}"
- `text-base text-app-text-secondary`: Subtitle
- 3 minimal phase indicators (icon + label, horizontal)
- Single large accent CTA button
- No decorative gradients, no sparkles, no serif

**Step 1: Rewrite WelcomeStep.tsx**

```tsx
'use client';

import { Building2, UtensilsCrossed, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

const PHASE_ICONS = [Building2, UtensilsCrossed, Rocket] as const;
const PHASE_KEYS = ['phaseIdentity', 'phaseMenu', 'phaseLaunch'] as const;
const PHASE_DESC_KEYS = ['phaseIdentityDesc', 'phaseMenuDesc', 'phaseLaunchDesc'] as const;

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {/* Wordmark */}
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-app-text-muted mb-10">
          ATTABL
        </p>

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl font-bold text-app-text leading-tight mb-3">
          {t('welcomeTitle', { name: tenantName || '' })}
        </h1>
        <p className="text-base text-app-text-secondary mb-12 max-w-sm leading-relaxed">
          {t('studioSubtitle')}
        </p>

        {/* Phase indicators */}
        <div className="w-full flex items-start justify-center gap-8 mb-12">
          {PHASE_KEYS.map((key, i) => {
            const Icon = PHASE_ICONS[i];
            return (
              <div key={key} className="flex flex-col items-center gap-2.5 max-w-[100px]">
                <div className="w-11 h-11 rounded-xl bg-app-elevated flex items-center justify-center">
                  <Icon className="h-5 w-5 text-app-text-secondary" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-app-text">{t(key)}</p>
                  <p className="text-[10px] text-app-text-muted mt-0.5">{t(PHASE_DESC_KEYS[i])}</p>
                </div>
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
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/onboarding/WelcomeStep.tsx
git commit -m "feat(onboarding): rewrite WelcomeStep with clean minimal design"
```

---

### Task 6: Refactor BrandingStep for panel layout

**Files:**

- Modify: `src/components/onboarding/BrandingStep.tsx`

The BrandingStep is now a sub-screen within Phase 1 (Identity). It renders in the left config panel alongside the phone preview. Changes:

- Remove the internal live preview section (the PhonePreview component handles this now)
- Keep logo upload, color presets, custom colors, description
- Streamline the layout to be single-column (since it's now in a panel, not full-width)
- Remove the `mb-6 p-5 rounded-xl bg-app-elevated/40 border` preview wrapper

**Step 1: Remove the internal preview, streamline layout**

Delete the "Live Preview — Full width, prominent" section (lines 137-171 of current file). The phone mockup component in the right panel provides the live preview now.

Adjust the two-column grid to stack vertically since the panel is narrower:

- Change `grid grid-cols-1 md:grid-cols-2` to just vertical stacking
- Or keep the grid but let it naturally collapse in the narrower panel

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/onboarding/BrandingStep.tsx
git commit -m "refactor(onboarding): remove internal preview from BrandingStep, streamline for panel layout"
```

---

### Task 7: Refactor LaunchStep to support `variant` prop

**Files:**

- Modify: `src/components/onboarding/LaunchStep.tsx`

The LaunchStep now serves two sub-screens:

- `variant="qr"`: QR template + style + text customization
- `variant="summary"`: Summary card + checklist + menu URL + export

**Step 1: Add variant prop and split rendering**

Add `variant?: 'qr' | 'summary'` to `LaunchStepProps`. When `variant="qr"`, show only the QR customization sections (templates, color styles, CTA text). When `variant="summary"`, show the summary card, checklist, menu URL, and the LaunchQR export component.

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS — all variant prop errors now resolved

**Step 3: Commit**

```bash
git add src/components/onboarding/LaunchStep.tsx
git commit -m "feat(onboarding): add variant prop to LaunchStep for QR/summary sub-screens"
```

---

### Task 8: Refactor MenuStep and TablesStep for panel layout

**Files:**

- Modify: `src/components/onboarding/MenuStep.tsx`
- Modify: `src/components/onboarding/TablesStep.tsx`

Both components need minor adjustments:

- **MenuStep**: Remove the internal live preview section (PhonePreview handles this). Keep the category/item builder.
- **TablesStep**: No major changes needed — it already works well. Just ensure padding is consistent.

**Step 1: Remove MenuStep internal preview**

Delete the "Live Preview — Full width, top" section (lines 210-268). The phone mockup in the right panel now shows menu items live.

Also remove the `previewLabel` header since there's no inline preview.

**Step 2: Verify both components**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/onboarding/MenuStep.tsx src/components/onboarding/TablesStep.tsx
git commit -m "refactor(onboarding): remove internal previews from MenuStep, adjust for panel layout"
```

---

### Task 9: Full build verification and fixes

**Files:**

- Potentially any onboarding file that has issues

**Step 1: Run full type check**

Run: `pnpm typecheck`
Expected: PASS (0 errors)

**Step 2: Run linter**

Run: `pnpm lint`
Expected: PASS (0 warnings, 0 errors)

**Step 3: Run build**

Run: `pnpm build`
Expected: PASS — all pages compile successfully

**Step 4: Fix any issues found in steps 1-3**

If any errors or warnings appear, fix them. Common issues to watch for:

- Unused imports (removed preview sections may leave orphaned imports)
- Missing translation keys
- Type mismatches on variant props

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(onboarding): resolve build issues from studio redesign"
```

---

### Task 10: Visual QA and polish

**Files:**

- Any onboarding file needing visual adjustments

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Visual QA checklist**

Navigate to `/onboarding` and verify:

- [ ] Welcome screen: clean, centered, 3 phase icons, accent CTA
- [ ] Top strip: glassmorphism effect, 3 phase pills, progress percentage
- [ ] Phase 1 sub-screen 1: Name + type cards render in panel
- [ ] Phase 1 sub-screen 2: Logo + colors render, phone preview updates live
- [ ] Phase 1 sub-screen 3: Address/phone/config fields
- [ ] Phase 2 sub-screen 1: Table zones
- [ ] Phase 2 sub-screen 2: Menu builder, phone preview shows items
- [ ] Phase 3 sub-screen 1: QR customization
- [ ] Phase 3 sub-screen 2: Summary + launch
- [ ] Phone preview: visible on desktop, hidden on mobile
- [ ] Transitions: smooth slide animations between sub-screens
- [ ] Back/Continue buttons: work correctly, "Continuer" label
- [ ] Loading skeleton: matches new layout
- [ ] Mobile: single column, no phone preview, phase pills still visible

**Step 3: Fix any visual issues**

Common fixes:

- Adjust padding/margins for panel width
- Fix phone preview sizing
- Ensure glassmorphism renders correctly in both themes

**Step 4: Final commit**

```bash
git add -A
git commit -m "style(onboarding): visual polish for studio layout"
```

---

## Summary of changes

| File                    | Action   | Description                                                  |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `page.tsx`              | Rewrite  | 3-phase orchestrator, floating nav strip, split panel layout |
| `PhonePreview.tsx`      | Create   | Live phone mockup component                                  |
| `WelcomeStep.tsx`       | Rewrite  | Minimal, confident welcome screen                            |
| `EstablishmentStep.tsx` | Refactor | Add variant prop for identity/details sub-screens            |
| `BrandingStep.tsx`      | Refactor | Remove internal preview, streamline for panel                |
| `MenuStep.tsx`          | Refactor | Remove internal preview                                      |
| `TablesStep.tsx`        | Minor    | Ensure panel-compatible padding                              |
| `LaunchStep.tsx`        | Refactor | Add variant prop for QR/summary sub-screens                  |
| `LogoCropper.tsx`       | None     | No changes needed                                            |
| Translation files       | Update   | Add phase-related translation keys                           |
