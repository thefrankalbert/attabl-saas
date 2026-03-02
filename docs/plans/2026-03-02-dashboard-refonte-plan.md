# Dashboard Refonte Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the admin dashboard with a Finance Dashboard-inspired layout: horizontal KPI bar, 2-column sections with overview/recent orders, category grid/top items table, and quick access navigation.

**Architecture:** Replace `DashboardClient.tsx` content with 4 new sections. All data is already fetched via `useDashboardData` hook (stats, recentOrders, categoryBreakdown, popularItems, sparklines). No new API calls needed. Add missing i18n keys for new labels.

**Tech Stack:** React 19, Tailwind CSS v4, Recharts (sparklines), Lucide icons, next-intl

---

### Task 1: Add missing i18n keys

**Files:**

- Modify: `src/messages/fr-FR.json:190-250` (admin section)
- Modify: `src/messages/en-US.json:190-250` (admin section)

**Step 1: Add French keys**

In `src/messages/fr-FR.json`, inside the `"admin"` object, add these keys after the existing dashboard keys (around line 248):

```json
"dashboardOverview": "Vue d'ensemble",
"dashboardRecentOrders": "Commandes recentes",
"popularCategories": "Categories populaires",
"topItemsTitle": "Top articles",
"quickAccessTitle": "Acces rapides",
"activeTables": "Tables actives",
"avgBasket": "Panier moyen",
"pendingCount": "{count} en attente",
"viewOrders": "Voir les commandes",
"openPOS": "Ouvrir la caisse",
"perOrder": "par commande",
"occupied": "occupees",
"rank": "#",
"itemName": "Article",
"qtySold": "Qte",
"revGenerated": "CA",
"ordersLabel2": "{count} cmd"
```

**Step 2: Add English keys**

In `src/messages/en-US.json`, inside the `"admin"` object, add the same keys:

```json
"dashboardOverview": "Overview",
"dashboardRecentOrders": "Recent orders",
"popularCategories": "Popular categories",
"topItemsTitle": "Top items",
"quickAccessTitle": "Quick access",
"activeTables": "Active tables",
"avgBasket": "Avg. basket",
"pendingCount": "{count} pending",
"viewOrders": "View orders",
"openPOS": "Open POS",
"perOrder": "per order",
"occupied": "occupied",
"rank": "#",
"itemName": "Item",
"qtySold": "Qty",
"revGenerated": "Revenue",
"ordersLabel2": "{count} orders"
```

**Step 3: Add same keys to remaining locale files**

Copy the English keys to: `en-GB.json`, `en-AU.json`, `en-CA.json`, `en-IE.json`. Copy the French keys to: `fr-CA.json`, `es-ES.json` (use French as fallback for Spanish).

**Step 4: Verify no syntax errors**

Run: `pnpm typecheck`
Expected: PASS (i18n keys are loosely typed)

**Step 5: Commit**

```bash
git add src/messages/*.json
git commit -m "feat(dashboard): add i18n keys for dashboard refonte"
```

---

### Task 2: Rewrite DashboardClient — KPI bar (Section 1)

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx` (full rewrite)

**Step 1: Replace the entire DashboardClient component**

Replace the content of `DashboardClient.tsx` with the new layout. The component keeps the same props and hook usage but replaces the hero banner + AdminHomeGrid with the new 4-section layout.

The KPI bar section replaces the old hero banner. It renders 5 horizontal cards:

```tsx
// Top of file: keep existing imports, add:
import { DollarSign, ShoppingBag, Package, LayoutGrid } from 'lucide-react';
import Link from 'next/link';

// KPI Bar component (inside DashboardClient.tsx)
interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: number;
  subtitle?: string;
  colorClass: string; // e.g. "bg-accent/10 text-accent"
}

