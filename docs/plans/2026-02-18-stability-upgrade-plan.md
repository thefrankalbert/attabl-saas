# Stability Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade ATTABL from functional MVP to production-grade, offline-capable SaaS with proper security headers, real charts, sortable/paginated tables, and offline resilience.

**Architecture:** Sequential chantiers (1→2→3→4→5). Each is independently testable. Chantier 5 builds on 3 & 4 by migrating data fetching to TanStack Query hooks that feed both charts and tables.

**Tech Stack:** Next.js 16, React 19, TypeScript 5 strict, Supabase, Tailwind v4, Recharts, @tanstack/react-table, @tanstack/react-query, @ducanh2912/next-pwa

---

## Task 1: Security Headers

**Files:**

- Modify: `next.config.mjs:7-19`

**Step 1: Add security headers to next.config.mjs**

Add a `headers()` function inside `nextConfig`:

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://*.sentry.io",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io",
              'frame-src https://*.stripe.com',
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  images: {
    // ... keep existing config
  },
};
```

**Step 2: Verify headers**

Run: `pnpm build && pnpm start`
Then: `curl -I http://localhost:3000 | grep -i "x-frame\|x-content\|referrer\|strict-transport\|permissions\|content-security"`
Expected: All 6 headers present in response.

**Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "security: add HTTP security headers + CSP report-only"
```

---

## Task 2: Fix DashboardClient Fake Sparkline

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx:56-69` (MiniChart definition)
- Modify: `src/components/admin/DashboardClient.tsx:588-593` (MiniChart usage)

**Step 1: Fix MiniChart to use real data**

The `MiniChart` component at line 56-69 renders hardcoded bar heights. The `orders` state already contains order data with `created_at` dates.

Add a helper function that computes 7-day order counts from the existing `recentOrders` state:

```typescript
function getLast7DaysData(orders: Order[]): number[] {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  return days.map((day) => orders.filter((o) => o.created_at?.startsWith(day)).length);
}
```

Replace the hardcoded `data={[3, 5, 4, 7, 6, 8, 5]}` with `data={getLast7DaysData(recentOrders)}`.

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "fix: replace hardcoded sparkline data with real 7-day order counts"
```

---

## Task 3: Fix InventoryClient Non-functional Sort

**Files:**

- Modify: `src/components/admin/InventoryClient.tsx:4` (imports)
- Modify: `src/components/admin/InventoryClient.tsx:37` (add state)
- Modify: `src/components/admin/InventoryClient.tsx:302-388` (table rendering)

**Step 1: Add sort state and logic**

After the existing filter state (line ~37), add:

```typescript
const [sortField, setSortField] = useState<'name' | 'current_stock' | 'cost_per_unit'>('name');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
```

Add a sort toggle function:

```typescript
const toggleSort = (field: typeof sortField) => {
  if (sortField === field) {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  } else {
    setSortField(field);
    setSortDirection('asc');
  }
};
```

**Step 2: Apply sort to filtered array**

Before the table render, sort the filtered array:

```typescript
const sorted = [...filtered].sort((a, b) => {
  const mul = sortDirection === 'asc' ? 1 : -1;
  if (sortField === 'name') return mul * a.name.localeCompare(b.name);
  return mul * ((a[sortField] ?? 0) - (b[sortField] ?? 0));
});
```

Replace `filtered.map(...)` with `sorted.map(...)` in the table body.

**Step 3: Make column headers clickable**

Wrap the column header text + ArrowUpDown icon in a `<button onClick={() => toggleSort('name')}>` for each sortable column (Name, Stock, Cost). Add visual indicator for active sort direction.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/admin/InventoryClient.tsx
git commit -m "fix: implement functional column sorting in inventory table"
```

---

## Task 4: Create manifest.json + Fix InstallPrompt

**Files:**

- Create: `public/manifest.json`
- Modify: `src/app/layout.tsx` (add manifest link)

**Step 1: Create manifest.json**

