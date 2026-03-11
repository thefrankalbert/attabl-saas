# Onboarding "Dashboard Mirror" Redesign

**Date**: 2026-03-10
**Approach**: Refonte visuelle complete — appliquer le langage visuel du dashboard admin a l'onboarding

## Principe

Reproduire exactement les patterns du dashboard admin (cards, spacing, typography, icons, colors) pour une coherence totale et une transition fluide onboarding → admin.

## Files a modifier

1. `src/app/onboarding/page.tsx` — Layout principal (sidebar, header mobile, footer, content)
2. `src/components/onboarding/WelcomeStep.tsx` — Welcome screen
3. `src/components/onboarding/EstablishmentStep.tsx` — Step 1
4. `src/components/onboarding/TablesStep.tsx` — Step 2
5. `src/components/onboarding/BrandingStep.tsx` — Step 3
6. `src/components/onboarding/MenuStep.tsx` — Step 4
7. `src/components/onboarding/LaunchStep.tsx` — Step 5
8. `src/components/onboarding/LogoCropper.tsx` — Modal crop logo

## Design Tokens (du dashboard)

### Cards

```
bg-app-card border border-app-border rounded-xl p-5
```

### Section Labels (dashboard signature)

```
text-[10px] font-bold uppercase tracking-widest text-app-text-muted mb-4
```

### Inputs

```
h-10 bg-app-elevated border border-app-border rounded-lg px-3 text-sm text-app-text
```

### Input Labels

```
text-sm font-medium text-app-text-secondary mb-1.5
```

### Buttons

- Primary: `h-9 rounded-lg bg-accent text-accent-text font-semibold`
- Ghost: `text-app-text-muted hover:text-app-text-secondary`
- Outline: `border border-app-border text-app-text-secondary hover:bg-app-hover`

### Selector Buttons (type selection, mode selection)

```
rounded-lg border border-app-border p-3 text-center hover:border-app-border-hover
Active: border-accent bg-accent/5
```

## Layout Changes

### page.tsx — Sidebar

- Width: w-56 lg:w-[224px]
- bg-app-card border-r border-app-border
- Logo: "ATTABL" text-base font-bold
- Nav items: rounded-lg px-3 py-2.5, icon w-8 h-8 rounded-lg
- NO connecting lines between steps
- Active step: bg-app-elevated/50
- Footer: tenant name + trial reminder

### page.tsx — Mobile Header

- Logo + step counter on one line
- Progress bar h-[2px] bg-accent
- REMOVE step pill icons (too busy)

### page.tsx — Content Area

- Padding: px-6 lg:px-8 py-6
- Max-width: max-w-4xl (tighter focus)
- Title: text-lg font-bold text-app-text
- Subtitle: text-sm text-app-text-secondary mb-6

### page.tsx — Footer

- Keep progress bar
- Back button left, dots center, next/skip right
- Buttons h-9 rounded-lg
- REMOVE visible auto-save status text

## Step-by-Step Changes

### WelcomeStep

- Keep centered layout
- Icon: w-12 h-12 rounded-xl bg-accent
- Title: DM Serif Display text-2xl sm:text-3xl
- REPLACE 5-column card grid with simple list in single card:
  - bg-app-card rounded-xl border border-app-border p-4 max-w-sm
  - Each row: icon w-6 h-6 + text-sm font-medium
  - space-y-3 between rows
- CTA: h-11 rounded-lg bg-accent text-accent-text font-semibold

### EstablishmentStep

- Wrap sections in dashboard cards (bg-app-card border rounded-xl p-5)
- Section labels: uppercase tracking-widest 10px
- Type selector: grid-cols-3 gap-2, rounded-lg buttons
- Inputs: bg-app-elevated rounded-lg h-10
- 2-col layout: grid-cols-1 lg:grid-cols-2 gap-6

### TablesStep

- Same card wrapping pattern
- Mode selector: 3 buttons in card with dashboard toggle style
- Zone config in separate card
- Preview section in card

### BrandingStep

- Preview in card with section label
- Logo upload in card
- Color presets in card with section label
- Custom colors in card

### MenuStep

- Preview in card
- Categories as collapsible cards
- Add buttons: dashed border rounded-lg

### LaunchStep

- Summary in card with checklist
- QR tabs as pill buttons (bg-accent when active, bg-app-elevated when not)
- URL section in card

### LogoCropper

- Modal: bg-app-card border border-app-border rounded-xl
- Controls: same input/button patterns
