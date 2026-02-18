# ATTABL SaaS - Stability Upgrade Design

## Date: 2026-02-18

## Objective

Upgrade ATTABL from a functional MVP to a production-grade, offline-capable SaaS by replacing fragile hand-coded patterns with battle-tested libraries and adding missing security hardening.

## Scope

5 chantiers, executed sequentially to minimize regression risk:

1. Security Headers + CSP
2. Bug Fixes (fake data, broken sort, dead code, missing pagination)
3. Recharts (replace CSS bar charts)
4. TanStack Table (replace manual `<table>` + `map()`)
5. Offline / PWA (next-pwa + TanStack Query + mutation queue)

---

## Chantier 1: Security Headers

**File:** `next.config.mjs`

Add `headers()` function to Next.js config:

| Header                                | Value                                          | Purpose                                    |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `X-Frame-Options`                     | `DENY`                                         | Anti-clickjacking                          |
| `X-Content-Type-Options`              | `nosniff`                                      | Anti-MIME sniffing                         |
| `Referrer-Policy`                     | `strict-origin-when-cross-origin`              | Limit referer leakage                      |
| `Permissions-Policy`                  | `camera=(), microphone=(), geolocation=()`     | Disable sensitive APIs                     |
| `Strict-Transport-Security`           | `max-age=63072000; includeSubDomains; preload` | Force HTTPS                                |
| `Content-Security-Policy-Report-Only` | Whitelist for self, Supabase, Stripe, Sentry   | Progressive CSP (report-only, no blocking) |

**CSP whitelist domains:**

- `*.supabase.co` (API + Realtime WebSocket)
- `*.stripe.com` (checkout iframe)
- `*.sentry.io` + `/monitoring` tunnel route (error reporting)
- `'self'` + `'unsafe-inline'` (Tailwind + Next.js inline styles)
- `data:` + `blob:` (QR code generation, image previews)

**Risk:** Zero. Report-Only CSP never blocks requests.

---

## Chantier 2: Bug Fixes

### 2A: DashboardClient Fake Sparkline Data

**File:** `src/components/admin/DashboardClient.tsx`

**Problem:** `MiniChart` component uses hardcoded `data={[3, 5, 4, 7, 6, 8, 5]}`. Users see fake trends.

**Fix:** Compute real 7-day order count data from the `orders` array already fetched in the component. Group orders by day, pass actual counts to MiniChart.

### 2B: InventoryClient Non-functional Sort

**File:** `src/components/admin/InventoryClient.tsx`

**Problem:** `<ArrowUpDown>` icon renders but does nothing. Misleading UX.

**Fix:** Add `sortField` (`name` | `current_stock` | `cost_per_unit`) and `sortDirection` (`asc` | `desc`) state. Apply sort to the filtered array before rendering. Toggle on column header click.

### 2C: InstallPrompt + manifest.json

**Files:** `public/manifest.json` (new), `src/components/tenant/InstallPrompt.tsx` (already exists)

**Problem:** `InstallPrompt.tsx` listens for `beforeinstallprompt` but no manifest exists, so the event never fires. Dead code.