```json
{
  "name": "ATTABL - Menu Digital & Commandes",
  "short_name": "ATTABL",
  "description": "Solution digitale pour restaurants et hotels",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#CCFF00",
  "orientation": "any",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Note: Icon files may not exist yet. Use existing favicon or placeholder. The PWA will still work for caching.

**Step 2: Add manifest link to root layout**

In `src/app/layout.tsx`, inside `<head>` or metadata, add:

```html
<link rel="manifest" href="/manifest.json" /> <meta name="theme-color" content="#CCFF00" />
```

**Step 3: Verify InstallPrompt fires**

The existing `InstallPrompt.tsx` component listens for `beforeinstallprompt`. With a valid manifest, this event will now fire on Chrome/Edge. No code changes needed in InstallPrompt.

**Step 4: Commit**

```bash
git add public/manifest.json src/app/layout.tsx
git commit -m "feat: add PWA manifest, enable InstallPrompt"
```

---

## Task 5: Install Recharts

**Files:**

- Modify: `package.json`

**Step 1: Install recharts**

Run: `pnpm add recharts`

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: No errors (recharts ships with TypeScript types).

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add recharts for data visualization"
```

---

## Task 6: Replace DashboardClient CSS Charts with Recharts

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Step 1: Replace MiniChart with Recharts AreaChart**

Remove the hand-coded `MiniChart` component (lines 56-69). Replace with a Recharts-based sparkline:

```typescript
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

function MiniChart({ data }: { data: number[] }) {
  const chartData = data.map((value, index) => ({ day: index, value }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="limeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#CCFF00" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
          labelFormatter={() => ''}
          formatter={(value: number) => [value, 'Commandes']}
        />
        <Area type="monotone" dataKey="value" stroke="#CCFF00" fill="url(#limeGradient)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat: replace CSS sparkline with Recharts AreaChart"
```

---

## Task 7: Replace ReportsClient CSS Charts with Recharts

**Files:**

- Modify: `src/components/admin/ReportsClient.tsx:571-596` (bar chart)
- Modify: `src/components/admin/ReportsClient.tsx:641-669` (category breakdown)

**Step 1: Replace CSS bar chart with Recharts BarChart**

Remove the hand-coded div-based bar chart. Replace with:

```typescript
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
```

Use `<BarChart>` with:

- X-axis: day labels
- Y-axis: revenue amounts with `formatCurrency`
- Bars: fill `#CCFF00`
- Tooltip: bg `#171717`, border `#262626`, rounded

**Step 2: Replace category progress bars with PieChart**

Replace the `<div style={{ width: cat.percentage% }}>` progress bars with a `<PieChart>` or `<DonutChart>`. Use category colors from a predefined palette.

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/admin/ReportsClient.tsx
git commit -m "feat: replace CSS charts with Recharts BarChart + PieChart"
```

---

## Task 8: Install TanStack Table

**Files:**

- Modify: `package.json`

**Step 1: Install @tanstack/react-table**

Run: `pnpm add @tanstack/react-table`

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add @tanstack/react-table for data tables"
```

---

## Task 9: Create DataTable Component

**Files:**

- Create: `src/components/admin/DataTable.tsx`

**Step 1: Create generic DataTable component**

Build a `DataTable<TData>` component that encapsulates TanStack Table with ATTABL styling:

```typescript
'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  searchValue?: string;
  searchColumn?: string;
  isLoading?: boolean;
}
```

Features:

- `getSortedRowModel()` — click column headers to sort
- `getPaginationRowModel()` — 50 rows per page default
- `getFilteredRowModel()` — optional column-level text filter
- Skeleton rows when `isLoading` is true
- ATTABL style: `border border-neutral-100 rounded-xl divide-y divide-neutral-100`
- Pagination footer: "Page X of Y" + prev/next buttons

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/admin/DataTable.tsx
git commit -m "feat: create reusable DataTable component with TanStack Table"
```

---

## Task 10: Migrate InventoryClient to DataTable

**Files:**

- Modify: `src/components/admin/InventoryClient.tsx`

**Step 1: Define columns**

Replace the manual `<table>` block (lines 302-388) with column definitions + `<DataTable>`:

```typescript
import { DataTable } from '@/components/admin/DataTable';
import type { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<Ingredient, unknown>[] = [
  { accessorKey: 'name', header: t('ingredients.name'), enableSorting: true },
  { accessorKey: 'unit', header: t('ingredients.unit') },
  {
    accessorKey: 'current_stock',
    header: t('ingredients.stock'),
    cell: ({ row }) => (
      <span className={cn(row.original.current_stock <= row.original.min_stock_alert ? 'text-red-500 font-bold' : '')}>
        {row.original.current_stock.toFixed(row.original.unit === 'piece' ? 0 : 2)}
      </span>
    ),
    enableSorting: true,
  },
  { accessorKey: 'cost_per_unit', header: t('ingredients.cost'), cell: ({ row }) => formatCurrency(row.original.cost_per_unit, currency as CurrencyCode), enableSorting: true },
  // ... action column with edit/adjust buttons
];
```

**Step 2: Remove old sort state**

Remove the `sortField`, `sortDirection`, `toggleSort` added in Task 3 (DataTable handles this now).

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/admin/InventoryClient.tsx
git commit -m "refactor: migrate InventoryClient to DataTable component"
```

---

## Task 11: Migrate OrdersClient to DataTable

**Files:**

- Modify: `src/components/admin/OrdersClient.tsx`

**Step 1: Define order columns and replace manual table**

Same pattern as Task 10. Columns: Order#, Date, Status (with StatusBadge), Items count, Total.

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/admin/OrdersClient.tsx
git commit -m "refactor: migrate OrdersClient to DataTable component"
```

---

## Task 12: Migrate StockHistoryClient to DataTable

**Files:**

- Modify: `src/components/admin/StockHistoryClient.tsx`

**Step 1: Define stock movement columns and replace manual table**

Columns: Date, Ingredient, Movement Type (with colored badge), Quantity, User.

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/admin/StockHistoryClient.tsx
git commit -m "refactor: migrate StockHistoryClient to DataTable component"
```

---

## Task 13: Migrate SuppliersClient to DataTable

**Files:**

- Modify: `src/components/admin/SuppliersClient.tsx`

**Step 1: Define supplier columns and replace manual table**

Columns: Name, Contact, Email, Phone, Actions.

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/admin/SuppliersClient.tsx
git commit -m "refactor: migrate SuppliersClient to DataTable component"
```

---

## Task 14: Install TanStack Query + PWA Dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install all offline/PWA dependencies**

Run:

```bash
pnpm add @tanstack/react-query @tanstack/query-persist-client-core @tanstack/query-async-storage-persister
pnpm add -D @ducanh2912/next-pwa
```

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add TanStack Query + next-pwa for offline support"
```

---

## Task 15: Configure next-pwa

**Files:**

- Modify: `next.config.mjs`
- Modify: `.gitignore` (add generated SW files)

**Step 1: Wrap Next.js config with withPWA**

```typescript
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

// Wrap the existing config chain:
export default withSentryConfig(withPWA(withNextIntl(nextConfig)), { ... });
```

**Step 2: Add SW files to .gitignore**

```
# PWA generated files
public/sw.js
public/sw.js.map
public/workbox-*.js
public/workbox-*.js.map
public/swe-worker-*.js
```

**Step 3: Build and verify SW generation**

Run: `pnpm build`
Verify: `ls public/sw.js` exists after build.

**Step 4: Commit**

```bash
git add next.config.mjs .gitignore
git commit -m "feat: configure next-pwa for service worker generation"
```

---

## Task 16: Create QueryProvider

**Files:**

- Create: `src/components/providers/QueryProvider.tsx`
- Modify: `src/app/sites/[site]/admin/layout.tsx`

**Step 1: Create QueryProvider with persistence**

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query/persistQueryClient';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { useState } from 'react';

const persister = createAsyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'attabl-query-cache',
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,       // 5 minutes
        gcTime: 24 * 60 * 60 * 1000,     // 24 hours
        retry: 3,
        refetchOnWindowFocus: true,
      },
    },
  }));

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}>
      {children}
    </PersistQueryClientProvider>
  );
}
```

**Step 2: Add QueryProvider to admin layout**

In `src/app/sites/[site]/admin/layout.tsx`, wrap children with `<QueryProvider>`:

```typescript
import { QueryProvider } from '@/components/providers/QueryProvider';

// Inside the return JSX, wrap inside AdminLayoutClient:
<AdminLayoutClient sidebar={sidebarElement} isDevMode={isDevMode}>
  <QueryProvider>
    <PermissionsProvider role={userRole}>
      ...
    </PermissionsProvider>
  </QueryProvider>
