# UI/UX Overhaul — Kole Jain Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate "vibe coded" signals from attabl by implementing a professional design system, simplifying the dashboard, and improving interactivity.

**Architecture:** OKLCH-based design tokens in globals.css → Dashboard restructure → Sidebar grouping → Empty states + optimistic UI → Onboarding polish → Landing page fixes.

**Tech Stack:** Tailwind CSS v4, OKLCH color space, Recharts, TanStack Query, Lucide icons, shadcn/ui.

---

## Phase 1: Design System Foundation

### Task 1.1: Migrate globals.css to OKLCH tokens

**Files:**

- Modify: `src/app/globals.css`

**Changes:**

1. Replace dark mode hex/rgba values with OKLCH values (linear 5% lightness progression)
2. Replace light mode values with matching OKLCH (same hue/chroma, inverted lightness)
3. Add accent ramp (50-900) as CSS custom properties
4. Improve border opacity (from 0.06 to visible)
5. Improve text hierarchy (3 distinct levels)
6. Add semantic status tokens that reference OKLCH

**Key values:**

```css
/* Dark mode surfaces — 5% linear progression */
--app-bg:       oklch(0.16 0.015 260);
--app-card:     oklch(0.21 0.015 260);
--app-elevated: oklch(0.26 0.015 260);
--app-hover:    oklch(0.31 0.015 260);

/* Borders — visible */
--app-border:       oklch(0.30 0.01 260);
--app-border-hover: oklch(0.40 0.01 260);

/* Text — clear hierarchy */
--app-text:           oklch(0.95 0 0);
--app-text-secondary: oklch(0.72 0 0);
--app-text-muted:     oklch(0.50 0 0);

/* Accent ramp — lime hue 130 */
--accent-50 through --accent-900

/* Light mode — same hue, inverted lightness */
```

### Task 1.2: Create design-tokens.ts for TypeScript consumption

**Files:**

- Create: `src/lib/design-tokens.ts`

**Purpose:** Centralize status colors, chart color generation (OKLCH equidistant), and STATUS_CFG for reuse across Dashboard, Orders, Reports.

---

## Phase 2: Dashboard & Sidebar (PRIORITY)

### Task 2.1: Simplify DashboardClient.tsx layout

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Changes:**

1. Remove hero banner gradient → simple greeting bar (card bg + border)
2. Remove revenue from hero → keep only in KPI strip
3. Remove Popular Items section (mobile-only)
4. Remove Category Breakdown section (mobile-only)
5. Remove Quick Access grid (sidebar does this job)
6. Simplify to: Greeting + KPI strip + Overview chart + Recent orders (2 cols)
7. Remove excessive animations (keep only 1 subtle fade-in)
8. Fix minimum text sizes: text-[8px]→text-xs, text-[9px]→text-xs, text-[7px]→text-xs
9. Unify KPI cards: same bg/border style, no rainbow colors
10. Use semantic STATUS_CFG from design-tokens.ts
11. Add empty state for "no orders" with proper illustration
12. Add Tooltip on sparkline charts

### Task 2.2: Restructure sidebar navigation with groups

**Files:**

- Modify: `src/lib/layout/navigation-config.ts` (already has groups!)
- Create: `src/components/admin/AdminSidebar.tsx`
- Modify: `src/components/admin/AdminLayoutClient.tsx`

**Changes:**

1. Navigation config already has groups — leverage existing structure
2. Create proper desktop sidebar component with:
   - Profile section at top (tenant logo + name)
   - Grouped nav items with section labels
   - Collapsible groups (accordion)
   - Active state with left rectangle indicator
   - Settings/subscription at bottom
3. Make sidebar collapsible (icon-only mode)
4. Integrate into AdminLayoutClient (show sidebar on md+, bottom nav on mobile)

### Task 2.3: Fix KPI cards to use StatsCard component

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`
- Modify: `src/components/admin/StatsCard.tsx` (if needed)

**Why:** StatsCard already uses design tokens correctly but isn't used in the dashboard. Replace inline KPI cards with StatsCard.

---

## Phase 3: Sub-pages improvements

### Task 3.1: OrdersClient — empty states + semantic colors

**Files:**

- Modify: `src/components/admin/OrdersClient.tsx`

**Changes:**

1. Add illustrated empty state when no orders
2. Replace hardcoded Tailwind status colors with semantic tokens
3. Toast confirmation after status changes

### Task 3.2: ItemsClient — empty states + three-dot menu

**Files:**

- Modify: `src/components/admin/ItemsClient.tsx`

**Changes:**

1. Add empty state with "Add your first item" CTA
2. Replace individual action buttons (Edit, Delete, Star) with DropdownMenu (three-dot)

### Task 3.3: ReportsClient — chart colors + tooltips

**Files:**

- Modify: `src/components/admin/ReportsClient.tsx`

**Changes:**

1. Replace CHART_COLORS with OKLCH-generated palette from design-tokens.ts
2. Add grid lines and numeric labels on charts
3. Verify tooltips show formatted values + percentages

---

## Phase 4: Onboarding

### Task 4.1: Fix onboarding visual issues

**Files:**

- Modify: `src/app/onboarding/page.tsx`

**Changes:**

1. Change default primaryColor from `#CCFF00` to a more professional default
2. Active step indicator: use accent color instead of `bg-app-text`
3. Connecting lines: use accent for completed segments

---

## Phase 5: Landing Page & Auth

### Task 5.1: Marketing components — use design tokens

**Files:**

- Modify: `src/components/marketing/CTASection.tsx` — `bg-[#CCFF00]` → `bg-accent`
- Modify: `src/components/marketing/VideoHero.tsx` — secondary button outline
- Modify: `src/components/marketing/SocialProof.tsx` — real social proof content
- Modify: `src/components/auth/AuthLayout.tsx` — replace hardcoded colors

---

## Execution Order

1. Task 1.1 (globals.css) — FIRST, everything depends on this
2. Task 1.2 (design-tokens.ts) — needed by dashboard + reports
3. Tasks 2.1 + 2.2 in PARALLEL (dashboard + sidebar)
4. Task 2.3 after 2.1 (depends on dashboard restructure)
5. Tasks 3.1 + 3.2 + 3.3 in PARALLEL
6. Task 4.1
7. Task 5.1
