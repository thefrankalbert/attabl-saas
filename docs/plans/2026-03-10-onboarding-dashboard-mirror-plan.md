# Onboarding "Dashboard Mirror" Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the dashboard admin's visual language (cards, spacing, typography, icons) to the entire onboarding flow for a premium, cohesive experience.

**Architecture:** Visual-only refonte — same logic, same data flow, same API calls. Only CSS classes, layout structure, and spacing change. 8 files modified.

**Tech Stack:** Tailwind CSS v4 (OKLCH tokens), React 19, Next.js 16, Lucide icons, shadcn/ui

**Design doc:** `docs/plans/2026-03-10-onboarding-dashboard-mirror-design.md`

---

## Key Design Patterns to Apply

**Dashboard card pattern:**

```html
<div class="bg-app-card border border-app-border rounded-xl p-5">
  <p class="text-[10px] font-bold uppercase tracking-widest text-app-text-muted mb-4">LABEL</p>
  <!-- content -->
</div>
```

**Dashboard input pattern:**

```html
<label class="text-sm font-medium text-app-text-secondary mb-1.5 block">Label</label>
<input
  class="h-10 bg-app-elevated border border-app-border rounded-lg px-3 text-sm text-app-text"
/>
```

**Dashboard selector button pattern:**

```html
<button
  class="rounded-lg border border-app-border p-3 text-center hover:border-app-border-hover transition-colors"
>
  <!-- active state: border-accent bg-accent/5 -->
</button>
```

---

### Task 1: Rewrite page.tsx layout (sidebar, mobile header, content, footer)

**Files:**

- Modify: `src/app/onboarding/page.tsx`

**Changes:**

1. **Sidebar** — Remove connecting lines between steps. Change step icons from `w-7 h-7` to `w-8 h-8 rounded-lg`. Remove `relative` wrapper and line divs. Simplify active state to `bg-app-elevated/50`. Keep width `w-56 lg:w-[224px]`.

2. **Mobile header** — Remove the entire step pills section (the `flex items-center justify-center gap-0` div with STEP_ICONS mapping). Keep only: logo row + progress bar.

3. **Content area** — Change padding from `px-4 sm:px-5 md:px-6 lg:px-8 py-4 sm:py-5 md:py-6` to `px-6 lg:px-8 py-6`. Change max-width from `max-w-5xl` to `max-w-4xl`.

4. **Footer** — Remove auto-save status text from step 1 left side. Replace with same back button as other steps (or empty span). Keep progress bar, dots, and buttons. Change all button `rounded-xl` to `rounded-lg`.

**Step 1:** Rewrite the sidebar section — remove connecting lines, adjust icon sizes to w-8 h-8

**Step 2:** Simplify mobile header — remove step pill icons, keep only logo + progress bar

**Step 3:** Update content area padding and max-width

**Step 4:** Simplify footer — remove auto-save text, unify button radius to rounded-lg

**Step 5:** Run `pnpm typecheck && pnpm lint`

**Step 6:** Commit: `feat(onboarding): rewrite page layout to match dashboard patterns`

---

### Task 2: Rewrite WelcomeStep

**Files:**

- Modify: `src/components/onboarding/WelcomeStep.tsx`

**Changes:**

Replace the 5-column card grid with a single card containing a vertical list:

```tsx
<div className="bg-app-card border border-app-border rounded-xl p-5 w-full max-w-sm">
  <p className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
    {t('welcomeStepsOverview')} {/* or inline "ETAPES" */}
  </p>
  <div className="space-y-3">
    {STEPS.map((step, i) => {
      const Icon = step.icon;
      return (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-app-elevated flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-app-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-medium text-app-text">{t(step.key)}</p>
            <p className="text-[11px] text-app-text-muted">{t(step.desc)}</p>
          </div>
        </div>
      );
    })}
  </div>
</div>
```

Change CTA button from `rounded-xl` to `rounded-lg`.

**Step 1:** Replace grid with vertical list card

**Step 2:** Update CTA button radius

**Step 3:** Run `pnpm typecheck && pnpm lint`