</AdminLayoutClient>
```

**Step 3: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/providers/QueryProvider.tsx src/app/sites/\\[site\\]/admin/layout.tsx
git commit -m "feat: add QueryProvider with localStorage persistence"
```

---

## Task 17: Create useNetworkStatus Hook

**Files:**

- Create: `src/hooks/useNetworkStatus.ts`

**Step 1: Implement network status hook**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setWasOffline(false), 5000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isOnline, wasOffline };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useNetworkStatus.ts
git commit -m "feat: add useNetworkStatus hook for online/offline detection"
```

---

## Task 18: Create OfflineIndicator Component

**Files:**

- Create: `src/components/admin/OfflineIndicator.tsx`
- Modify: `src/app/sites/[site]/admin/layout.tsx` (add to layout)

**Step 1: Create OfflineIndicator**

```typescript
'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const t = useTranslations('common');

  if (isOnline && !wasOffline) return null;

  return (
    <div className={cn(
      'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors duration-300',
      isOnline && wasOffline
        ? 'bg-[#CCFF00] text-black'
        : 'bg-neutral-900 text-white'
    )}>
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('connectionRestored')}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          {t('offlineMode')}
        </>
      )}
    </div>
  );
}
```

**Step 2: Add i18n keys**

Add to all 8 locale files under `"common"`:

```json
"offlineMode": "Mode hors ligne - Les donnees sauvegardees sont affichees",
"connectionRestored": "Connexion retablie - Synchronisation en cours..."
```

**Step 3: Add to admin layout**

In `src/app/sites/[site]/admin/layout.tsx`:

```typescript
import { OfflineIndicator } from '@/components/admin/OfflineIndicator';

