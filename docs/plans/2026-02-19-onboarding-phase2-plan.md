# Onboarding Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the onboarding flow with type-specific fields, article photos, effective language switching, enhanced QR, and 6 UX improvements (animations, validation, auto-save, welcome screen, swipe/keyboard nav, menu preview).

**Architecture:** 13 changes across 8 files, organized into 7 independent tasks that can be parallelized. Each task modifies 1-2 files max. All changes are client-side React components — no API/backend changes. New i18n keys added to all 8 locale files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5 strict, next-intl, Tailwind CSS v4, shadcn/ui, Radix UI Select, qrcode.react, html2canvas, jsPDF

**Worktree:** `/Users/a.g.i.c/Documents/attabl-saas-landing-copy/.claude/worktrees/onboarding-redesign`
**Branch:** `feat/onboarding-redesign-phase1` (PR #9)
**Dev server:** port 3003
**CI:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`

---

## Task 1: OnboardingData type expansion + SelectContent shadow fix

**Files:**

- Modify: `src/app/onboarding/page.tsx:37-62` (OnboardingData interface)
- Modify: `src/app/onboarding/page.tsx:71-91` (initial state defaults)
- Modify: `src/components/ui/select.tsx:78-90` (SelectContent shadow)

**Step 1: Expand OnboardingData type**

In `src/app/onboarding/page.tsx`, update the interface at line 37:

```typescript
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
  qrTemplate: 'standard' | 'chevalet' | 'carte';
  qrStyle: 'classic' | 'branded' | 'inverted' | 'dark';
  qrCta: string;
  qrDescription: string;
  // Tenant info
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}
```

**Step 2: Update initial state defaults**

In same file, update the `useState<OnboardingData>` at line 71:

Add these new defaults alongside existing ones:

```typescript
starRating: undefined,
hasRestaurant: undefined,
hasTerrace: undefined,
hasWifi: undefined,
registerCount: undefined,
hasDelivery: undefined,
totalCapacity: undefined,
qrTemplate: 'standard',
qrStyle: 'branded',
qrCta: 'Scannez pour commander',
qrDescription: '',
```

**Step 3: Remove shadow from SelectContent**

In `src/components/ui/select.tsx`, the `SelectContent` component at line 78 currently has no explicit shadow class, but Radix adds a default shadow via the portal. Add `shadow-none` to the className to force no shadow:

Change line 81 from:

```
'rounded-xl border border-neutral-200 bg-white text-neutral-900',
```

to:

```
'rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-none',
```

**Step 4: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 5: Commit**

```bash
git add src/app/onboarding/page.tsx src/components/ui/select.tsx
git commit -m "feat(onboarding): expand OnboardingData type + remove Select shadow"
```

---

## Task 2: WelcomeStep + step transition animations + auto-save + swipe/keyboard nav (page.tsx)

**Files:**

- Create: `src/components/onboarding/WelcomeStep.tsx`
- Modify: `src/app/onboarding/page.tsx` (step 0 logic, animations, auto-save, swipe, keyboard)

**Step 1: Create WelcomeStep component**

Create `src/components/onboarding/WelcomeStep.tsx`:

```tsx
'use client';

import { Building2, LayoutGrid, Palette, UtensilsCrossed, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  tenantName: string;
  onStart: () => void;
}

const STEPS = [
  { icon: Building2, key: 'stepEstablishment' },
  { icon: LayoutGrid, key: 'stepTables' },
  { icon: Palette, key: 'stepBranding' },
  { icon: UtensilsCrossed, key: 'stepMenu' },
  { icon: Rocket, key: 'stepLaunch' },
] as const;

export function WelcomeStep({ tenantName, onStart }: WelcomeStepProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="bg-[#CCFF00] rounded-2xl p-4 mb-6">
        <Rocket className="h-8 w-8 text-black" />
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 mb-2">
        {t('welcomeTitle', { name: tenantName || '' })}
      </h1>
      <p className="text-neutral-500 text-sm mb-8 max-w-sm">{t('welcomeSubtitle')}</p>

      {/* Step overview */}
      <div className="flex items-center gap-3 mb-8">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-neutral-500" />
                </div>
                <span className="text-[10px] text-neutral-400 font-medium">{t(step.key)}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-neutral-200 mb-5" />}
            </div>
          );
        })}
      </div>

      <Button variant="lime" onClick={onStart}>
        {t('welcomeCTA')}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

**Step 2: Update page.tsx — imports + step 0 + animations + auto-save + swipe + keyboard**

In `src/app/onboarding/page.tsx`:

a) Add imports:

```typescript
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { useRouter } from 'next/navigation';
```

b) Add state for animation direction + auto-save:

```typescript
const router = useRouter();
const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
```

c) Change `currentStep` initial state from `1` to `0`:

```typescript
const [currentStep, setCurrentStep] = useState(0);
```

d) Update `setCurrentStep` call in `fetchOnboardingState` to default to `0` if no saved step:

```typescript
setCurrentStep(state.step || 0);
```

e) Wrap `nextStep` and `prevStep` to set direction:

```typescript
const nextStep = async () => {
  setError(null);
  if (currentStep > 0) await saveStep();
  setDirection('forward');
  if (currentStep < 5) {
    setCurrentStep((prev) => prev + 1);
  }
};

const prevStep = () => {
  setError(null);
  setDirection('backward');
  if (currentStep > 1) {
    setCurrentStep((prev) => prev - 1);
  }
};
```

f) Add auto-save effect after the existing `useEffect`:

```typescript
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
  }, 5000);
  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [data, currentStep, loading]);
```

g) Add swipe + keyboard event handlers:

```typescript
// Keyboard navigation
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight' && currentStep < 5) nextStep();
    if (e.key === 'ArrowLeft' && currentStep > 1) prevStep();
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentStep, saving]);
```

h) Add swipe detection refs and handlers on the step content `<div>`:

```typescript
const touchStartX = useRef(0);

// On the step content container div:
onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
onTouchEnd={(e) => {
  const diff = touchStartX.current - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) {
    if (diff > 0 && currentStep < 5) nextStep();
    if (diff < 0 && currentStep > 1) prevStep();
  }
}}
```

i) Add CSS animation classes on the step content wrapper `<div key={currentStep}>`:

```tsx
<div
  key={currentStep}
  className={`${
    direction === 'forward'
      ? 'animate-in slide-in-from-right-4 fade-in duration-200'
      : 'animate-in slide-in-from-left-4 fade-in duration-200'
  }`}
>
```

j) Add WelcomeStep rendering for step 0:

```tsx
{
  currentStep === 0 && (
    <WelcomeStep
      tenantName={data.tenantName}
      onStart={() => {
        setDirection('forward');
        setCurrentStep(1);
      }}
    />
  );
}
```

k) Update the step badge to hide on step 0:

```tsx
{
  currentStep > 0 && (
    <div className="mb-4">
      <span className="inline-block text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">
        {t('step')} {currentStep} {t('stepOf')} 5
      </span>
    </div>
  );
}
```

l) Update footer to hide on step 0, show auto-save status:

```tsx
{currentStep > 0 && (
  <div className="border-t border-neutral-100 p-4 md:p-6 shrink-0">
    <div className="max-w-xl mx-auto flex items-center justify-between">
      {/* Back button or auto-save status */}
      {currentStep === 1 ? (
        <span className="text-xs text-neutral-400">
          {autoSaveStatus === 'saving' && t('autoSaving')}
          {autoSaveStatus === 'saved' && `✓ ${t('autoSaved')}`}
        </span>
      ) : (
        <button type="button" onClick={prevStep} ...>
          ...existing back button...
        </button>
      )}
      ...existing right side buttons...
    </div>
  </div>
)}
```

m) Update sidebar/mobile step display to account for step 0 (treat step 0 same as step 1 visually).

**Step 3: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 4: Commit**

```bash
git add src/components/onboarding/WelcomeStep.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): add welcome screen, transitions, auto-save, swipe + keyboard nav"
```

---

## Task 3: EstablishmentStep — type-specific fields + language switching

**Files:**

- Modify: `src/components/onboarding/EstablishmentStep.tsx`

**Step 1: Add type-specific field rendering in Details tab**

Replace the current `{activeTab === 'details' && ...}` block with conditional rendering based on `data.establishmentType`:

- **Common to all**: Phone field (always first)
- **restaurant**: Table count (existing stepper), Total capacity (new stepper)
- **hotel**: Room count (reuse stepper with roomCountLabel), Star rating (5 clickable stars), Has restaurant (toggle)
- **bar**: Table count, Terrace toggle
- **cafe**: Seat count (stepper), Wi-Fi toggle
- **fastfood**: Register count (stepper), Delivery toggle
- **other**: Table count (generic)

Toggle component pattern (inline, no new file):

```tsx
<button
  type="button"
  onClick={() => updateData({ hasWifi: !data.hasWifi })}
  className={`relative w-10 h-6 rounded-full transition-colors ${
    data.hasWifi ? 'bg-[#CCFF00]' : 'bg-neutral-200'
  }`}
>
  <div
    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
      data.hasWifi ? 'translate-x-4' : 'translate-x-0'
    }`}
  />
