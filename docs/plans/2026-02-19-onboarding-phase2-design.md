# Onboarding Phase 2 - Design Document

**Date**: 2026-02-19
**Branch**: `feat/onboarding-redesign-phase1` (PR #9)
**Status**: Approved by user

## Context

Phase 1 delivered the complete 5-step onboarding redesign with i18n, sub-tabs, and minimalist UI. User tested on iPad and approved the direction. This phase addresses remaining UX feedback and adds feature depth.

## Scope

13 changes total: 4 quick fixes + 4 complex features + 5 UX suggestions.

---

## Section 1: Quick Fixes

### 1A. Logo drop zone larger (BrandingStep)

- **Current**: 100x100px
- **Target**: 120x120px
- **Files**: `src/components/onboarding/BrandingStep.tsx`
- Update both Tailwind classes (`w-[120px] h-[120px]`) and inline styles (`width: 120, height: 120, maxWidth: 120, maxHeight: 120`)

### 1B. Remove redundant trial reminder (LaunchStep)

- **Current**: "14 jours d'essai gratuit" appears in sidebar footer AND bottom of LaunchStep
- **Action**: Remove the `<div className="mt-4 p-3 ...">` block at bottom of LaunchStep
- **Files**: `src/components/onboarding/LaunchStep.tsx`

### 1C. Inline color picker (BrandingStep)

- **Current**: Color swatches are static divs (no way to pick custom colors beyond presets + hex input)
- **Target**: When user clicks the color swatch div, expand an inline panel below it with a grid of color nuances (not the OS popup). Similar to dashboard's `ColorPicker.tsx` pattern: preset swatches + hex input.
- **Implementation**: Create a lightweight `InlineColorPicker` component that renders a grid of ~20 color options inline (not floating). Clicking the swatch toggles visibility. No `<input type="color">` anywhere.
- **Files**: `src/components/onboarding/BrandingStep.tsx` (new inline component)

### 1D. Uniform dropdown style (global)

- **Issue**: User wants ALL dropdowns to look like the Select in Preferences (clean, non-floating feel)
- **Current**: `SelectContent` uses portal rendering with shadow. The "Changer" button for logo is a native file input (not a dropdown at all).
- **Action**:
  - In `src/components/ui/select.tsx`: reduce or remove shadow on `SelectContent`, keep the clean border style
  - The "Changer" button in BrandingStep triggers a native file picker dialog (OS-level, can't be styled). This is acceptable since it's a file picker, not a dropdown menu. No change needed here.
- **Files**: `src/components/ui/select.tsx`

---

## Section 2: Complex Features

### 2A. Type-specific fields (EstablishmentStep)

When the user selects an establishment type, the "Details" sub-tab shows different fields:

| Type           | Fields                                                         |
| -------------- | -------------------------------------------------------------- |
| **restaurant** | Phone, Table count, Total capacity                             |
| **hotel**      | Phone, Room count, Stars (1-5), Integrated restaurant (yes/no) |
| **bar**        | Phone, Table count, Terrace (yes/no)                           |
| **cafe**       | Phone, Seat count, Wi-Fi (yes/no)                              |
| **fastfood**   | Phone, Register count, Delivery (yes/no)                       |
| **other**      | Phone, Table count (generic)                                   |

**Data model changes** (`OnboardingData`):

```typescript
// New optional fields
starRating?: number;        // hotel: 1-5
hasRestaurant?: boolean;    // hotel
hasTerrace?: boolean;       // bar
hasWifi?: boolean;          // cafe
registerCount?: number;     // fastfood
hasDelivery?: boolean;      // fastfood
totalCapacity?: number;     // restaurant
```

**UI**: Boolean fields render as toggle switches. Star rating renders as 5 clickable stars. Number fields use the existing stepper pattern.

**Files**:

- `src/app/onboarding/page.tsx` (OnboardingData type)
- `src/components/onboarding/EstablishmentStep.tsx` (conditional rendering in Details tab)

### 2B. Article photos (MenuStep)

Each menu article gets an optional photo upload button.

**Layout per article row**:

```
[32x32 photo] [Article name input] [Price input] [Currency] [Delete]
```

- If no photo: show a small camera icon placeholder (32x32, dashed border)
- Click to upload via hidden `<input type="file">`
- Photo stored as `URL.createObjectURL()` (local blob, not uploaded to Supabase during onboarding)
- Max size: 1MB per photo

**Data model changes**:

```typescript
// CategoryItem gains imageUrl
interface CategoryItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string; // NEW
}

// OnboardingData menuItems gains imageUrl
menuItems: Array<{ name: string; price: number; category: string; imageUrl?: string }>;
```

**Files**:

- `src/components/onboarding/MenuStep.tsx`
- `src/app/onboarding/page.tsx` (OnboardingData type)

### 2C. Language/currency effective switching

**Language**: When user changes language in Preferences tab:

1. Set `NEXT_LOCALE` cookie (same as dashboard's `LocaleSwitcher`)
2. Call `router.refresh()` to reload with new locale
3. The entire onboarding UI re-renders in the selected language

**Currency**: Already works — `data.currency` is read by MenuStep for the price suffix. During `completeOnboarding()`, all data is saved to the tenant record including currency. Just need to verify the API route propagates currency to the tenant settings.

**Files**:

- `src/components/onboarding/EstablishmentStep.tsx` (add cookie + router.refresh on language change)

### 2D. Enhanced QR in LaunchStep

Replace the current simple QR component with a richer version using sub-tabs:

**Sub-tab "Style"**:

- 3 free templates as clickable miniatures: Standard, Chevalet, Carte
- 4 color styles already present (classic, branded, inverted, dark)

**Sub-tab "Texte"**:

- CTA preset buttons: "Scannez pour commander", "Scannez pour voir le menu", "Scannez pour decouvrir", "Scannez notre carte"
- Custom text input field
- Description text field

**Sub-tab "Export"**:

- Download PDF button
- Download PNG button
- QR preview with selected template

**Also**: Remove the redundant trial reminder block (covered in 1B).

**Files**:

- `src/components/onboarding/LaunchStep.tsx` (major rewrite)
- `src/components/qr/LaunchQR.tsx` (extend to accept template + CTA config)
- May reuse template components from `src/components/qr/templates/`

---

## Section 3: UX Suggestions

### 3A. Step transition animations

- CSS-only slide animation when navigating between steps
- Content slides out left, new content slides in from right (forward)
- Reverse direction when going back
- Duration: 200ms ease-out
- Implementation: CSS `@keyframes` + conditional class on the step content wrapper

**Files**: `src/app/onboarding/page.tsx` (add animation classes + state tracking for direction)

### 3B. Visual validation indicators

- Required fields get a subtle green border when filled
- "Continuer" button shows a muted state (lower opacity) when required fields are empty — but remains clickable
- Sidebar step icons show a small dot indicator for completion percentage
- Non-blocking: user can always proceed

**Files**:

- `src/app/onboarding/page.tsx` (button opacity logic)
- Step components (border color logic on required fields)

### 3C. Auto-save with indicator

- Debounced auto-save: 5 seconds after last change
- Small "Sauvegarde..." / "Sauvegarde ok" text in the footer area (left side, where back button is on step 1)
- Uses the existing `saveStep()` function
- `useEffect` with debounce on `data` changes

**Files**: `src/app/onboarding/page.tsx` (add debounced save effect + indicator UI)

### 3D. Welcome screen before Step 1

- Displayed when `currentStep === 0` (new initial state)
- Content: "Bienvenue [Prenom]! Configurons votre espace en quelques minutes."
- Shows 5 step icons in a row with labels
- Single CTA button: "C'est parti" → sets step to 1
- Fetches user name from auth session

**Files**:

- `src/app/onboarding/page.tsx` (step 0 logic + WelcomeStep rendering)
- `src/components/onboarding/WelcomeStep.tsx` (new component)

### 3E. Swipe + keyboard navigation

- **Tablet**: Touch swipe left/right on the content area triggers next/prev step
- **Desktop**: Arrow keys Left/Right navigate between steps
- Uses `onTouchStart`/`onTouchEnd` for swipe detection (no library needed)
- Uses `useEffect` with `keydown` listener for arrow keys
- Respects same validation logic as button clicks

**Files**: `src/app/onboarding/page.tsx` (event listeners)

### 3F. Live menu preview (MenuStep)

- Small preview card at the top of MenuStep (similar to BrandingStep preview)
- Shows the first 2-3 articles with their photos, names, and prices
- Uses branding colors from `data.primaryColor` / `data.secondaryColor`
- Updates live as user types

**Files**: `src/components/onboarding/MenuStep.tsx` (add preview section)

---

## Files Impact Summary

| File                                              | Changes                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/onboarding/page.tsx`                     | OnboardingData type + welcome step + animations + auto-save + keyboard/swipe + validation |
| `src/components/onboarding/EstablishmentStep.tsx` | Type-specific fields + language cookie switch                                             |
| `src/components/onboarding/BrandingStep.tsx`      | Larger logo + inline color picker                                                         |
| `src/components/onboarding/MenuStep.tsx`          | Article photos + live preview                                                             |
| `src/components/onboarding/LaunchStep.tsx`        | Enhanced QR with sub-tabs + remove trial reminder                                         |
| `src/components/onboarding/WelcomeStep.tsx`       | NEW - welcome screen                                                                      |
| `src/components/qr/LaunchQR.tsx`                  | Extend for templates + CTA                                                                |
| `src/components/ui/select.tsx`                    | Remove/reduce shadow on SelectContent                                                     |

## Responsive Priority

All changes must be optimized for **iPad first**, then desktop. No scrolling within step content — use sub-tabs pattern when content overflows.

## Non-Goals

- No Supabase storage uploads during onboarding (photos stay as local blobs)
- No premium QR templates in onboarding (only free: standard, chevalet, carte)
- No breaking changes to existing dashboard features
