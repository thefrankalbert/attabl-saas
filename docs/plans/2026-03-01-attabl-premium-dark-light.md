# Attabl Premium — Dark/Light Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform all admin interfaces into a premium dark-first design system (inspired by BitePoint POS, Cosy POS, Notion Finance) with full dark/light mode support and system preference detection.

**Architecture:** CSS custom properties on `:root` define dark mode (default). A `.light` class overrides all tokens for light mode. A `ThemeProvider` detects `prefers-color-scheme`, persists user choice to localStorage, and injects the class on `<html>`. All UI components use semantic tokens (`--app-bg`, `--app-card`, etc.) — never hardcoded colors.

**Tech Stack:** Tailwind CSS v4 (@theme), CSS custom properties, React context, `useSyncExternalStore` for theme state, lucide-react icons

**Design references:** BitePoint POS (dark dashboard, bare icons, blue accent), Cosy POS (deep black, layered surfaces), Notion Finance Dashboard (dark slate, muted green accent, category grid)

---

### Task 1: Rewrite globals.css with dual-theme token system

**Files:**

- Modify: `src/app/globals.css`

**Step 1: Replace the entire @theme block and :root block**

The approach: `@theme` defines static Tailwind tokens. `:root` defines CSS variables for dark (default). `.light` class overrides them for light mode. Components use `bg-[var(--app-bg)]` or utility classes that map to these variables.

```css
@import 'tailwindcss';

/* SCROLL CONTRACT: Only <main#main-content> scrolls.
   Child pages must NOT set viewport heights (100dvh, 100vh).
   Use h-full to fill the parent flex container. */

@custom-variant dark (&:is(.dark *));

@theme {
  /* ===== ATTABL PREMIUM TOKENS ===== */

  /* Accent — ONE accent color only (lime for dark, dark-green for light) */
  --color-accent: var(--app-accent);
  --color-accent-hover: var(--app-accent-hover);
  --color-accent-muted: var(--app-accent-muted);
  --color-accent-text: var(--app-accent-text);

  /* Semantic surfaces — resolved via CSS vars */
  --color-app-bg: var(--app-bg);
  --color-app-card: var(--app-card);
  --color-app-elevated: var(--app-elevated);
  --color-app-hover: var(--app-hover);
  --color-app-border: var(--app-border);
  --color-app-border-hover: var(--app-border-hover);
  --color-app-text: var(--app-text);
  --color-app-text-secondary: var(--app-text-secondary);
  --color-app-text-muted: var(--app-text-muted);

  /* Status — same in both modes */
  --color-status-success: #059669;
  --color-status-success-bg: var(--app-status-success-bg);
  --color-status-warning: #d97706;
  --color-status-warning-bg: var(--app-status-warning-bg);
  --color-status-error: #dc2626;
  --color-status-error-bg: var(--app-status-error-bg);
  --color-status-info: #2563eb;
  --color-status-info-bg: var(--app-status-info-bg);

  /* Danger action */
  --color-danger: #ef4444;
  --color-danger-hover: #dc2626;

  /* Legacy compat — point to new tokens */
  --color-background: var(--app-bg);
  --color-foreground: var(--app-text);
  --color-muted: var(--app-elevated);
  --color-muted-foreground: var(--app-text-secondary);
  --color-border: var(--app-border);
  --color-primary: var(--app-accent);
  --color-primary-dark: var(--app-accent-hover);

  /* Typography — System font stack */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  --font-display:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
}

/* ===== DARK MODE (default) ===== */
:root {
  --app-bg: #0f1117;
  --app-card: #1a1d27;
  --app-elevated: #242836;
  --app-hover: #2a2f3d;
  --app-border: rgba(255, 255, 255, 0.06);
  --app-border-hover: rgba(255, 255, 255, 0.12);
  --app-text: #f0f0f0;
  --app-text-secondary: rgba(255, 255, 255, 0.55);
  --app-text-muted: rgba(255, 255, 255, 0.3);
  --app-accent: #ccff00;
  --app-accent-hover: #b8e600;
  --app-accent-muted: rgba(204, 255, 0, 0.12);
  --app-accent-text: #111111;
  --app-status-success-bg: rgba(5, 150, 105, 0.15);
  --app-status-warning-bg: rgba(217, 119, 6, 0.15);
  --app-status-error-bg: rgba(220, 38, 38, 0.15);
  --app-status-info-bg: rgba(37, 99, 235, 0.15);

  color-scheme: dark;
}

/* ===== LIGHT MODE ===== */
.light {
  --app-bg: #f5f5f7;
  --app-card: #ffffff;
  --app-elevated: #f0f0f2;
  --app-hover: #eaeaec;
  --app-border: rgba(0, 0, 0, 0.08);
  --app-border-hover: rgba(0, 0, 0, 0.15);
  --app-text: #111111;
  --app-text-secondary: rgba(0, 0, 0, 0.55);
  --app-text-muted: rgba(0, 0, 0, 0.3);
  --app-accent: #4d7c0f;
  --app-accent-hover: #3f6212;
  --app-accent-muted: rgba(77, 124, 15, 0.1);
  --app-accent-text: #ffffff;
  --app-status-success-bg: #ecfdf5;
  --app-status-warning-bg: #fffbeb;
  --app-status-error-bg: #fef2f2;
  --app-status-info-bg: #eff6ff;

  color-scheme: light;
}

body {
  background-color: var(--app-bg);
  color: var(--app-text);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
```