**Step 4:** Commit: `feat(onboarding): rewrite WelcomeStep with dashboard card pattern`

---

### Task 3: Rewrite EstablishmentStep

**Files:**

- Modify: `src/components/onboarding/EstablishmentStep.tsx`

**Changes:**

1. **Title** — Change from `text-2xl` to `text-lg font-bold text-app-text`. Subtitle: `text-sm text-app-text-secondary mb-6`.

2. **Grid** — Change `gap-x-10 gap-y-8` to `gap-6`.

3. **Left column** — Wrap in dashboard card:
   - Section label `text-[10px] font-bold uppercase tracking-widest text-app-text-muted mb-4` for "INFORMATIONS"
   - All inputs: change `rounded-xl` to `rounded-lg`
   - Type selector: change `rounded-xl` to `rounded-lg`, change `gap-1.5` to `gap-2`
   - Remove `border-t border-app-border` divider before address, use spacing instead

4. **Right column** — Wrap in dashboard card:
   - Section label for "CONFIGURATION"
   - All inputs/selects: `rounded-xl` to `rounded-lg`
   - Type-specific label: change to dashboard section label pattern `text-[10px] font-bold uppercase tracking-widest text-app-text-muted mb-4`
   - NumberStepper: change `rounded-xl` to `rounded-lg`

5. **Remove `border-t lg:border-t-0 lg:border-l` divider** — cards handle visual separation

**Step 1:** Wrap left column content in dashboard card with section label

**Step 2:** Wrap right column content in dashboard card with section label

**Step 3:** Update all border-radius from rounded-xl to rounded-lg on inputs/buttons

**Step 4:** Update title sizing from text-2xl to text-lg, update grid gaps

**Step 5:** Run `pnpm typecheck && pnpm lint`

**Step 6:** Commit: `feat(onboarding): rewrite EstablishmentStep with dashboard cards`

---

### Task 4: Rewrite TablesStep

**Files:**

- Modify: `src/components/onboarding/TablesStep.tsx`

**Changes:**

1. **Title** — Same as establishment: `text-lg font-bold`, subtitle `text-sm text-app-text-secondary mb-6`

2. **Left column (mode selector)** — Wrap in dashboard card with section label "MODE DE CONFIGURATION". Change mode buttons from `rounded-xl border-2` to `rounded-lg border`. Tip box stays inside card.

3. **Right column (zones)** — Wrap in dashboard card with section label "ZONES". Remove `border-t lg:border-t-0 lg:border-l border-app-border lg:pl-10 pt-6 lg:pt-0` divider. All inputs: `rounded-xl` to `rounded-lg`. Zone cards: `rounded-xl` to `rounded-lg`. Add buttons (dashed): `rounded-xl` to `rounded-lg`.

4. **Grid** — Change `gap-x-10 gap-y-8` to `gap-6`

**Step 1:** Wrap mode selector in dashboard card, update button radii

**Step 2:** Wrap zones config in dashboard card, remove column dividers

**Step 3:** Update all input/button radii, title sizing, grid gaps

**Step 4:** Run `pnpm typecheck && pnpm lint`

**Step 5:** Commit: `feat(onboarding): rewrite TablesStep with dashboard cards`

---

### Task 5: Rewrite BrandingStep

**Files:**

- Modify: `src/components/onboarding/BrandingStep.tsx`

**Changes:**

1. **Title** — `text-lg font-bold`, subtitle `text-sm text-app-text-secondary mb-6`

2. **Left column** — Wrap ALL content (preview + logo + description) in ONE dashboard card with section label "IDENTITE VISUELLE". Change preview label from inline to dashboard section label pattern. Logo upload box: `rounded-xl` to `rounded-lg`. Textarea: `rounded-xl` to `rounded-lg`.

3. **Right column** — Wrap in dashboard card with section label "COULEURS". Change presets label from `text-xs` to `text-[10px] font-bold uppercase tracking-widest text-app-text-muted`. Custom colors label same. Input hex fields: `rounded-xl` to `rounded-lg`. Color swatch picker buttons: already `rounded-lg` (keep).

4. **Grid** — Change `gap-x-10 gap-y-8` to `gap-6`

