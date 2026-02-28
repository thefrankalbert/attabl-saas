# Flat Premium Design System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform all admin interfaces from current shadowy/mixed styling to a cohesive "Flat Premium" aesthetic — zero shadows, subtle borders, bold typography, lime accents, generous spacing.

**Architecture:** Update CSS design tokens in globals.css first (single source of truth), then propagate through shadcn/ui base components (Card, Button, Input, Table, Badge, Skeleton), then update dashboard-specific components (StatsCard, Charts, KPIs), and finally sweep admin page components for remaining hardcoded styles.

**Tech Stack:** Tailwind CSS v4 (@theme tokens), shadcn/ui, Framer Motion, Recharts

---

### Task 1: Add semantic design tokens to globals.css

**Files:**

- Modify: `src/app/globals.css`

**Step 1: Add flat premium tokens to the @theme block**

Replace the entire `@theme { ... }` block (lines 9-42) with:

```css
@theme {
  /* ===== FLAT PREMIUM DESIGN TOKENS ===== */

  /* Surfaces */
  --color-surface-primary: #ffffff;
  --color-surface-secondary: #f9fafb;
  --color-surface-tertiary: #f3f4f6;
  --color-surface-accent: #f7ffd6;

  /* Borders (subtle — no shadows) */
  --color-border-default: #e5e7eb;
  --color-border-subtle: #f3f4f6;
  --color-border-strong: #d1d5db;
  --color-border-accent: #ccff00;

  /* Text hierarchy */
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-muted: #9ca3af;
  --color-text-accent: #4d7c0f;

  /* Actions */
  --color-action-primary: #ccff00;
  --color-action-primary-hover: #b8e600;
  --color-action-secondary: #111827;
  --color-action-danger: #ef4444;

  /* Status colors */
  --color-status-success: #059669;
  --color-status-success-bg: #ecfdf5;
  --color-status-warning: #d97706;
  --color-status-warning-bg: #fffbeb;
  --color-status-error: #dc2626;
  --color-status-error-bg: #fef2f2;
  --color-status-info: #2563eb;
  --color-status-info-bg: #eff6ff;

  /* Legacy — keep for backward compat during migration */
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-muted: #f9fafb;
  --color-muted-foreground: #6b7280;
  --color-border: #e5e7eb;
  --color-primary: #ccff00;
  --color-primary-dark: #b3e600;
  --color-primary-light: #f0ffc0;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-brand-green: #ccff00;
  --color-brand-green-dark: #b3e600;
  --color-brand-green-light: #f0ffc0;
  --color-brand-orange: #f59e0b;
  --color-brand-orange-dark: #d97706;
  --color-neutral-50: #f9fafb;
  --color-neutral-100: #f3f4f6;
  --color-neutral-700: #6b7280;
  --color-neutral-900: #0a0a0a;

  /* Typography — System font stack */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  --font-display:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
}
```

**Step 2: Update :root variables** (lines 44-50)

```css
:root {
  --background: var(--color-surface-secondary);
  --foreground: var(--color-text-primary);
  --border: var(--color-border-default);
  --input: var(--color-border-default);
  --ring: var(--color-action-primary);
}
```

**Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass (CSS-only change, no TS impact)

**Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add flat premium design tokens to globals.css"
```

---

### Task 2: Update Card component to flat premium

**Files:**

- Modify: `src/components/ui/card.tsx`

**Step 1: Update Card base class**

Replace line 9:

```tsx
// OLD
className={cn('rounded-lg border bg-card text-card-foreground', className)}
// NEW
className={cn('rounded-xl border border-border-default bg-surface-primary text-text-primary shadow-none', className)}
```

**Step 2: Update CardTitle to match Heading M**

Replace line 27:

```tsx
// OLD
className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
// NEW
className={cn('text-sm font-semibold leading-none', className)}
```

**Step 3: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "style(card): flat premium — rounded-xl, no shadow, semantic tokens"
```

---