// Inside return, before AdminLayoutClient:
<OfflineIndicator />
<AdminLayoutClient ...>
```

**Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 5: Commit**

```bash
git add src/components/admin/OfflineIndicator.tsx src/app/sites/\\[site\\]/admin/layout.tsx messages/
git commit -m "feat: add OfflineIndicator banner for network status"
```

---

## Task 19: Create Query Hooks (Read Cache)

**Files:**

- Create: `src/hooks/queries/useMenuItems.ts`
- Create: `src/hooks/queries/useCategories.ts`
- Create: `src/hooks/queries/useIngredients.ts`
- Create: `src/hooks/queries/useTables.ts`
- Create: `src/hooks/queries/useSuppliers.ts`
- Create: `src/hooks/queries/useOrders.ts`
- Create: `src/hooks/queries/useDashboardStats.ts`
- Create: `src/hooks/queries/useReportData.ts`
- Create: `src/hooks/queries/index.ts` (barrel export)

**Step 1: Create each hook following the same pattern**

Example for `useMenuItems.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useMenuItems(tenantId: string) {
  return useQuery({
    queryKey: ['menu-items', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, categories(name, name_en)')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}
```

Each hook wraps the existing Supabase query from the corresponding component. The query key includes `tenantId` for proper cache isolation.

**Step 2: Create barrel export**

```typescript
// src/hooks/queries/index.ts
export { useMenuItems } from './useMenuItems';
export { useCategories } from './useCategories';
export { useIngredients } from './useIngredients';
export { useTables } from './useTables';
export { useSuppliers } from './useSuppliers';
export { useOrders } from './useOrders';
export { useDashboardStats } from './useDashboardStats';
export { useReportData } from './useReportData';
```

**Step 3: Verify**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
git add src/hooks/queries/
git commit -m "feat: create TanStack Query hooks for all data domains"
```

---

## Task 20: Migrate Components to Query Hooks

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`
- Modify: `src/components/admin/POSClient.tsx`
- Modify: `src/components/admin/InventoryClient.tsx`
- Modify: `src/components/admin/ReportsClient.tsx`
- Modify: `src/components/admin/OrdersClient.tsx`
- Modify: `src/components/admin/MenusClient.tsx`
- Modify: `src/components/admin/CategoriesClient.tsx`
- Modify: `src/components/admin/RecipesClient.tsx`
- Modify: `src/components/admin/SuppliersClient.tsx`
- Modify: `src/components/admin/StockHistoryClient.tsx`
- Modify: `src/components/admin/settings/SettingsForm.tsx`

**Step 1: For each component, replace useEffect fetch with useQuery hook**

Pattern — replace this:

```typescript
const [data, setData] = useState<Item[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const supabase = createClient();
  supabase
    .from('items')
    .select('*')
    .eq('tenant_id', tenantId)
    .then(({ data }) => {
      setData(data || []);
      setLoading(false);
    });
}, [tenantId]);
```

With this:

```typescript
import { useMenuItems } from '@/hooks/queries';

const { data: items = [], isLoading: loading } = useMenuItems(tenantId);
```

**Step 2: Keep Supabase Realtime subscriptions but add cache invalidation**

Where components have Realtime subscriptions, add `queryClient.invalidateQueries()`:

```typescript
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

// In the Realtime subscription callback:
channel.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
  () => {
    queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
  },
);
```

**Step 3: Verify each component**

Run after each component migration: `pnpm typecheck`
Run after all: `pnpm typecheck && pnpm lint && pnpm test`

**Step 4: Commit**

```bash
git add src/components/admin/
git commit -m "refactor: migrate all admin components to TanStack Query hooks"
```

---

## Task 21: Create Mutation Queue for Offline Orders

**Files:**

- Create: `src/hooks/mutations/useCreateOrder.ts`
- Create: `src/hooks/mutations/useUpdateOrderStatus.ts`
- Create: `src/hooks/mutations/useAdjustStock.ts`
- Create: `src/hooks/mutations/index.ts`

**Step 1: Create useCreateOrder with offline support**

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function useCreateOrder(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isOnline } = useNetworkStatus();

  return useMutation({
    mutationKey: ['create-order', tenantId],
    mutationFn: async (orderData: CreateOrderInput) => {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      if (!response.ok) throw new Error('Order creation failed');
      return response.json();
    },
    onMutate: () => {
      if (!isOnline) {
        toast({
          title: 'Mode hors ligne',
          description: 'Commande sauvegardee - sera envoyee au retour de la connexion',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      toast({ title: 'Commande envoyee' });
    },
    onError: (error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}
```

**Step 2: Create useUpdateOrderStatus and useAdjustStock**

Same pattern with appropriate API endpoints and cache invalidation.

**Step 3: Wire into POSClient and OrdersClient**

Replace direct `fetch()` / `supabase.from().update()` calls with the mutation hooks.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`

**Step 5: Commit**

```bash
git add src/hooks/mutations/ src/components/admin/POSClient.tsx src/components/admin/OrdersClient.tsx
git commit -m "feat: add offline mutation queue for orders and stock"
```

---

## Task 22: Final Verification

**Step 1: Run all 5 CI gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: All pass, 150+ tests green, build succeeds.

**Step 2: Manual smoke test**

1. Open `http://localhost:3000` — verify security headers in DevTools Network tab
2. Open admin dashboard — verify real sparkline data (not hardcoded)
3. Open inventory — verify columns are sortable via DataTable
4. Open reports — verify Recharts bar chart with tooltips
5. Disconnect wifi — verify OfflineIndicator banner appears
6. Navigate pages offline — verify cached data is shown
7. Reconnect wifi — verify banner shows "Connexion retablie"

**Step 3: Commit any format fixes**

```bash
pnpm format
git add -A
git commit -m "chore: format cleanup after stability upgrade"
```

---

## Execution Order & Parallelization

Tasks are sequential by default, but some can be parallelized:

| Phase          | Tasks                          | Parallel?                                                         |
| -------------- | ------------------------------ | ----------------------------------------------------------------- |
| Security       | 1                              | Solo                                                              |
| Bugs           | 2, 3, 4                        | Yes (independent files)                                           |
| Recharts       | 5, 6, 7                        | 5 first, then 6+7 in parallel                                     |
| TanStack Table | 8, 9, 10, 11, 12, 13           | 8-9 first, then 10+11+12+13 in parallel                           |
| Offline/PWA    | 14, 15, 16, 17, 18, 19, 20, 21 | 14 first, then 15+16+17 in parallel, then 18+19, then 20, then 21 |
| Verification   | 22                             | Solo                                                              |