**Step 1:** Wrap left content in dashboard card with section label

**Step 2:** Wrap right content in dashboard card with section label

**Step 3:** Update all radii, labels, title, grid gaps

**Step 4:** Run `pnpm typecheck && pnpm lint`

**Step 5:** Commit: `feat(onboarding): rewrite BrandingStep with dashboard cards`

---

### Task 6: Rewrite MenuStep

**Files:**

- Modify: `src/components/onboarding/MenuStep.tsx`

**Changes:**

1. **Title** — `text-lg font-bold`, subtitle `text-sm text-app-text-secondary mb-6`

2. **Fix layout** — Currently preview and categories are in SAME column (space-y-4 with a border-t divider). Restructure into proper 2-column grid like other steps:
   - Left column: preview card + tip card
   - Right column: categories + add category button

3. **Left column** — Wrap in dashboard card with section label "APERCU". Preview stays. Tip card moved inside.

4. **Right column** — Wrap in dashboard card with section label "MENU". Category cards: `rounded-xl` to `rounded-lg`. Category header input: already `rounded-lg` (keep). Add article button: keep `rounded-lg`. Add category dashed button: `rounded-xl` to `rounded-lg`.

5. **Grid** — Use `gap-6`

**Step 1:** Restructure into proper 2-column grid (separate preview from categories)

**Step 2:** Wrap each column in dashboard card with section labels

**Step 3:** Update radii, title, spacing

**Step 4:** Run `pnpm typecheck && pnpm lint`

**Step 5:** Commit: `feat(onboarding): rewrite MenuStep with dashboard cards`

---

### Task 7: Rewrite LaunchStep

**Files:**

- Modify: `src/components/onboarding/LaunchStep.tsx`

**Changes:**

1. **Title** — `text-lg font-bold`, subtitle `text-sm text-app-text-secondary mb-6`

2. **Left column** — Summary card: wrap in dashboard card with section label "RECAPITULATIF". URL section: wrap in separate dashboard card with section label "LIEN DU MENU".

3. **Right column** — QR customization: wrap in dashboard card with section label "QR CODE". Change sub-tabs from bordered tabs to pill buttons: active = `bg-accent text-accent-text rounded-lg px-3 py-1.5 text-xs font-medium`, inactive = `bg-app-elevated text-app-text-muted rounded-lg px-3 py-1.5 text-xs font-medium`. Remove `border-b border-app-border pb-0` from tab container.

4. **Remove `border-t lg:border-t-0 lg:border-l border-app-border lg:pl-10 pt-6 lg:pt-0`** column divider

5. **Grid** — `gap-6`

6. **Template buttons**: `rounded-xl` to `rounded-lg`

**Step 1:** Wrap left sections in dashboard cards with section labels

**Step 2:** Wrap right QR section in dashboard card, replace tabs with pill buttons

**Step 3:** Remove column dividers, update radii, title, grid gaps

**Step 4:** Run `pnpm typecheck && pnpm lint`

**Step 5:** Commit: `feat(onboarding): rewrite LaunchStep with dashboard cards`

---

### Task 8: Update LogoCropper modal

**Files:**

- Modify: `src/components/onboarding/LogoCropper.tsx`

**Changes:**

Minimal — already uses OKLCH tokens. Just align radii:

1. Modal container: `rounded-2xl` to `rounded-xl` (dashboard pattern)
2. Header button: `rounded-lg` (keep)
3. Zoom buttons: `rounded-lg` (keep)
4. Action buttons: `rounded-xl` to `rounded-lg`

**Step 1:** Update radii

**Step 2:** Run `pnpm typecheck && pnpm lint`

**Step 3:** Commit: `feat(onboarding): align LogoCropper radii with dashboard`

---

### Task 9: Final verification

**Step 1:** Run `pnpm typecheck` — expect 0 errors

**Step 2:** Run `pnpm lint` — expect 0 errors

**Step 3:** Run `pnpm test` — expect all 426 tests pass

**Step 4:** Run `pnpm build` — expect success

**Step 5:** Final commit if any fixes needed