### Task 3: Update Button component to flat premium

**Files:**

- Modify: `src/components/ui/button.tsx`

**Step 1: Update button variants**

Replace the entire `buttonVariants` cva (lines 7-32):

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-primary/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-action-secondary text-white hover:bg-[#1f2937]',
        destructive: 'bg-action-danger text-white hover:bg-red-600',
        outline:
          'border border-border-default bg-transparent text-text-secondary hover:bg-surface-secondary hover:border-border-strong',
        secondary: 'bg-surface-tertiary text-text-primary hover:bg-border-default',
        ghost: 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
        link: 'text-text-accent underline-offset-4 hover:underline',
        lime: 'bg-action-primary text-text-primary font-semibold hover:bg-action-primary-hover',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
```

**Step 2: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass (API unchanged, only class strings changed)

**Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "style(button): flat premium — semantic tokens, rounded-lg, no shadow"
```

---

### Task 4: Update Input component to flat premium

**Files:**

- Modify: `src/components/ui/input.tsx`

**Step 1: Update input classes**

Replace the className string (line 11):

```tsx
'flex h-10 w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-base text-text-primary shadow-none ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-text-muted focus-visible:outline-none focus-visible:border-action-primary focus-visible:ring-1 focus-visible:ring-action-primary/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
```

**Step 2: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "style(input): flat premium — lime focus ring, semantic tokens"
```

---

### Task 5: Update Table component to flat premium

**Files:**

- Modify: `src/components/ui/table.tsx`

**Step 1: Update TableHeader**

Replace line 18:

```tsx
<thead
  ref={ref}
  className={cn('bg-surface-secondary [&_tr]:border-b [&_tr]:border-border-subtle', className)}
  {...props}
/>
```

**Step 2: Update TableRow**

Replace lines 46-48:

```tsx
className={cn(
  'border-b border-border-subtle transition-colors hover:bg-surface-secondary data-[state=selected]:bg-surface-accent',
  className,
)}
```

**Step 3: Update TableHead**

Replace lines 62-64:

```tsx
className={cn(
  'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-text-secondary [&:has([role=checkbox])]:pr-0',
  className,
)}
```

**Step 4: Update TableCell**

Replace line 77:

```tsx
className={cn('py-3 px-4 align-middle text-sm [&:has([role=checkbox])]:pr-0', className)}
```

**Step 5: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/components/ui/table.tsx
git commit -m "style(table): flat premium — uppercase headers, subtle borders, semantic tokens"
```

---

### Task 6: Update Badge component to flat premium

**Files:**

- Modify: `src/components/ui/badge.tsx`

**Step 1: Update badge variants**

Replace the badgeVariants cva (lines 5-26):

```tsx
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-action-primary/10 text-text-accent',
        secondary: 'border-border-default bg-surface-secondary text-text-secondary',
        destructive: 'border-red-200/50 bg-status-error-bg text-status-error',
        outline: 'text-text-primary border-border-default',
        success: 'border-emerald-200/50 bg-status-success-bg text-status-success',
        warning: 'border-amber-200/50 bg-status-warning-bg text-status-warning',
        info: 'border-blue-200/50 bg-status-info-bg text-status-info',
        muted: 'border-transparent bg-surface-tertiary text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
```

**Step 2: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "style(badge): flat premium — semantic status colors, subtle borders"
```

---

### Task 7: Update Skeleton to use semantic tokens

**Files:**

- Modify: `src/components/ui/skeleton.tsx`

**Step 1: Update skeleton class**

```tsx
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-surface-tertiary', className)} {...props} />
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ui/skeleton.tsx
git commit -m "style(skeleton): use surface-tertiary token"
```

---

### Task 8: Update StatsCard to flat premium

**Files:**

- Modify: `src/components/admin/StatsCard.tsx`

**Step 1: Update StatsCard rendering**

Replace the main card div (line 30):

```tsx
<div className="bg-surface-primary border border-border-default rounded-xl p-5 sm:p-6 flex flex-col justify-between shadow-none transition-colors hover:border-border-strong">
```

Replace label (line 32):

```tsx
<p className="text-xs uppercase tracking-wider text-text-secondary font-medium">{title}</p>
```

Replace value (lines 35-37):

```tsx
<div className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight mt-1">{value}</div>
```

Replace trend pill classes (lines 43-45):

```tsx
className={cn(
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
  trend.isPositive ? 'bg-status-success-bg text-status-success' : 'bg-status-error-bg text-status-error',
)}
```

Replace subtitle (line 57):

```tsx
{
  subtitle && <span className="text-xs text-text-muted font-medium">{subtitle}</span>;
}
```

**Step 2: Update StatsCardSkeleton**

Replace (lines 94-103):

```tsx
export function StatsCardSkeleton() {
  return (
    <div className="bg-surface-primary border border-border-default rounded-xl p-5 sm:p-6 animate-pulse shadow-none">
      <div className="h-3 w-16 bg-surface-tertiary rounded" />
      <div className="h-9 w-20 bg-surface-tertiary rounded mt-2" />
      <div className="h-4 w-14 bg-border-subtle rounded-full mt-3" />
      <div className="h-7 w-full bg-surface-secondary rounded mt-3" />
    </div>
  );
}
```

**Step 3: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/components/admin/StatsCard.tsx
git commit -m "style(stats-card): flat premium — no shadow, semantic tokens, uppercase label"
```

---

### Task 9: Update DashboardClient layout to flat premium

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Step 1: Update loading state**

Replace lines 79-97 (loading skeleton):

```tsx
return (
  <div className="min-h-0 lg:h-full flex flex-col gap-4 xl:gap-5 overflow-y-auto">
    <div className="flex items-center justify-between shrink-0">
      <div className="h-7 w-48 bg-surface-tertiary rounded animate-pulse" />
      <div className="h-8 w-36 bg-surface-secondary rounded-lg animate-pulse" />
    </div>
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4 xl:gap-5">
      <div className="flex lg:flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
      <div className="bg-surface-primary border border-border-default rounded-xl animate-pulse min-h-[200px]" />
      <div className="flex flex-col gap-4">
        <div className="flex-1 bg-surface-primary border border-border-default rounded-xl animate-pulse min-h-[150px]" />
        <div className="flex-1 bg-surface-primary border border-border-default rounded-xl animate-pulse min-h-[150px]" />
      </div>
    </div>
  </div>
);
```

**Step 2: Update greeting heading**

Replace line 104:

```tsx
<h1 className="text-xl font-semibold text-text-primary tracking-tight">
```

**Step 3: Update chart loading placeholders**

Replace lines 20-21 (DashboardCharts loading):

```tsx
loading: () => (
  <div className="h-full bg-surface-primary border border-border-default rounded-xl animate-pulse" />
),
```

Do the same for DashboardDonut (lines 25-26) and DashboardHourlyBar (lines 33-34).

**Step 4: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "style(dashboard): flat premium — semantic tokens throughout"
```

---

### Task 10: Update Dashboard sub-components

**Files:**

- Modify: `src/components/features/dashboard/DashboardCharts.tsx`
- Modify: `src/components/features/dashboard/DashboardDonut.tsx`
- Modify: `src/components/features/dashboard/DashboardHourlyBar.tsx`
- Modify: `src/components/features/dashboard/DashboardRecentOrders.tsx`
- Modify: `src/components/features/dashboard/PeriodSelector.tsx`

**Step 1: For each dashboard component, apply these replacements:**

Pattern replacements across all 5 files:

- `bg-white` → `bg-surface-primary`
- `border-zinc-100` → `border-border-default`
- `rounded-2xl` → `rounded-xl`
- `text-zinc-900` → `text-text-primary`
- `text-zinc-400` → `text-text-secondary`
- `text-zinc-500` → `text-text-secondary`
- `text-zinc-300` → `text-text-muted`
- `bg-zinc-200` → `bg-surface-tertiary`
- `bg-zinc-100` → `bg-surface-secondary`
- `bg-zinc-50` → `bg-surface-secondary`
- `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` → `shadow-none`
- `hover:shadow-md` → `hover:border-border-strong`
- `text-neutral-900` → `text-text-primary`
- `text-neutral-500` → `text-text-secondary`
- `text-neutral-400` → `text-text-muted`
- `border-neutral-100` → `border-border-default`
- `bg-neutral-100` → `bg-surface-secondary`
- `bg-neutral-50` → `bg-surface-secondary`

**Step 2: Run typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/components/features/dashboard/
git commit -m "style(dashboard-components): flat premium — semantic tokens, no shadows"
```

---

### Task 11: Update AdminContentWrapper transition

**Files:**

- Modify: `src/components/admin/AdminContentWrapper.tsx`

**Step 1: Update page transition values**

Replace line 37 (initial):

```tsx
initial={{ opacity: 0, y: 8 }}
```

This is a minor tweak (10 → 8) for slightly subtler motion.

**Step 2: Commit**

```bash
git add src/components/admin/AdminContentWrapper.tsx
git commit -m "style(admin-wrapper): subtler page transition (y: 8px)"
```

---

### Task 12: Sweep admin page components for hardcoded styles

**Files:**

- Modify: `src/components/admin/CategoriesClient.tsx`
- Modify: `src/components/admin/ItemsClient.tsx`
- Modify: `src/components/admin/OrdersClient.tsx`
- Modify: `src/components/admin/SuggestionsClient.tsx`
- Modify: `src/components/admin/InventoryClient.tsx`
- Modify: `src/components/admin/MenusClient.tsx`
- Modify: `src/components/admin/RecipesClient.tsx`
- Modify: `src/components/admin/UsersClient.tsx`
- Modify: `src/components/admin/ReportsClient.tsx`
- Modify: `src/components/admin/CouponsClient.tsx`
- Modify: `src/components/admin/InvoiceHistoryClient.tsx`
- Modify: `src/components/admin/AuditLogClient.tsx`
- Modify: `src/components/admin/SuppliersClient.tsx`

**Step 1: Apply the same pattern replacements as Task 10 across all admin components:**

Same find/replace patterns:

- `bg-white` → `bg-surface-primary` (inside card wrappers only)
- `border-zinc-*` / `border-neutral-*` → semantic border tokens
- `text-zinc-*` / `text-neutral-*` → semantic text tokens
- `shadow-*` → `shadow-none`
- `rounded-2xl` → `rounded-xl` (for cards)

Also look for:

- Hardcoded `#CCFF00` → `bg-action-primary` / `text-action-primary`
- `bg-[#CCFF00]` → `bg-action-primary`
- `hover:bg-[#b8e600]` / `hover:bg-[#B8E600]` → `hover:bg-action-primary-hover`

**Step 2: Run full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: All 395 tests pass

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/admin/
git commit -m "style(admin): flat premium sweep — semantic tokens across all admin pages"
```

---

### Task 13: Update Select component focus ring

**Files:**

- Modify: `src/components/ui/select.tsx`

**Step 1: Update SelectTrigger focus**

Replace `focus:ring-1 focus:ring-ring` with:

```
focus:ring-1 focus:ring-action-primary/30 focus:border-action-primary
```

**Step 2: Commit**

```bash
git add src/components/ui/select.tsx
git commit -m "style(select): lime focus ring to match input"
```

---

### Task 14: Final visual verification and push

**Step 1: Run full quality check**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: All 5 gates pass

**Step 2: Push**

```bash
git push origin main
```

**Step 3: Visual check in browser**

Open http://localhost:3000 and verify:

- Dashboard: no shadows, rounded-xl cards, semantic colors
- Categories/Items: consistent card styling
- Orders: table headers uppercase, subtle borders
- Overall: cohesive flat premium aesthetic