**Fix:** Create `manifest.json` with ATTABL branding (name, icons, theme_color: #CCFF00, background_color: #000, display: standalone). Add `<link rel="manifest">` in layout. InstallPrompt becomes functional.

### 2D: Pagination on Volume Pages

**Files:** `OrdersClient.tsx`, `StockHistoryClient.tsx`

**Problem:** Both load ALL rows into memory. No pagination.

**Fix:** Add `page` state, `LIMIT 50 OFFSET page*50` to Supabase queries. Simple prev/next buttons. This will be superseded by TanStack Table in Chantier 4, but the Supabase query changes remain.

---

## Chantier 3: Recharts

**New dependency:** `recharts` (~47KB gzip)

### 3A: DashboardClient Charts

**File:** `src/components/admin/DashboardClient.tsx`

Replace CSS `MiniChart` divs with Recharts `<AreaChart>` for the revenue sparkline. Use `<ResponsiveContainer>` for responsive sizing.

Style: stroke `#CCFF00`, fill gradient from `#CCFF00` to transparent, no grid lines, minimal axis.

### 3B: ReportsClient Charts

**File:** `src/components/admin/ReportsClient.tsx`

1. Replace CSS bar chart (div heights) with `<BarChart>` — proper Y-axis, tooltips on hover, lime bars.
2. Replace progress-bar category breakdown with `<PieChart>` or `<DonutChart>` — category names as labels, percentages in tooltips.

Style: Consistent with design charter. Tooltip bg `bg-neutral-900`, text white, border `border-neutral-100`.

---

## Chantier 4: TanStack Table

**New dependency:** `@tanstack/react-table` (headless, ~15KB gzip)

### Shared Component

Create `src/components/admin/DataTable.tsx` — a generic `DataTable<TData>` component that wraps TanStack Table with ATTABL styling:

- `border-neutral-100`, `rounded-xl`, `divide-y divide-neutral-100`
- Built-in column sorting (click header to toggle)
- Built-in pagination (prev/next + page indicator)
- Optional search filter prop
- Skeleton loading state

### Pages to Migrate

| Page                     | Columns                                      | Sort              | Pagination      | Filter                        |
| ------------------------ | -------------------------------------------- | ----------------- | --------------- | ----------------------------- |
| `InventoryClient.tsx`    | Name, Unit, Stock, Min Alert, Cost, Supplier | Yes (all)         | Yes (50/page)   | Status (all/low/out) + search |
| `StockHistoryClient.tsx` | Date, Ingredient, Type, Qty, User            | Yes (date, type)  | Yes (50/page)   | Type filter                   |
| `OrdersClient.tsx`       | Order#, Date, Status, Items, Total           | Yes (date, total) | Yes (50/page)   | Status filter                 |
| `SuppliersClient.tsx`    | Name, Contact, Email, Phone                  | Yes (name)        | No (low volume) | Search                        |

### Migration Pattern

Each page keeps its existing Supabase fetch logic. The `<table>` + `map()` block is replaced by `<DataTable columns={columns} data={filteredData} />`. Column definitions are co-located in each page file.

---

## Chantier 5: Offline / PWA

### 5A: PWA Shell

**New dependency:** `@ducanh2912/next-pwa` (maintained fork, Next.js 14+ compatible)

**Files:**

- `public/manifest.json` (created in 2C)
- `next.config.mjs` — wrap config with `withPWA()`
- Auto-generated `sw.js` service worker caches static assets (JS, CSS, images, fonts)

**Result:** App installable on tablets, loads shell even offline.

### 5B: TanStack Query — Read Cache

**New dependencies:**

- `@tanstack/react-query` (~40KB gzip)
- `@tanstack/query-persist-client-core`
- `@tanstack/query-async-storage-persister`

**Files:**

- `src/components/providers/QueryProvider.tsx` (new) — wraps app with `QueryClientProvider` + `PersistQueryClientProvider`
- `src/app/sites/[site]/admin/layout.tsx` — add QueryProvider
- `src/hooks/queries/` (new directory) — custom hooks per domain

**Custom hooks to create:**

| Hook                              | Data                    | Used by                                |
| --------------------------------- | ----------------------- | -------------------------------------- |
| `useMenuItems(tenantId)`          | Menu items + categories | POSClient, MenusClient, ClientMenuPage |
| `useCategories(tenantId)`         | Categories              | CategoriesClient, MenusClient          |
| `useIngredients(tenantId)`        | Ingredients             | InventoryClient, RecipesClient         |
| `useTables(tenantId)`             | Zones + Tables          | POSClient                              |
| `useSuppliers(tenantId)`          | Suppliers               | SuppliersClient, InventoryClient       |
| `useOrders(tenantId)`             | Orders (paginated)      | OrdersClient, DashboardClient          |
| `useDashboardStats(tenantId)`     | Aggregated stats        | DashboardClient                        |
| `useReportData(tenantId, period)` | Revenue, top items      | ReportsClient                          |
| `useTenantSettings(tenantId)`     | Tenant config           | SettingsForm                           |

**Cache configuration:**

- `staleTime: 5 * 60 * 1000` (5 minutes)
- `gcTime: 24 * 60 * 60 * 1000` (24 hours for persisted cache)
- Cache persisted to `localStorage` via async-storage-persister
- Supabase Realtime subscriptions call `queryClient.invalidateQueries()` on change events

**Result:** All admin pages display cached data instantly. If offline, last-known data is shown instead of blank screen.

### 5C: Mutation Queue — Offline Commands

**Pattern:** TanStack Query `useMutation` with offline retry.

**Mutations to queue:**

- `createOrder` (most critical — POS flow)
- `updateOrderStatus` (kitchen/waiter status changes)
- `adjustStock` (stock movements)

**Behavior:**

1. User clicks "Send to Kitchen"
2. `useMutation` fires. If online → normal API call
3. If offline → mutation stored in `mutationCache` (persisted to localStorage)
4. Toast: "Mode hors ligne - Commande sauvegardee"
5. When `window.ononline` fires → automatic FIFO replay of queued mutations
6. Toast: "Connexion retablie - 3 commandes synchronisees"

**New component:** `src/components/admin/OfflineIndicator.tsx`

- Listens to `navigator.onLine` + `online`/`offline` events
- Shows subtle banner at top of admin layout when offline
- Shows queued mutation count
- Lime accent when syncing, neutral when offline

### 5D: Network Status Hook

**File:** `src/hooks/useNetworkStatus.ts` (new)

```typescript
export function useNetworkStatus(): { isOnline: boolean; wasOffline: boolean };
```

- Uses `navigator.onLine` + event listeners
- `wasOffline` flag persists for 5 seconds after reconnection (for "just reconnected" UI state)

---

## What We Are NOT Doing

| Item                         | Reason                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| Dinero.js / Currency.js      | `Math.round(x*100)/100` + server-side re-validation is correct for XAF |
| convert-units                | No unit conversions in TypeScript code — delegated to Postgres RPCs    |
| MedusaJS / headless commerce | Architecture incompatible, 3-6 month rewrite                           |
| RxDB / Dexie.js              | Overkill — localStorage persistence via TanStack Query suffices        |
| Custom Service Worker        | `next-pwa` auto-generates one with Workbox                             |
| Offline admin mutations      | Settings/user management require complex server validation             |

---

## Dependencies Summary

| Package                                   | Size (gzip) | Purpose                          |
| ----------------------------------------- | ----------- | -------------------------------- |
| `recharts`                                | ~47KB       | Real charts                      |
| `@tanstack/react-table`                   | ~15KB       | Headless data tables             |
| `@tanstack/react-query`                   | ~40KB       | Data caching + offline mutations |
| `@tanstack/query-persist-client-core`     | ~5KB        | Persist cache to localStorage    |
| `@tanstack/query-async-storage-persister` | ~2KB        | Async storage adapter            |
| `@ducanh2912/next-pwa`                    | dev only    | Service worker generation        |

**Total client bundle increase:** ~107KB gzip (acceptable for a SaaS dashboard)

---

## Success Criteria

1. Security headers present on all responses (verify via browser DevTools Network tab)
2. CSP Report-Only logs appear in console (no blocking)
3. DashboardClient shows real trend data
4. InventoryClient columns are sortable
5. All data tables have pagination (50 rows/page)
6. Charts are interactive (tooltips, hover states)
7. App is installable as PWA on tablet (Add to Home Screen)
8. Disconnect wifi → admin pages still show last-known data
9. Create order offline → toast confirms queued → reconnect → order syncs
10. All 5 CI gates pass: typecheck, lint, format, test (150+), build