Keep all the utility classes below (glass-morphism, animate-gradient-slow, scroll-mask, pb-safe, pt-safe, custom-scrollbar, scrollbar-hide) unchanged.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (CSS-only changes)

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: rewrite design tokens — dark-first dual-theme system"
```

---

### Task 2: Create ThemeProvider with system detection

**Files:**

- Create: `src/contexts/ThemeContext.tsx`
- Modify: `src/app/sites/[site]/admin/layout.tsx` (wrap with ThemeProvider)

**Step 1: Create ThemeContext.tsx**

```tsx
'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'dark' | 'light';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'attabl-theme';

// ─── External store for localStorage ────────────────────

let listeners: Array<() => void> = [];
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners = [...listeners, cb];
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function getSnapshot(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
}
function getServerSnapshot(): Theme {
  return 'system';
}

// ─── Provider ───────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const systemDark = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => true, // SSR default: dark
  );

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Apply class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (resolved === 'light') {
      root.classList.add('light');
    }
    // dark is default (no class needed), but add for explicitness
    if (resolved === 'dark') {
      root.classList.add('dark');
    }
  }, [resolved]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    emit();
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

**Step 2: Add ThemeProvider to admin layout**

In `src/app/sites/[site]/admin/layout.tsx`, import `ThemeProvider` and wrap just inside `<QueryProvider>`:

```tsx
import { ThemeProvider } from '@/contexts/ThemeContext';
// ...
<QueryProvider>
  <ThemeProvider>
    <AdminLayoutClient ...>
      {/* ... */}
    </AdminLayoutClient>
  </ThemeProvider>
</QueryProvider>
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/contexts/ThemeContext.tsx src/app/sites/[site]/admin/layout.tsx
git commit -m "feat: add ThemeProvider with system preference detection"
```

---

### Task 3: Update UI base components to use semantic tokens

**Files:**

- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/table.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/skeleton.tsx`

**Step 1: Update Card**

```tsx
// card.tsx line 10 — replace className
'rounded-xl border border-app-border bg-app-card text-app-text shadow-none';
```

**Step 2: Update Button variants**

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:pointer-events-none disabled:opacity-50 shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-text font-semibold hover:bg-accent-hover',
        destructive: 'bg-danger text-white hover:bg-danger-hover',
        outline:
          'border border-app-border bg-transparent text-app-text-secondary hover:bg-app-hover hover:border-app-border-hover',
        secondary: 'bg-app-elevated text-app-text hover:bg-app-hover',
        ghost: 'text-app-text-secondary hover:bg-app-hover hover:text-app-text',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
```

Note: The `default` variant is now the accent/lime button (primary action). This matches BitePoint where the main CTA is colored.

**Step 3: Update Input**

```tsx
// Replace className string:
'flex h-10 w-full rounded-lg border border-app-border bg-app-elevated px-3 py-2 text-base text-app-text shadow-none ring-offset-app-bg file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-app-text placeholder:text-app-text-muted focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';
```