</button>
```

Star rating pattern:

```tsx
<div className="flex gap-1">
  {[1, 2, 3, 4, 5].map((star) => (
    <button
      key={star}
      type="button"
      onClick={() => updateData({ starRating: star })}
      className={`text-lg ${(data.starRating || 0) >= star ? 'text-yellow-400' : 'text-neutral-200'}`}
    >
      ★
    </button>
  ))}
</div>
```

**Step 2: Add language switching with cookie + router.refresh**

In the Preferences tab, update the language `Select` `onValueChange`:

```tsx
import { useRouter } from 'next/navigation';

// Inside component:
const router = useRouter();

// In Select onValueChange:
onValueChange={(val) => {
  updateData({ language: val });
  // Set NEXT_LOCALE cookie (same as dashboard LocaleSwitcher)
  document.cookie = `NEXT_LOCALE=${val};path=/;max-age=${60 * 60 * 24 * 365}`;
  router.refresh();
}}
```

**Step 3: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 4: Commit**

```bash
git add src/components/onboarding/EstablishmentStep.tsx
git commit -m "feat(onboarding): type-specific fields per establishment + language cookie switch"
```

---

## Task 4: BrandingStep — larger logo + inline color picker

**Files:**

- Modify: `src/components/onboarding/BrandingStep.tsx`

**Step 1: Increase logo drop zone to 120x120**

Update the drop zone div:

- Tailwind: `w-[120px] h-[120px]`
- Inline style: `{ width: 120, height: 120, maxWidth: 120, maxHeight: 120 }`

**Step 2: Add inline color picker**

Add a `showPickerFor` state:

```typescript
const [showPickerFor, setShowPickerFor] = useState<'primary' | 'secondary' | null>(null);
```

Extended color palette (nuances):

```typescript
const colorGrid = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#F43F5E',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0D9488',
  '#2563EB',
  '#4F46E5',
  '#9333EA',
  '#DB2777',
  '#E11D48',
  '#000000',
  '#374151',
  '#6B7280',
  '#9CA3AF',
  '#FFFFFF',
];
```

Make the color swatch divs clickable to toggle the picker:

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={() => setShowPickerFor(showPickerFor === 'primary' ? null : 'primary')}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowPickerFor(showPickerFor === 'primary' ? null : 'primary');
    }
  }}
  className="w-10 h-10 rounded-lg border border-neutral-200 shrink-0 cursor-pointer hover:ring-2 hover:ring-neutral-300"
  style={{ backgroundColor: data.primaryColor }}
/>
```

Below the hex input, conditionally render the inline picker:

```tsx
{
  showPickerFor === 'primary' && (
    <div className="mt-2 grid grid-cols-5 gap-1.5">
      {colorGrid.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => {
            updateData({ primaryColor: color });
            setShowPickerFor(null);
          }}
          className={`w-8 h-8 rounded-lg border ${
            data.primaryColor === color
              ? 'ring-2 ring-[#CCFF00] ring-offset-1'
              : 'border-neutral-200'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
```

Same pattern for secondary color.

**Step 3: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 4: Commit**

```bash
git add src/components/onboarding/BrandingStep.tsx
git commit -m "feat(onboarding): larger logo (120px) + inline color picker grid"
```

---

## Task 5: MenuStep — article photos + live preview

**Files:**

- Modify: `src/components/onboarding/MenuStep.tsx`

**Step 1: Add imageUrl to CategoryItem**

Update the `CategoryItem` interface:

```typescript
interface CategoryItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
}
```

Update `buildCategoriesFromData` to include `imageUrl`:

```typescript
items: items.map((item) => ({
  id: crypto.randomUUID(),
  name: item.name,
  price: item.price > 0 ? String(item.price) : '',
  imageUrl: item.imageUrl,
})),
```

Update `syncToParent` to include `imageUrl`:

```typescript
menuItems.push({
  name: item.name,
  price: parseFloat(item.price) || 0,
  category: cat.name,
  imageUrl: item.imageUrl,
});
```

**Step 2: Add photo upload to article rows**

Import `Camera, X` from lucide-react. Add a `useRef` for hidden file inputs.

Each article row becomes:

```tsx
<div key={item.id} className="flex items-center gap-2">
  {/* Photo upload */}
  <div className="relative shrink-0">
    <input
      type="file"
      accept="image/*"
      className="hidden"
      id={`photo-${item.id}`}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 1024 * 1024) return;
        const url = URL.createObjectURL(file);
        updateArticle(category.id, item.id, 'imageUrl', url);
      }}
    />
    {item.imageUrl ? (
      <div className="relative w-8 h-8">
        <img src={item.imageUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
        <button
          type="button"
          onClick={() => updateArticle(category.id, item.id, 'imageUrl', '')}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
        >
          <X className="h-2.5 w-2.5 text-white" />
        </button>
      </div>
    ) : (
      <label
        htmlFor={`photo-${item.id}`}
        className="w-8 h-8 rounded-md border border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-neutral-400"
      >
        <Camera className="h-3.5 w-3.5 text-neutral-400" />
      </label>
    )}
  </div>
  {/* ...existing name input, price input, delete button... */}
</div>
```

Update `updateArticle` to accept `'imageUrl'` field:

```typescript
const updateArticle = (
  categoryId: string,
  itemId: string,
  field: 'name' | 'price' | 'imageUrl',
  value: string,
) => { ... };
```

**Step 3: Add live menu preview at top**

Above the categories list, add a preview card:

```tsx
{
  /* Live Menu Preview */
}
<div className="border border-neutral-200 rounded-xl p-3 bg-neutral-50 mb-4">
  <p className="text-[10px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wide">
    {t('previewLabel')}
  </p>
  <div className="p-2 rounded-lg" style={{ backgroundColor: data.secondaryColor }}>
    {categories.slice(0, 2).map((cat) => (
      <div key={cat.id} className="mb-2 last:mb-0">
        {cat.name && (
          <p className="text-[10px] font-bold mb-1" style={{ color: data.primaryColor }}>
            {cat.name}
          </p>
        )}
        {cat.items
          .slice(0, 3)
          .filter((i) => i.name)
          .map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="" className="w-4 h-4 rounded-sm object-cover" />
                )}
                <span className="text-[10px]" style={{ color: data.primaryColor }}>
                  {item.name}
                </span>
              </div>
              {parseFloat(item.price) > 0 && (
                <span className="text-[10px] font-medium" style={{ color: data.primaryColor }}>
                  {item.price} {data.currency}
                </span>
              )}
            </div>
          ))}
      </div>
    ))}
  </div>
