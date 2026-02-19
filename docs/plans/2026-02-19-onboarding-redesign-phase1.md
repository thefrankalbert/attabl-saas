# Onboarding Redesign Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the 5-step onboarding flow with Kastamer-inspired sidebar layout, ATTABL design charter, tablet responsiveness, expanded color picker, multi-category menu form, and bug fixes.

**Architecture:** Pure visual/UX refactor of existing components. No new DB schema, no new API endpoints. Each step component is self-contained, so steps 1-5 can be redesigned independently after the shared layout (page.tsx) is done first. i18n added across all components with a new `onboarding` namespace in 8 locale files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, Lucide React, next-intl, Framer Motion (existing).

**Design doc:** `docs/plans/2026-02-19-onboarding-redesign-phase1-design.md`

**CI gates:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`

---

## Task 1: i18n Foundation — Create `onboarding` namespace in all 8 locale files

**Files:**

- Modify: `src/messages/fr-FR.json`
- Modify: `src/messages/fr-CA.json`
- Modify: `src/messages/en-US.json`
- Modify: `src/messages/en-GB.json`
- Modify: `src/messages/en-AU.json`
- Modify: `src/messages/en-CA.json`
- Modify: `src/messages/en-IE.json`
- Modify: `src/messages/es-ES.json`

**What to do:**

Add an `"onboarding"` namespace at the end of each locale file (before the closing `}`) with ALL keys needed across the 5 steps + the page layout. This must be done FIRST so all subsequent tasks can use `t()` calls immediately.

**Keys needed (minimum — add more as you discover hardcoded strings):**

Layout keys: `step`, `stepOf`, `next`, `back`, `skip`, `launchButton`, `trialReminder`

Step labels: `stepEstablishment`, `stepEstablishmentDesc`, `stepTables`, `stepTablesDesc`, `stepBranding`, `stepBrandingDesc`, `stepMenu`, `stepMenuDesc`, `stepLaunch`, `stepLaunchDesc`

Step 1: `establishmentTitle`, `establishmentSubtitle`, `nameLabel`, `namePlaceholder`, `typeRestaurant`, `typeRestaurantDesc`, `typeHotel`, `typeHotelDesc`, `typeBar`, `typeBarDesc`, `typeCafe`, `typeCafeDesc`, `typeFastfood`, `typeFastfoodDesc`, `typeOther`, `typeOtherDesc`, `addressLabel`, `cityLabel`, `countryLabel`, `phoneLabel`, `tableCountLabel`, `roomCountLabel`

Step 2: `tablesTitle`, `tablesSubtitle`, `modeComplete`, `modeCompleteDesc`, `modeMinimum`, `modeMinimumDesc`, `modeSkip`, `modeSkipDesc`, `zoneName`, `zonePrefix`, `zoneTableCount`, `zoneCapacity`, `addZone`, `deleteZone`, `tablePreview`, `skipInfo`

Step 3: `brandingTitle`, `brandingSubtitle`, `logoLabel`, `logoUpload`, `logoDelete`, `colorPresetsLabel`, `customColorsLabel`, `primaryColor`, `secondaryColor`, `descriptionLabel`, `descriptionPlaceholder`, `previewLabel`, `charCount`

Step 4: `menuTitle`, `menuSubtitle`, `addCategory`, `categoryNamePlaceholder`, `addArticle`, `articleNamePlaceholder`, `articlePrice`, `deleteCategory`, `deleteArticle`, `menuTip`, `maxCategories`, `maxArticles`

Step 5: `launchTitle`, `launchSubtitle`, `summaryTitle`, `checkAccountCreated`, `checkIdentityConfigured`, `checkTablesConfigured`, `checkBrandingCustomized`, `checkMenuInitialized`, `menuUrl`, `copyUrl`, `qrCodeTitle`, `downloadQR`, `launchCTA`

Toasts: `saveError`, `saveSuccess`, `completeError`

**Verification:** `pnpm typecheck` (locale files are JSON, no TS impact — just verify valid JSON with `node -e "JSON.parse(require('fs').readFileSync('src/messages/en-US.json','utf8'))"`)

**Commit:** `feat(onboarding): add i18n namespace with ~80 keys across 8 locale files`

---

## Task 2: Redesign page layout — `page.tsx`

**Files:**

- Modify: `src/app/onboarding/page.tsx` (380 lines — major rewrite)

**Reference:** Read `src/components/admin/Sidebar.tsx` for existing sidebar patterns in the app.

**What to do:**

Replace the entire layout structure. The current layout has:

- Dark sidebar (`bg-neutral-900 rounded-[2rem]`) hidden below `lg`
- Mobile: thin progress bar + step title
- Content: `max-w-2xl`

Replace with:

- Light sidebar (`bg-neutral-50 border-r border-neutral-100`) visible at `md+`
- Desktop (`lg+`): `w-72`, icons + titles + descriptions
- Tablet (`md`): `w-56`, icons + titles only (no descriptions)
- Mobile (`< md`): horizontal step bar at top (5 circles + connecting lines)
- Content: `max-w-xl` on desktop/tablet, full-width on mobile

**Sidebar step item design:**

```
32px circle icon → lime bg + Check icon (completed)
                 → neutral-900 bg + step icon (active)
                 → neutral-200 bg + step icon (future)