**Step 4: Update Table**

```tsx
// TableHeader className:
'bg-app-elevated [&_tr]:border-b [&_tr]:border-app-border';

// TableRow className:
'border-b border-app-border transition-colors hover:bg-app-hover data-[state=selected]:bg-accent-muted';

// TableHead className:
'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-app-text-secondary [&:has([role=checkbox])]:pr-0';

// TableCell className:
'py-3 px-4 align-middle text-sm text-app-text [&:has([role=checkbox])]:pr-0';

// TableFooter className:
'border-t bg-app-elevated font-medium [&>tr]:last:border-b-0';
```

**Step 5: Update Badge**

```tsx
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-muted text-accent',
        secondary: 'border-app-border bg-app-elevated text-app-text-secondary',
        destructive: 'border-transparent bg-status-error-bg text-status-error',
        outline: 'text-app-text border-app-border',
        success: 'border-transparent bg-status-success-bg text-status-success',
        warning: 'border-transparent bg-status-warning-bg text-status-warning',
        info: 'border-transparent bg-status-info-bg text-status-info',
        muted: 'border-transparent bg-app-elevated text-app-text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
```

**Step 6: Update Select**

```tsx
// SelectTrigger className — replace hardcoded colors:
('flex h-9 w-full items-center justify-between gap-2',
  'rounded-lg border border-app-border bg-app-elevated px-3 py-2',
  'text-sm font-medium text-app-text',
  'placeholder:text-app-text-muted',
  'focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent',
  // ...rest unchanged

  // SelectContent className:
  'rounded-xl border border-app-border bg-app-card text-app-text shadow-lg');
// (shadow-lg allowed on overlays/portals only)

// SelectItem className:
('focus:bg-app-hover focus:text-app-text');
```

**Step 7: Update Skeleton**

```tsx
<div className={cn('animate-pulse rounded-lg bg-app-elevated', className)} {...props} />
```

**Step 8: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 9: Commit**

```bash
git add src/components/ui/
git commit -m "style(ui): all base components use semantic theme tokens"
```

---

### Task 4: Redesign AdminTopBar, AdminLayoutClient, AdminBottomNav

**Files:**

- Modify: `src/components/admin/AdminTopBar.tsx`
- Modify: `src/components/admin/AdminLayoutClient.tsx`
- Modify: `src/components/admin/AdminBottomNav.tsx`
- Modify: `src/components/admin/AdminContentWrapper.tsx`

**Step 1: Rewrite AdminTopBar**

Remove all hardcoded `bg-surface-dark`, `text-white` patterns. Use theme tokens:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LogOut, Sun, Moon } from 'lucide-react';
import Image from 'next/image';
import { isImmersivePage, isAdminHome } from '@/lib/constants';
import { useTheme } from '@/contexts/ThemeContext';

interface AdminTopBarProps {
  tenant: { name: string; slug: string; logo_url?: string };
  basePath: string;
  notifications?: React.ReactNode;
}