</div>;
```

Note: `data.primaryColor`, `data.secondaryColor`, and `data.currency` come from the `MenuStepProps` via `data`.

**Step 4: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 5: Commit**

```bash
git add src/components/onboarding/MenuStep.tsx
git commit -m "feat(onboarding): article photo uploads + live menu preview"
```

---

## Task 6: LaunchStep — enhanced QR with sub-tabs + remove trial reminder

**Files:**

- Modify: `src/components/onboarding/LaunchStep.tsx`
- Modify: `src/components/qr/LaunchQR.tsx`

**Step 1: Update LaunchStep to pass QR config and remove trial reminder**

a) Add sub-tabs and QR config state to `LaunchStep`:

- Accept `updateData` prop (change interface to include it)
- Remove the `{/* Trial Info */}` block at the bottom
- Add sub-tab navigation: "Style", "Texte", "Export"

b) LaunchStep becomes:

```tsx
interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}
```

The summary card + URL section stays. Below that, add sub-tabs:

```tsx
type LaunchTab = 'style' | 'text' | 'export';
const [activeTab, setActiveTab] = useState<LaunchTab>('style');
```

**Style tab**: 3 template thumbnails (Standard, Chevalet, Carte) as clickable cards + 4 color style buttons (existing from LaunchQR).

**Text tab**: CTA presets as clickable chips + custom text input + description textarea.

**Export tab**: QR preview + Download PDF/PNG buttons.

**Step 2: Extend LaunchQR to accept template + CTA config**

Update `LaunchQRProps`:

```typescript
interface LaunchQRProps {
  url: string;
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  template?: 'standard' | 'chevalet' | 'carte';
  qrStyle?: string;
  ctaText?: string;
  descriptionText?: string;
  onDownload?: () => void;
}
```

The QR preview renders differently based on `template`:

- `standard`: Current vertical layout (QR centered)
- `chevalet`: Portrait format with accent background
- `carte`: Landscape business card format

Use simplified inline rendering (not importing the full dashboard templates which require `QRDesignConfig`). Keep it lightweight.

**Step 3: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 4: Commit**

```bash
git add src/components/onboarding/LaunchStep.tsx src/components/qr/LaunchQR.tsx
git commit -m "feat(onboarding): enhanced QR with templates/CTA sub-tabs, remove redundant trial info"
```

---

## Task 7: i18n — add new translation keys to all 8 locale files

**Files:**

- Modify: `src/messages/fr-FR.json` (and propagate to 7 other locale files)

**Step 1: Add new keys to the `onboarding` namespace**

New keys needed:

```json
{
  "welcomeTitle": "Bienvenue{name, select, other { {name}} }!",
  "welcomeSubtitle": "Configurons votre espace en quelques minutes",
  "welcomeCTA": "C'est parti",
  "autoSaving": "Sauvegarde...",
  "autoSaved": "Sauvegardé",
  "totalCapacity": "Capacité totale",
  "starRating": "Étoiles",
  "hasRestaurant": "Restaurant intégré",
  "hasTerrace": "Terrasse",
  "hasWifi": "Wi-Fi",
  "registerCount": "Nombre de caisses",
  "hasDelivery": "Livraison",
  "seatCount": "Nombre de places",
  "qrStyleTab": "Style",
  "qrTextTab": "Texte",
  "qrExportTab": "Export",
  "qrTemplateStandard": "Standard",
  "qrTemplateChevalet": "Chevalet",
  "qrTemplateCarte": "Carte",
  "qrCtaLabel": "Texte d'appel",
  "qrCtaScan": "Scannez pour commander",
  "qrCtaMenu": "Scannez pour voir le menu",
  "qrCtaDiscover": "Scannez pour découvrir",
  "qrCtaCard": "Scannez notre carte",
  "qrDescriptionLabel": "Description",
  "downloadPDF": "Télécharger PDF",
  "downloadPNG": "Télécharger PNG",
  "articlePhoto": "Photo"
}
```

**Step 2: Add English translations to en-US.json (and propagate to en-GB, en-AU, en-CA, en-IE)**

```json
{
  "welcomeTitle": "Welcome{name, select, other { {name}}}!",
  "welcomeSubtitle": "Let's set up your space in a few minutes",
  "welcomeCTA": "Let's go",
  "autoSaving": "Saving...",
  "autoSaved": "Saved",
  "totalCapacity": "Total capacity",
  "starRating": "Stars",
  "hasRestaurant": "Integrated restaurant",
  "hasTerrace": "Terrace",
  "hasWifi": "Wi-Fi",
  "registerCount": "Number of registers",
  "hasDelivery": "Delivery",
  "seatCount": "Number of seats",
  "qrStyleTab": "Style",
  "qrTextTab": "Text",
  "qrExportTab": "Export",
  "qrTemplateStandard": "Standard",
  "qrTemplateChevalet": "Easel",
  "qrTemplateCarte": "Business card",
  "qrCtaLabel": "Call to action",
  "qrCtaScan": "Scan to order",
  "qrCtaMenu": "Scan to view menu",
  "qrCtaDiscover": "Scan to discover",
  "qrCtaCard": "Scan our menu",
  "qrDescriptionLabel": "Description",
  "downloadPDF": "Download PDF",
  "downloadPNG": "Download PNG",
  "articlePhoto": "Photo"
}
```

**Step 3: Add Spanish translations to es-ES.json**

**Step 4: Add French-Canadian to fr-CA.json** (same as fr-FR)

**Step 5: Run CI**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Step 6: Commit**

```bash
git add src/messages/
git commit -m "feat(onboarding): add Phase 2 i18n keys across all 8 locales"
```

---

## Task 8: Visual validation indicators (page.tsx + step components)

**Files:**

- Modify: `src/app/onboarding/page.tsx`

**Step 1: Add validation logic**

Add a `stepIsComplete` function:

```typescript
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
```

**Step 2: Apply muted opacity to Continue button when step incomplete**

```tsx
<Button
  variant="lime"
  onClick={nextStep}
  disabled={saving}
  className={!stepIsComplete(currentStep) ? 'opacity-60' : ''}
>
```

**Step 3: Run CI, commit**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
git add src/app/onboarding/page.tsx
git commit -m "feat(onboarding): visual validation indicators on Continue button"
```

---

## Final Step: Full CI + push

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
git push
```

---

## Parallelization Strategy

These tasks can be executed in parallel groups:

**Group A (independent):**

- Task 1 (types + select shadow) — MUST be first, others depend on expanded types
- Task 7 (i18n) — can run in parallel with Task 1

**Group B (after Task 1):**

- Task 2 (page.tsx: welcome + animations + auto-save + nav)
- Task 3 (EstablishmentStep: type-specific + language)
- Task 4 (BrandingStep: logo + color picker)
- Task 5 (MenuStep: photos + preview)
- Task 6 (LaunchStep: enhanced QR)
- Task 8 (validation indicators)

All tasks in Group B touch different files and can run in parallel.