Vertical connecting line: 2px wide, lime if completed, neutral-200 if not
```

Step icons to use: `Building2` (step 1), `LayoutGrid` (step 2), `Palette` (step 3), `UtensilsCrossed` (step 4), `Rocket` (step 5)

**Add `useTranslations('onboarding')`** — replace all hardcoded strings.

**Fix bug:** `saveStep` error handling — add toast on failure instead of silent `console.error`.

**Fix bug:** Country default — change `'Cameroun'` to match the service default (or vice versa — align both).

**Footer nav:** `border-t border-neutral-100`, Back button (`variant="outline"`), Continue/Launch button (`variant="lime"`).

**Verification:** `pnpm typecheck && pnpm build` (page renders at `/onboarding`)

**Commit:** `feat(onboarding): redesign page layout with Kastamer-inspired sidebar`

---

## Task 3: Redesign EstablishmentStep

**Files:**

- Modify: `src/components/onboarding/EstablishmentStep.tsx` (153 lines)

**What to do:**

1. Add `useTranslations('onboarding')` — replace all hardcoded French strings
2. Add "Nom de l'etablissement" field as the first input. Value: `data.tenantName`. On change: `updateData({ tenantName: value })`
3. Replace emoji grid with Lucide icon grid:
   - Change from `grid-cols-3 md:grid-cols-6` to `grid-cols-2 sm:grid-cols-3 gap-3`
   - Each tile: Lucide icon + title + 1-line description
   - Icons: `UtensilsCrossed`, `Hotel`, `Wine`, `Coffee`, `Flame`, `Building2`
   - Selected: `border-[#CCFF00] bg-[#CCFF00]/5`, unselected: `border-neutral-200`
   - All tiles: `rounded-xl p-4`
4. Replace raw number input for table count with stepper component:
   - Minus button, centered number display, plus button
   - Min 1, max 500
   - Styled: `rounded-xl border border-neutral-200`
5. Conditional label: if `data.establishmentType === 'hotel'`, show "Nombre de chambres" instead of "Nombre de tables"
6. Labels: `text-sm font-medium text-neutral-700`
7. Inputs: `rounded-xl border-neutral-200`

**Verification:** `pnpm typecheck && pnpm build`

**Commit:** `feat(onboarding): redesign establishment step with Lucide icons and stepper`

---

## Task 4: Restyle TablesStep

**Files:**

- Modify: `src/components/onboarding/TablesStep.tsx` (374 lines)

**What to do:**

1. Add `useTranslations('onboarding')`
2. Restyle mode selector cards: `grid-cols-1 sm:grid-cols-3 gap-3`, Lucide icons (Settings, Zap, Clock), lime border when selected
3. Mode "complete" — zone cards:
   - Flat card: `border border-neutral-200 rounded-xl p-4`
   - Fields in `grid grid-cols-2 gap-3`
   - Replace HTML `<select>` for capacity with shadcn `<Select>` component
   - Remove any animation/overlay behavior — zones always rendered flat
   - Table preview chips: monospace, `bg-neutral-100 rounded px-2 py-0.5 text-xs`
4. Mode "minimum" — same but simpler (name + count per row)
5. Mode "skip" — info card with `bg-neutral-50 rounded-xl p-4`
6. All inputs: `rounded-xl border-neutral-200`

**Verification:** `pnpm typecheck && pnpm build`

**Commit:** `feat(onboarding): restyle tables step with flat cards and shadcn Select`

---

## Task 5: Redesign BrandingStep

**Files:**

- Modify: `src/components/onboarding/BrandingStep.tsx` (243 lines)

**What to do:**

1. Add `useTranslations('onboarding')`
2. Logo upload — replace simple button with drop zone:
   - `border-2 border-dashed border-neutral-300 rounded-xl` container (120x120)
   - Upload icon + "Glissez ou cliquez" text when empty
   - Image preview with overlay delete button when set
   - Keep `createObjectURL` for preview (add `// TODO: Phase 2 — upload to Supabase Storage`)
3. Color presets — expand from 6 to 16:
   - Grid: `grid-cols-4 sm:grid-cols-8 gap-2`
   - Each preset: small card showing primary circle on secondary background
   - Selected: `ring-2 ring-[#CCFF00] ring-offset-2`
   - Add presets: Gold, Rose, Teal, Slate, Coral, Navy, Mint, Wine, Charcoal, Custom
   - "Custom" tile has gradient background, clicking it scrolls to custom section
4. Custom color section:
   - `grid grid-cols-2 gap-4`
   - Each: `<input type="color">` styled 48x48 `rounded-xl` + hex text input
   - Always visible
5. Description textarea: 3 rows, max 500 chars, add character counter (`text-xs text-neutral-400`)
6. Live preview: card with `border border-neutral-200 rounded-xl` showing branding applied

**Verification:** `pnpm typecheck && pnpm build`

**Commit:** `feat(onboarding): redesign branding step with 16 color presets and drop zone`

---

## Task 6: Rewrite MenuStep

**Files:**

- Modify: `src/components/onboarding/MenuStep.tsx` (153 lines — complete rewrite)

**What to do:**

This is a **complete rewrite**. The current form has 1 category + 5 items with broken state restore.

New design: multi-category accordion.

1. Add `useTranslations('onboarding')`
2. Local state shape:
   ```typescript
   interface Category {
     id: string; // crypto.randomUUID()
     name: string;
     expanded: boolean;
     items: Array<{ id: string; name: string; price: string }>;
   }
   const [categories, setCategories] = useState<Category[]>([]);
   ```
3. **Initialize from parent state on mount:** Group `data.menuItems` by `category` to reconstruct categories. If empty, start with one empty category.
4. Sync to parent on every change: flatten categories to `menuItems` array, set `menuOption: categories.length > 0 ? 'manual' : 'skip'`
5. UI:
   - "Ajouter une categorie" dashed button (max 5)
   - Each category = card (`border border-neutral-200 rounded-xl`):
     - Header: click to toggle expand. Shows: chevron + category name input + article count badge + delete button
     - Body (when expanded): article rows (name + price + delete) + "Ajouter un article" button (max 10)
   - Tip card at bottom
6. Limits: max 5 categories, max 10 articles per category
7. Article price: number input with `min="0" step="0.01"`, suffix "EUR" displayed as text

**Verification:** `pnpm typecheck && pnpm build`

**Commit:** `feat(onboarding): rewrite menu step with multi-category accordion`

---

## Task 7: Fix LaunchStep

**Files:**

- Modify: `src/components/onboarding/LaunchStep.tsx` (118 lines)
- Modify: `src/components/qr/LaunchQR.tsx` (105 lines)

**What to do:**

1. Add `useTranslations('onboarding')`
2. Fix checklist bug: change `data.menuOption !== 'skip' || true` to `data.menuOption !== 'skip'`
3. Fix "Tables configurees" checklist: change from `done: true` (hardcoded) to `done: data.tableConfigMode !== 'skip'`
4. Apply branding to QR code: pass `primaryColor` as `fgColor` prop to `QRCodeSVG`
5. Add copy-to-clipboard button for menu URL
6. CTA button: `variant="lime"`, full width
7. Summary card: use `data.primaryColor` for accent borders/badges
8. Restyle with ATTABL charter: `rounded-xl`, no shadows, `border-neutral-200`

**Verification:** `pnpm typecheck && pnpm build`

**Commit:** `feat(onboarding): fix launch step checklist bugs and apply branding to QR`

---

## Task 8: Final CI verification + commit

**What to do:**

1. Run full CI pipeline: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
2. Fix any lint/format issues (`pnpm format` to auto-fix)
3. Visual check: confirm the onboarding renders at `http://localhost:3000/onboarding` (via the dev reset route)
4. Final commit if any formatting fixes needed

**Verification:** All 5 CI gates pass. 201+ tests pass. Build succeeds.

**Commit:** `fix(onboarding): lint and format fixes` (if needed)

---

## Execution Strategy

**Tasks 1 must be done first** (i18n keys needed by all other tasks).

**Task 2 must be done second** (layout change affects all step components).

**Tasks 3, 4, 5, 6, 7 can be parallelized** (independent step components).

**Task 8 is the final verification.**

Dependency graph:

```
Task 1 (i18n) → Task 2 (layout) → Tasks 3+4+5+6+7 (parallel) → Task 8 (CI)
```