export function AdminTopBar({ tenant, basePath, notifications }: AdminTopBarProps) {
  const pathname = usePathname();
  const { resolved, setTheme } = useTheme();

  if (isImmersivePage(pathname)) return null;

  const isHome = isAdminHome(pathname, basePath);

  return (
    <header className="shrink-0 h-14 bg-app-card border-b border-app-border flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="flex items-center gap-3">
        {!isHome && (
          <Link
            href={basePath}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-app-elevated hover:bg-app-hover transition-colors touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4 text-app-text-secondary" />
          </Link>
        )}

        {tenant.logo_url ? (
          <Image
            src={tenant.logo_url}
            alt={tenant.name}
            width={28}
            height={28}
            className="w-7 h-7 rounded-lg object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center font-bold text-xs text-accent-text">
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}

        <span className="font-semibold text-app-text text-sm truncate max-w-[200px]">
          {tenant.name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {notifications}
        <button
          type="button"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text transition-colors touch-manipulation"
          title="Toggle theme"
        >
          {resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-status-error-bg hover:text-status-error transition-colors touch-manipulation"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
```

**Step 2: Rewrite AdminLayoutClient**

Remove all `bg-surface-dark`, `isHome` conditional backgrounds. The background is always `bg-app-bg` (controlled by theme tokens):

```tsx
// AdminLayoutInner — simplified:
<div className="h-dvh overflow-hidden flex flex-col bg-app-bg transition-colors duration-200">
  <AdminTopBar tenant={tenant} basePath={basePath} notifications={notifications} />
  <div className="flex-1 flex flex-col min-w-0 min-h-0">
    <a href="#main-content" className="sr-only focus:not-sr-only ...">
      Skip to content
    </a>
    <main id="main-content" className={cn('flex-1 overflow-y-auto', isDevMode && 'pt-6')}>
      {children}
    </main>
    {isMobile && !isHome && <AdminBottomNav basePath={basePath} role={role} />}
  </div>
</div>
```

Remove `primaryColor` prop entirely from AdminLayoutClient and AdminBottomNav.

**Step 3: Rewrite AdminBottomNav**

Replace all `bg-surface-dark`, `text-white/40`, `text-action-primary`:

```tsx
// nav wrapper:
'shrink-0 bg-app-card border-t border-app-border';

// inactive link:
'text-app-text-muted transition-colors duration-150';

// active link:
'text-accent';
```

Remove `primaryColor` prop and inline style.

**Step 4: Simplify AdminContentWrapper**

Remove the `isHome` special case (dashboard handles its own layout). Keep immersive check:

```tsx
export function AdminContentWrapper({ children, chrome }: AdminContentWrapperProps) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();
  const isImmersive = isImmersivePage(pathname);
  const isHome = /\/admin\/?$/.test(pathname ?? '');

  if (isImmersive) return <div className="h-full">{children}</div>;

  if (isHome) return <div className="h-full w-full flex flex-col">{children}</div>;

  const duration = prefersReduced ? 0 : 0.15;

  return (
    <div className="h-full w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 flex flex-col">
      {chrome}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          className="flex-1 min-h-0"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/admin/AdminTopBar.tsx src/components/admin/AdminLayoutClient.tsx src/components/admin/AdminBottomNav.tsx src/components/admin/AdminContentWrapper.tsx
git commit -m "style(admin-shell): theme-aware top bar, layout, bottom nav"
```

---

### Task 5: Redesign DashboardClient + AdminHomeGrid (premium, theme-aware)

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`
- Modify: `src/components/admin/AdminHomeGrid.tsx`

**Step 1: Rewrite DashboardClient**

Key changes:

- Remove dark-header-on-light-body split. Greeting is directly on `bg-app-bg`.
- KPI cards: big numbers on `bg-app-card` with `border-app-border`. No icon containers. No colored backgrounds. Just text hierarchy.
- No shadows anywhere.

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import AdminHomeGrid from '@/components/admin/AdminHomeGrid';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & { establishmentType?: string };

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF', establishmentType } = props;
  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const { stats, loading } = useDashboardData(props);
  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  if (loading) {
    return (
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 gap-6">
        <div className="space-y-1">
          <div className="h-7 w-48 bg-app-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-32 bg-app-elevated/50 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[76px] bg-app-card border border-app-border rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="flex-1 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-fr">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'bg-app-card border border-app-border rounded-xl animate-pulse',
                i === 0 && 'col-span-2 row-span-2',
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('ordersToday'), value: stats.ordersToday, trend: stats.ordersTrend },
    ...(showFinancials
      ? [
          {
            label: t('revenueToday'),
            value: fmtCompact(stats.revenueToday),
            trend: stats.revenueTrend,
          },
        ]
      : []),
    { label: t('activeItems'), value: stats.activeItems },
  ];

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 gap-6">
      {/* Greeting — simple text on page background */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">
          {t(greetingKey)}, {tenantName}
        </h1>
        <p className="text-sm text-app-text-muted mt-0.5 capitalize">
          {new Date().toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* KPI strip */}
      <div
        className={cn(
          'grid gap-3',
          kpis.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-app-card rounded-xl border border-app-border px-4 py-3.5"
          >
            <p className="text-[11px] uppercase tracking-widest text-app-text-muted font-medium truncate">
              {kpi.label}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-app-text tabular-nums leading-tight">
                {kpi.value}
              </span>
              {kpi.trend !== undefined && kpi.trend !== 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[10px] font-semibold',
                    kpi.trend > 0 ? 'text-status-success' : 'text-status-error',
                  )}
                >
                  {kpi.trend > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {kpi.trend > 0 ? '+' : ''}
                  {kpi.trend}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation grid */}
      <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
    </div>
  );
}
```

**Step 2: Rewrite AdminHomeGrid**

Key principles from references:

- Icons are BARE — just the icon glyph, text-app-text-secondary color. No circle/square background containers.
- Tiles are `bg-app-card`, `border-app-border`, `rounded-xl`.
- Featured POS tile: `bg-accent`, `text-accent-text` — the ONE accent usage.
- Hover: `border-app-border-hover` only. No shadows.

```tsx
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  ClipboardList,
  Laptop,
  ChefHat,
  Package,
  BarChart3,
  Settings,
  UserCheck,
  BookOpenCheck,
  Megaphone,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TileConfig {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  path: string;
  featured?: boolean;
}

// All establishment type tile arrays remain the same as current,
// but simplified — no iconBg, iconColor, iconBorder fields.
// (Keep RESTAURANT_TILES, HOTEL_TILES, etc. with just id, icon, labelKey, path, featured)

// ... same tile arrays as current file but without color fields ...

export default function AdminHomeGrid({
  basePath,
  establishmentType,
}: {
  basePath: string;
  establishmentType?: string;
}) {
  const t = useTranslations('sidebar');
  const tiles = TILE_MAP[establishmentType || 'restaurant'] || RESTAURANT_TILES;

  return (
    <div className="flex-1 grid gap-3 auto-rows-fr grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Link
            key={tile.id}
            href={`${basePath}${tile.path}`}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2.5',
              'rounded-xl border transition-colors duration-150',
              'active:scale-[0.97] touch-manipulation min-h-[100px]',
              tile.featured
                ? 'col-span-2 row-span-2 bg-accent border-accent/20 hover:border-accent/40'
                : 'bg-app-card border-app-border hover:border-app-border-hover hover:bg-app-hover',
            )}
          >
            <Icon
              className={cn(
                tile.featured ? 'w-8 h-8 text-accent-text' : 'w-5 h-5 text-app-text-secondary',
              )}
              strokeWidth={1.6}
            />
            <span
              className={cn(
                'font-semibold text-center leading-tight px-2',
                tile.featured ? 'text-sm text-accent-text' : 'text-xs text-app-text',
              )}
            >
              {t(tile.labelKey)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/DashboardClient.tsx src/components/admin/AdminHomeGrid.tsx
git commit -m "style(dashboard): premium theme-aware dashboard + grid — bare icons, no shadows"
```

---

### Task 6: Sweep admin page components — replace hardcoded colors

**Files:** All files in `src/components/admin/` that have hardcoded colors (23 files identified by scan).

**Step 1: Apply these global find/replace patterns across ALL admin components:**

| Find                                        | Replace                             | Reason                 |
| ------------------------------------------- | ----------------------------------- | ---------------------- |
| `bg-white`                                  | `bg-app-card`                       | Theme card surface     |
| `bg-surface-primary`                        | `bg-app-card`                       | Migrate old token      |
| `bg-surface-secondary`                      | `bg-app-bg`                         | Migrate old token      |
| `bg-surface-tertiary`                       | `bg-app-elevated`                   | Migrate old token      |
| `bg-surface-dark`                           | `bg-app-bg`                         | Remove dark-only token |
| `bg-surface-dark-secondary`                 | `bg-app-card`                       | Remove dark-only token |
| `border-border-default`                     | `border-app-border`                 | Migrate old token      |
| `border-border-subtle`                      | `border-app-border`                 | Migrate old token      |
| `border-border-strong`                      | `border-app-border-hover`           | Migrate old token      |
| `text-text-primary`                         | `text-app-text`                     | Migrate old token      |
| `text-text-secondary`                       | `text-app-text-secondary`           | Migrate old token      |
| `text-text-muted`                           | `text-app-text-muted`               | Migrate old token      |
| `text-text-accent`                          | `text-accent`                       | Migrate old token      |
| `bg-action-primary`                         | `bg-accent`                         | Migrate old token      |
| `bg-action-primary-hover`                   | `bg-accent-hover`                   | Migrate old token      |
| `text-action-primary`                       | `text-accent`                       | Migrate old token      |
| `bg-action-secondary`                       | `bg-app-text`                       | Was dark bg            |
| `bg-action-danger`                          | `bg-danger`                         | Migrate old token      |
| `text-white` (in non-immersive)             | `text-app-text` or context-specific | Theme text             |
| `text-black`                                | `text-app-text`                     | Theme text             |
| `bg-neutral-950` / `bg-neutral-900`         | `bg-app-bg`                         | Theme bg               |
| `bg-[#CCFF00]`                              | `bg-accent`                         | Use token              |
| `hover:bg-[#b8e600]` / `hover:bg-[#B8E600]` | `hover:bg-accent-hover`             | Use token              |
| `text-[#CCFF00]`                            | `text-accent`                       | Use token              |
| `bg-surface-accent`                         | `bg-accent-muted`                   | Migrate old token      |
| `hover:shadow-md`                           | remove                              | No shadows             |
| `shadow-sm`                                 | remove                              | No shadows             |
| `shadow-md`                                 | remove (unless on portals/overlays) | No shadows             |

**Important exceptions:**

- `text-white` is OK inside `bg-accent` or `bg-danger` buttons (it's the button text). Use `text-accent-text` instead.
- POS/Kitchen immersive pages can keep their own dark backgrounds.
- Marketing pages (not in admin) are NOT affected.

**Step 2: Run full quality pipeline**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: All pass

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/admin/ src/components/features/dashboard/
git commit -m "style(admin-sweep): all admin pages use semantic theme tokens"
```

---

### Task 7: Update dashboard sub-components (Charts, KPIs, etc.)

**Files:**

- Modify: `src/components/features/dashboard/DashboardCharts.tsx`
- Modify: `src/components/features/dashboard/DashboardDonut.tsx`
- Modify: `src/components/features/dashboard/DashboardHourlyBar.tsx`
- Modify: `src/components/features/dashboard/DashboardRecentOrders.tsx`
- Modify: `src/components/features/dashboard/DashboardKPIs.tsx`
- Modify: `src/components/features/dashboard/PeriodSelector.tsx`
- Modify: `src/components/admin/StatsCard.tsx`

Apply the same token replacements from Task 6. These files currently use old tokens like `bg-surface-primary`, `text-text-primary`, `border-border-default`.

**Step 1: Same pattern replacement as Task 6**

**Step 2: Run typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/dashboard/ src/components/admin/StatsCard.tsx
git commit -m "style(dashboard-components): theme-aware charts, KPIs, recent orders"
```

---

### Task 8: Clean up legacy tokens from globals.css

**Files:**

- Modify: `src/app/globals.css`

**Step 1: Remove all legacy tokens from @theme that are no longer referenced**

After the sweep, grep the entire codebase for any remaining references to old tokens. Remove unused ones from `@theme`:

- `--color-surface-*` (replaced by `--app-*`)
- `--color-border-*` (replaced by `--app-border*`)
- `--color-text-*` (replaced by `--app-text*`)
- `--color-action-*` (replaced by `--app-accent*`)
- `--color-brand-*`, `--color-neutral-*` etc.

Keep status colors as they're still used.

**Step 2: Run full pipeline**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: All 5 gates pass

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "chore: remove legacy design tokens — clean single-source theme system"
```

---

### Task 9: Final visual verification

**Step 1: Run dev server**

Run: `pnpm dev`

**Step 2: Verify in browser**

- Open http://localhost:3000/sites/{slug}/admin
- **Dark mode** (default): deep dark bg, card surfaces, bare icons, lime accent on POS tile, clean KPIs
- Toggle to **light mode**: light bg, white cards, dark-green accent, all text readable
- Toggle back: smooth transition (200ms)
- Check sub-pages (orders, categories, inventory): consistent theme
- Check mobile: bottom nav themed correctly
- Check immersive (POS, Kitchen): unaffected

**Step 3: Run full CI pipeline**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: All 5 gates pass

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "style: final polish — Attabl Premium dark/light theme system"
```