function KPICard({ icon, label, value, trend, subtitle, colorClass }: KPICardProps) {
  return (
    <div className="flex-1 min-w-[140px] rounded-xl border border-app-border bg-app-card p-4 flex items-start gap-3">
      <div className={cn('rounded-lg p-2', colorClass)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-app-text-muted font-semibold truncate">
          {label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-2xl font-black text-app-text tabular-nums tracking-tight leading-none">
            {value}
          </span>
          {trend !== undefined && trend !== 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px] font-bold',
                trend > 0 ? 'text-emerald-500' : 'text-red-500',
              )}
            >
              {trend > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {trend > 0 ? '+' : ''}
              {trend}%
            </span>
          )}
        </div>
        {subtitle && <p className="text-[10px] text-app-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
```

The KPI bar renders inside the main component as:

```tsx
{
  /* Section 1: KPI Bar */
}
<div className="shrink-0 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
  <KPICard
    icon={<DollarSign className="w-4 h-4" />}
    label={t('revenueToday')}
    value={fmtCompact(stats.revenueToday)}
    trend={stats.revenueTrend}
    colorClass="bg-emerald-500/10 text-emerald-500"
  />
  <KPICard
    icon={<ShoppingBag className="w-4 h-4" />}
    label={t('ordersToday')}
    value={stats.ordersToday}
    trend={stats.ordersTrend}
    colorClass="bg-accent/10 text-accent"
  />
  <KPICard
    icon={<Package className="w-4 h-4" />}
    label={t('activeItems')}
    value={stats.activeItems}
    subtitle={t('onMenuSubtitle')}
    colorClass="bg-blue-500/10 text-blue-500"
  />
  <KPICard
    icon={<LayoutGrid className="w-4 h-4" />}
    label={t('activeTables')}
    value={stats.activeCards}
    subtitle={t('occupied')}
    colorClass="bg-amber-500/10 text-amber-500"
  />
  <KPICard
    icon={<TrendingUp className="w-4 h-4" />}
    label={t('avgBasket')}
    value={
      stats.ordersToday > 0 ? fmtCompact(Math.round(stats.revenueToday / stats.ordersToday)) : '-'
    }
    subtitle={t('perOrder')}
    colorClass="bg-purple-500/10 text-purple-500"
  />
</div>;
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): rewrite KPI bar section"
```

---

### Task 3: Add Section 2 — Overview + Recent Orders (2 columns)

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Step 1: Add the overview and recent orders sections**

Below the KPI bar in DashboardClient, add the 2-column layout:

```tsx
{
  /* Section 2: Overview + Recent Orders */
}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Left: Overview */}
  <div className="rounded-xl border border-app-border bg-app-card p-5">
    <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-4">
      {t('dashboardOverview')}
    </h2>

    {/* Revenue big number */}
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-widest text-app-text-muted font-semibold">
        {t('revenueToday')}
      </p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-4xl font-black text-app-text tabular-nums tracking-tighter">
          {fmtCompact(stats.revenueToday)}
        </span>
        {stats.revenueTrend !== undefined && stats.revenueTrend !== 0 && (
          <span
            className={cn(
              'text-xs font-bold',
              stats.revenueTrend > 0 ? 'text-emerald-500' : 'text-red-500',
            )}
          >
            {stats.revenueTrend > 0 ? '+' : ''}
            {stats.revenueTrend}%
          </span>
        )}
      </div>
    </div>

    {/* Pending orders count */}
    {(() => {
      const pendingCount = recentOrders.filter((o) => o.status === 'pending').length;
      return pendingCount > 0 ? (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm font-semibold text-amber-600">
            {t('pendingCount', { count: pendingCount })}
          </p>
        </div>
      ) : null;
    })()}

    {/* Sparkline */}
    {revenueSparkline.length > 1 && (
      <div className="mt-2">
        <ResponsiveContainer width="100%" height={48}>
          <AreaChart data={revenueSparkline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="overview-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              fill="url(#overview-spark)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )}

    {/* CTA buttons */}
    <div className="flex gap-2 mt-4">
      <Link
        href={`${adminBase}/orders`}
        className="flex-1 text-center px-3 py-2 rounded-lg bg-accent text-accent-text text-sm font-semibold hover:bg-accent/90 transition-colors"
      >
        {t('viewOrders')}
      </Link>
      <Link
        href={`${adminBase}/pos`}
        className="flex-1 text-center px-3 py-2 rounded-lg border border-app-border bg-app-elevated text-app-text text-sm font-semibold hover:bg-app-hover transition-colors"
      >
        {t('openPOS')}
      </Link>
    </div>
  </div>

  {/* Right: Recent Orders */}
  <div className="rounded-xl border border-app-border bg-app-card p-5">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-bold text-app-text uppercase tracking-wide">
        {t('dashboardRecentOrders')}
      </h2>
      <Link
        href={`${adminBase}/orders`}
        className="text-xs text-accent font-semibold hover:underline"
      >
        {t('viewAll')}
      </Link>
    </div>
    <div className="space-y-2">
      {recentOrders.slice(0, 3).map((order) => (
        <Link
          key={order.id}
          href={`${adminBase}/orders/${order.id}`}
          className="flex items-center justify-between p-3 rounded-lg bg-app-elevated hover:bg-app-hover transition-colors group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-app-text">
                {order.table_number}
              </span>
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full',
                  order.status === 'pending' && 'bg-amber-500/10 text-amber-500',
                  order.status === 'preparing' && 'bg-purple-500/10 text-purple-500',
                  order.status === 'ready' && 'bg-emerald-500/10 text-emerald-500',
                  order.status === 'delivered' && 'bg-app-bg text-app-text-muted',
                  order.status === 'cancelled' && 'bg-red-500/10 text-red-500',
                )}
              >
                {order.status}
              </span>
            </div>
            <p className="text-xs text-app-text-muted mt-0.5">
              {timeAgo(order.created_at, t, locale)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-app-text">
              {formatCurrency(order.total_price, currency as CurrencyCode)}
            </span>
            <ChevronRight className="w-4 h-4 text-app-text-muted mt-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </Link>
      ))}
      {recentOrders.length === 0 && (
        <p className="text-sm text-app-text-muted text-center py-6">{t('noOrdersDescAlt')}</p>
      )}
    </div>
  </div>
</div>;
```

Note: Import `ChevronRight` from lucide-react, `formatCurrency` from `@/lib/utils/currency`, and `timeAgo` from `@/hooks/useDashboardData`. Also destructure `recentOrders` from `useDashboardData` return.

**Step 2: Verify compilation**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): add overview + recent orders section"
```

---

### Task 4: Add Section 3 — Popular Categories + Top Items (2 columns)

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Step 1: Add categories grid and top items table**

Below Section 2 in DashboardClient:

```tsx
{
  /* Section 3: Categories + Top Items */
}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Left: Popular Categories (Budget Tracking style grid) */}
  <div className="rounded-xl border border-app-border bg-app-card p-5">
    <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-4">
      {t('popularCategories')}
    </h2>
    <div className="grid grid-cols-2 gap-2">
      {categoryBreakdown.length > 0 ? (
        categoryBreakdown.map((cat, i) => {
          const bgColors = [
            'bg-emerald-500/10 border-emerald-500/20',
            'bg-amber-500/10 border-amber-500/20',
            'bg-blue-500/10 border-blue-500/20',
            'bg-purple-500/10 border-purple-500/20',
            'bg-rose-500/10 border-rose-500/20',
            'bg-cyan-500/10 border-cyan-500/20',
          ];
          const textColors = [
            'text-emerald-600',
            'text-amber-600',
            'text-blue-600',
            'text-purple-600',
            'text-rose-600',
            'text-cyan-600',
          ];
          return (
            <div
              key={cat.name}
              className={cn('rounded-lg border p-3', bgColors[i % bgColors.length])}
            >
              <p className={cn('text-xs font-bold', textColors[i % textColors.length])}>
                {cat.name}
              </p>
              <p className="text-lg font-black text-app-text mt-1 tabular-nums">
                {fmtCompact(cat.value)}
              </p>
            </div>
          );
        })
      ) : (
        <p className="col-span-2 text-sm text-app-text-muted text-center py-6">
          {t('noDataAvailable')}
        </p>
      )}
    </div>
  </div>

  {/* Right: Top Items table */}
  <div className="rounded-xl border border-app-border bg-app-card p-5">
    <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-4">
      {t('topItemsTitle')}
    </h2>
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-app-text-muted border-b border-app-border">
            <th className="text-left pb-2 font-semibold">{t('rank')}</th>
            <th className="text-left pb-2 font-semibold">{t('itemName')}</th>
            <th className="text-right pb-2 font-semibold">{t('qtySold')}</th>
          </tr>
        </thead>
        <tbody>
          {initialPopularItems.slice(0, 5).map((item, i) => (
            <tr key={item.id} className="border-b border-app-border/50 last:border-0">
              <td className="py-2 text-app-text-muted font-mono text-xs">{i + 1}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  {item.image_url && (
                    <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                  )}
                  <span className="text-app-text font-medium truncate">{item.name}</span>
                </div>
              </td>
              <td className="py-2 text-right font-bold text-app-text tabular-nums">
                {item.order_count}
              </td>
            </tr>
          ))}
          {initialPopularItems.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center py-6 text-app-text-muted">
                {t('noDataAvailable')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
</div>;
```

Note: `categoryBreakdown` comes from `useDashboardData` return. For `initialPopularItems`, we need to pass it through props — it's already fetched in the server page.tsx but not currently forwarded to the hook. We'll use it directly from props. Add `initialPopularItems` to the destructured props of DashboardClient.

**Step 2: Update DashboardClient props**

Add to the props destructuring:

```tsx
export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF', establishmentType, initialPopularItems = [] } = props;
  // ... existing hook call
  const { stats, recentOrders, categoryBreakdown, revenueSparkline, /* ... */ } = useDashboardData(props);
```

Note: `initialPopularItems` is in the `UseDashboardDataParams` interface — check if it exists. If not, extend the props type to include it separately:

```tsx
type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
  initialPopularItems?: PopularItem[];
};
```

And import `PopularItem` from `@/types/admin.types`.

**Step 3: Verify compilation**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): add categories grid + top items table"
```

---

### Task 5: Add Section 4 — Quick Access grid + wire up full layout

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`
- Modify: `src/components/admin/AdminHomeGrid.tsx` (add title prop)

**Step 1: Add title prop to AdminHomeGrid**

In `src/components/admin/AdminHomeGrid.tsx`, update the interface and component:

```tsx
interface AdminHomeGridProps {
  basePath: string;
  establishmentType?: string;
  title?: string;
}

export default function AdminHomeGrid({ basePath, establishmentType, title }: AdminHomeGridProps) {
  const t = useTranslations('sidebar');
  const tiles = TILE_MAP[establishmentType || 'restaurant'] || RESTAURANT_TILES;
  // ... existing code

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {title && (
        <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-3 shrink-0">
          {title}
        </h2>
      )}
      <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
        {/* ... existing featured + regular tiles ... */}
      </div>
    </div>
  );
}
```

**Step 2: Update DashboardClient to pass title**

In the Section 4 area of DashboardClient:

```tsx
{
  /* Section 4: Quick Access */
}
<AdminHomeGrid
  basePath={adminBase}
  establishmentType={establishmentType}
  title={t('quickAccessTitle')}
/>;
```

**Step 3: Wire up the full layout wrapper**

The complete DashboardClient return should be:

```tsx
return (
  <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-y-auto">
    {/* Greeting */}
    <div className="shrink-0">
      <h1 className="text-lg sm:text-xl font-bold text-app-text tracking-tight">
        {t(greetingKey)}, {tenantName}
      </h1>
      <p className="text-xs text-app-text-muted mt-0.5 capitalize">
        {new Date().toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
    </div>

    {/* Section 1: KPI Bar */}
    {/* ... KPI cards ... */}

    {/* Section 2: Overview + Recent Orders */}
    {/* ... 2-column grid ... */}

    {/* Section 3: Categories + Top Items */}
    {/* ... 2-column grid ... */}

    {/* Section 4: Quick Access */}
    <AdminHomeGrid
      basePath={adminBase}
      establishmentType={establishmentType}
      title={t('quickAccessTitle')}
    />
  </div>
);
```

Key change: the outer div uses `overflow-y-auto` instead of `overflow-hidden` so the full dashboard is scrollable.

**Step 4: Remove old HeroKPI component**

Delete the `HeroKPI` function component from the file since it's no longer used.

**Step 5: Clean up unused imports**

Remove any imports that are no longer used (e.g., old sparkline gradients).

**Step 6: Verify compilation and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/admin/DashboardClient.tsx src/components/admin/AdminHomeGrid.tsx
git commit -m "feat(dashboard): add quick access section + wire full layout"
```

---

### Task 6: Pass initialPopularItems from server page

**Files:**

- Modify: `src/app/sites/[site]/admin/page.tsx`

**Step 1: Verify props are passed**

Check that `initialPopularItems` is already passed to `DashboardClient`. Looking at the current code, it's NOT passed. Add it:

In `src/app/sites/[site]/admin/page.tsx`, update the return:

```tsx
return (
  <DashboardClient
    tenantId={tenant.id}
    tenantSlug={tenant.slug}
    tenantName={tenant.name}
    initialStats={initialStats}
    initialRecentOrders={initialRecentOrders}
    initialPopularItems={initialPopularItems}
    currency={tenant.currency}
    establishmentType={tenant.establishment_type ?? 'restaurant'}
  />
);
```

**Step 2: Update DashboardClientProps type**

Ensure the type includes `initialPopularItems`. If `UseDashboardDataParams` doesn't include it, update `DashboardClient.tsx`:

```tsx
type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
  initialPopularItems?: PopularItem[];
};
```

**Step 3: Verify compilation**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/page.tsx src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): pass initialPopularItems from server to client"
```

---

### Task 7: Update loading skeleton

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx` (loading state)

**Step 1: Replace the loading skeleton**

Replace the current loading state with one that matches the new layout:

```tsx
if (loading) {
  return (
    <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-hidden">
      {/* Greeting skeleton */}
      <div className="shrink-0">
        <div className="h-6 w-48 bg-app-elevated rounded animate-pulse" />
        <div className="h-3 w-32 bg-app-elevated rounded animate-pulse mt-1" />
      </div>
      {/* KPI bar skeleton */}
      <div className="shrink-0 flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 min-w-[140px] h-[80px] rounded-xl bg-app-elevated animate-pulse"
          />
        ))}
      </div>
      {/* 2-column skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-[250px] rounded-xl bg-app-elevated animate-pulse" />
        <div className="h-[250px] rounded-xl bg-app-elevated animate-pulse" />
      </div>
      {/* 2-column skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-[200px] rounded-xl bg-app-elevated animate-pulse" />
        <div className="h-[200px] rounded-xl bg-app-elevated animate-pulse" />
      </div>
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): update loading skeleton for new layout"
```

---

### Task 8: Final verification — build, lint, visual check

**Step 1: Run full CI checks**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: All 3 PASS

**Step 2: Visual verification**

Open `http://localhost:3000/sites/lepicurien/admin` in a browser and verify:

- KPI bar shows 5 cards horizontally
- Overview section shows revenue + sparkline + CTA buttons
- Recent orders show last 3 orders with status badges
- Categories grid shows colored cards
- Top items shows ranked table
- Quick access grid at the bottom
- Mobile responsive (stack vertically)
- Dark/light theme works

**Step 3: Final commit (if any fixes)**

```bash
git add -A
git commit -m "fix(dashboard): visual polish for refonte"
```
