# Dashboard Admin Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the admin dashboard to a premium 3-column "Clientify Light" layout with improved charts, KPI sparklines, and new data visualizations (donut chart, hourly bar chart).

**Architecture:** Replace the current 3-row grid with a 3-column desktop layout (KPIs left, AreaChart center, widgets right) plus a bottom 2-column section (orders + stock). Data hooks extend existing TanStack Query pattern to fetch hourly orders, category breakdown, sparkline data, and trend comparisons. All new Recharts components use the lime→emerald gradient palette.

**Tech Stack:** Next.js 16 (App Router), React 19, Recharts 3.7, TanStack Query 5, Tailwind CSS 4, next-intl, Supabase, TypeScript 5

---

## Task 1: Add new TypeScript types

**Files:**

- Modify: `src/types/admin.types.ts`

**Context:** The current `DashboardStats` interface has `ordersTrend?` and `revenueTrend?` but they're never populated. We need new types for the donut chart, hourly bar chart, sparkline data, and to actually populate trend values.

**Step 1: Add new types to `src/types/admin.types.ts`**

Add the following types after the existing `DashboardStats` interface (around line 305):

```typescript
export interface CategoryBreakdown {
  name: string;
  value: number;
  color: string;
}

export interface HourlyOrderCount {
  hour: string; // "8h", "10h", etc.
  count: number;
}

export interface SparklinePoint {
  value: number;
}

export interface DashboardExtendedData {
  categoryBreakdown: CategoryBreakdown[];
  hourlyOrders: HourlyOrderCount[];
  revenueSparkline: SparklinePoint[];
  ordersSparkline: SparklinePoint[];
  itemsSparkline: SparklinePoint[];
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no consumers yet)

**Step 3: Commit**

```bash
git add src/types/admin.types.ts
git commit -m "feat(dashboard): add types for category breakdown, hourly orders, sparklines"
```

---

## Task 2: Add i18n translation keys

**Files:**

- Modify: `src/messages/fr-FR.json`
- Modify: `src/messages/en-US.json`
- Modify: `src/messages/en-GB.json`
- Modify: `src/messages/en-AU.json`
- Modify: `src/messages/en-CA.json`
- Modify: `src/messages/en-IE.json`
- Modify: `src/messages/es-ES.json`
- Modify: `src/messages/fr-CA.json`

**Context:** New dashboard components need translation keys for the greeting, period selector, donut chart, hourly bar chart, and updated KPI labels.

**Step 1: Add keys to the `admin` namespace in all locale files**

Add these keys to the `admin` section of each locale file (after existing dashboard keys, around line 244):

**French (fr-FR.json, fr-CA.json):**

```json
"periodDay": "Jour",
"periodWeek": "Semaine",
"periodMonth": "Mois",
"categoryBreakdown": "Répartition",
"categoryOthers": "Autres",
"hourlyOrders": "Commandes / heure",
"revenueThisWeek": "Revenu cette semaine",
"ordersPerHour": "commandes",
"totalOrders": "Total"
```

**English (en-US.json, en-GB.json, en-AU.json, en-CA.json, en-IE.json):**

```json
"periodDay": "Day",
"periodWeek": "Week",
"periodMonth": "Month",
"categoryBreakdown": "Breakdown",
"categoryOthers": "Others",
"hourlyOrders": "Orders / hour",
"revenueThisWeek": "Revenue this week",
"ordersPerHour": "orders",
"totalOrders": "Total"
```

**Spanish (es-ES.json):**

```json
"periodDay": "Día",
"periodWeek": "Semana",
"periodMonth": "Mes",
"categoryBreakdown": "Desglose",
"categoryOthers": "Otros",
"hourlyOrders": "Pedidos / hora",
"revenueThisWeek": "Ingresos esta semana",
"ordersPerHour": "pedidos",
"totalOrders": "Total"
```

**Step 2: Run build to verify JSON is valid**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/messages/
git commit -m "feat(dashboard): add i18n keys for period selector, donut, hourly chart"
```

---

## Task 3: Create PeriodSelector component

**Files:**

- Create: `src/components/features/dashboard/PeriodSelector.tsx`

**Context:** A simple tab-like selector for Day / Week / Month periods. Used in the dashboard greeting bar. Uses existing shadcn `Tabs` component pattern but custom-styled to match the design: pill-shaped, zinc-100 background, lime accent on active tab.

**Step 1: Create the component**

Create `src/components/features/dashboard/PeriodSelector.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

export type Period = 'day' | 'week' | 'month';

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  t: (key: string) => string;
}

const PERIODS: Period[] = ['day', 'week', 'month'];
const PERIOD_KEYS: Record<Period, string> = {
  day: 'periodDay',
  week: 'periodWeek',
  month: 'periodMonth',
};

export default function PeriodSelector({ value, onChange, t }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
      {PERIODS.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            value === period
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700',
          )}
        >
          {t(PERIOD_KEYS[period])}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/dashboard/PeriodSelector.tsx
git commit -m "feat(dashboard): create PeriodSelector component"
```

---

## Task 4: Update StatsCard with sparkline and improved styling

**Files:**

- Modify: `src/components/admin/StatsCard.tsx`

**Context:** The current StatsCard has a horizontal layout (value left, icon right). The redesign calls for:

- Vertical stacking: label on top, value below, trend pill, sparkline at bottom
- `rounded-2xl` instead of `rounded-xl`
- Mini AreaChart sparkline (80×28px, no axes)
- Updated card shadows: `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- `border-zinc-100` instead of `border-neutral-100`
- Larger KPI values: `text-3xl sm:text-4xl font-bold tracking-tight`
- Labels: `text-xs uppercase tracking-wide text-zinc-400 font-medium`

**Step 1: Rewrite StatsCard**

Replace the entire contents of `src/components/admin/StatsCard.tsx`:

```tsx
'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface SparklinePoint {
  value: number;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  sparklineData?: SparklinePoint[];
}

export default function StatsCard({
  title,
  value,
  trend,
  subtitle,
  sparklineData,
}: StatsCardProps) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide text-zinc-400 font-medium">{title}</p>

      {/* Value */}
      <div className="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight mt-1">
        {value}
      </div>

      {/* Trend pill + subtitle */}
      <div className="flex items-center gap-2 mt-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
        {subtitle && <span className="text-xs text-zinc-400 font-medium">{subtitle}</span>}
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-3 -mx-1">
          <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient
                  id={`spark-${title.replace(/\s/g, '')}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#CCFF00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#CCFF00"
                fill={`url(#spark-${title.replace(/\s/g, '')})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-5 sm:p-6 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-3 w-16 bg-zinc-200 rounded" />
      <div className="h-9 w-20 bg-zinc-200 rounded mt-2" />
      <div className="h-4 w-14 bg-zinc-100 rounded-full mt-3" />
      <div className="h-7 w-full bg-zinc-50 rounded mt-3" />
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: May show errors in `DashboardStats.tsx` because we removed the `icon` and `color` props. We'll fix that in the next task.

**Step 3: Commit**

```bash
git add src/components/admin/StatsCard.tsx
git commit -m "feat(dashboard): redesign StatsCard with sparkline, trend pill, vertical layout"
```

---

## Task 5: Rename DashboardStats → DashboardKPIs with vertical stack layout

**Files:**

- Create: `src/components/features/dashboard/DashboardKPIs.tsx`
- Delete: `src/components/features/dashboard/DashboardStats.tsx` (after updating imports)

**Context:** The current `DashboardStats` renders 4 KPI cards in a horizontal `grid-cols-4` row. The redesign needs them **stacked vertically** in the left column on desktop (they become the left sidebar). On mobile, they should be a horizontally scrollable row. The component also now passes sparkline data and trend values to each card.

**Step 1: Create DashboardKPIs**

Create `src/components/features/dashboard/DashboardKPIs.tsx`:

```tsx
'use client';

import StatsCard, { StatsCardSkeleton } from '@/components/admin/StatsCard';
import type { DashboardStats } from '@/types/admin.types';
import type { SparklinePoint } from '@/types/admin.types';

interface DashboardKPIsProps {
  stats: DashboardStats;
  loading: boolean;
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
  showFinancials?: boolean;
  revenueSparkline?: SparklinePoint[];
  ordersSparkline?: SparklinePoint[];
  itemsSparkline?: SparklinePoint[];
}

export default function DashboardKPIs({
  stats,
  loading,
  t,
  fmtCompact,
  showFinancials = true,
  revenueSparkline,
  ordersSparkline,
  itemsSparkline,
}: DashboardKPIsProps) {
  const cardCount = showFinancials ? 3 : 2;

  if (loading) {
    return (
      <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible snap-x lg:snap-none pb-1 lg:pb-0">
        {Array.from({ length: cardCount }, (_, i) => (
          <div key={i} className="min-w-[160px] lg:min-w-0 snap-start">
            <StatsCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible snap-x lg:snap-none pb-1 lg:pb-0">
      {/* Revenue KPI — financial only */}
      {showFinancials && (
        <div className="min-w-[160px] lg:min-w-0 snap-start">
          <StatsCard
            title={t('revenue')}
            value={fmtCompact(stats.revenueToday)}
            trend={
              stats.revenueTrend !== undefined
                ? { value: stats.revenueTrend, isPositive: stats.revenueTrend >= 0 }
                : undefined
            }
            subtitle={t('todayLabel')}
            sparklineData={revenueSparkline}
          />
        </div>
      )}

      {/* Orders KPI */}
      <div className="min-w-[160px] lg:min-w-0 snap-start">
        <StatsCard
          title={t('ordersCount')}
          value={stats.ordersToday}
          trend={
            stats.ordersTrend !== undefined
              ? { value: stats.ordersTrend, isPositive: stats.ordersTrend >= 0 }
              : undefined
          }
          subtitle={t('todayLabel')}
          sparklineData={ordersSparkline}
        />
      </div>

      {/* Active Items KPI */}
      <div className="min-w-[160px] lg:min-w-0 snap-start">
        <StatsCard
          title={t('activeDishes')}
          value={stats.activeItems}
          subtitle={t('onMenuSubtitle')}
          sparklineData={itemsSparkline}
        />
      </div>
    </div>
  );
}
```

**Step 2: Delete old DashboardStats.tsx**

Delete `src/components/features/dashboard/DashboardStats.tsx`.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Error in `DashboardClient.tsx` because it imports `DashboardStats`. We'll fix that in Task 12 when we rewrite DashboardClient.

**Step 4: Commit**

```bash
git add src/components/features/dashboard/DashboardKPIs.tsx
git rm src/components/features/dashboard/DashboardStats.tsx
git commit -m "feat(dashboard): create DashboardKPIs with vertical layout, replace DashboardStats"
```

---

## Task 6: Upgrade DashboardCharts AreaChart

**Files:**

- Modify: `src/components/features/dashboard/DashboardCharts.tsx`

**Context:** The current AreaChart is very basic — no axes, no grid, just a filled area. The redesign adds:

- XAxis with day abbreviations (Lun, Mar...)
- YAxis with formatted values (10k, 20k...)
- CartesianGrid with subtle dashed lines
- Lime→emerald gradient instead of solid lime
- Stroke width 2.5px
- Improved tooltip with dark background
- Section header changed to "Revenue this week"
- Removes the Quick Actions panel entirely (it's no longer part of the charts area)

**Step 1: Rewrite DashboardCharts**

Replace the entire contents of `src/components/features/dashboard/DashboardCharts.tsx`:

```tsx
'use client';

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface RevenueChartDataPoint {
  day: string;
  revenue: number;
}

interface DashboardChartsProps {
  revenueChartData: RevenueChartDataPoint[];
  t: (key: string) => string;
  showRevenueChart?: boolean;
}

function formatCompactValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export default function DashboardCharts({
  revenueChartData,
  t,
  showRevenueChart = true,
}: DashboardChartsProps) {
  if (!showRevenueChart) return null;

  return (
    <div className="bg-white border border-zinc-100 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-900">{t('revenueThisWeek')}</h2>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradientLimeEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#10B981" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickFormatter={formatCompactValue}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#fff',
                padding: '8px 12px',
              }}
              itemStyle={{ color: '#CCFF00', fontWeight: 700 }}
              labelStyle={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}
              cursor={{ stroke: '#CCFF00', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#CCFF00"
              fill="url(#revenueGradientLimeEmerald)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#CCFF00', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Error in `DashboardClient.tsx` because `DashboardCharts` props changed (removed `adminBase`, changed `revenueChartData` shape to use `revenue` key instead of `orders`). We'll fix in Task 12.

**Step 3: Commit**

```bash
git add src/components/features/dashboard/DashboardCharts.tsx
git commit -m "feat(dashboard): upgrade AreaChart with axes, grid, lime-emerald gradient"
```

---

## Task 7: Create DashboardDonut component

**Files:**

- Create: `src/components/features/dashboard/DashboardDonut.tsx`

**Context:** New component showing revenue breakdown by category as a donut chart. Uses Recharts PieChart with innerRadius/outerRadius for the donut shape. Shows top 3 categories + "Others", with a total in the center. The design specifies: lime `#CCFF00`, amber `#F59E0B`, blue `#3B82F6`, zinc `#D4D4D8` for the 4 segments.

**Step 1: Create the component**

Create `src/components/features/dashboard/DashboardDonut.tsx`:

```tsx
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryBreakdown } from '@/types/admin.types';

const COLORS = ['#CCFF00', '#F59E0B', '#3B82F6', '#D4D4D8'];

interface DashboardDonutProps {
  data: CategoryBreakdown[];
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
}

export default function DashboardDonut({ data, t, fmtCompact }: DashboardDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white border border-zinc-100 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-900">{t('categoryBreakdown')}</h2>
      </div>

      {/* Chart + Legend */}
      <div className="flex-1 min-h-0 p-4 flex flex-col items-center justify-center">
        <div className="relative w-full" style={{ maxWidth: 180, aspectRatio: '1/1' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#fff',
                  padding: '8px 12px',
                }}
                formatter={(value: number) => [fmtCompact(value), '']}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-zinc-900">{fmtCompact(total)}</span>
            <span className="text-[10px] text-zinc-400 font-medium">{t('totalOrders')}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 space-y-1.5 w-full">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-zinc-600 truncate">{item.name}</span>
              </div>
              <span className="text-zinc-900 font-semibold tabular-nums">
                {fmtCompact(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/dashboard/DashboardDonut.tsx
git commit -m "feat(dashboard): create DashboardDonut component with category breakdown"
```

---

## Task 8: Create DashboardHourlyBar component

**Files:**

- Create: `src/components/features/dashboard/DashboardHourlyBar.tsx`

**Context:** New component showing orders per hour as a vertical bar chart. Uses Recharts BarChart with lime-colored bars, rounded top corners. XAxis shows hours (8h, 10h, 12h...), no YAxis (space is tight in the right column). Dark tooltip with hour + order count.

**Step 1: Create the component**

Create `src/components/features/dashboard/DashboardHourlyBar.tsx`:

```tsx
'use client';

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { HourlyOrderCount } from '@/types/admin.types';

interface DashboardHourlyBarProps {
  data: HourlyOrderCount[];
  t: (key: string) => string;
}

export default function DashboardHourlyBar({ data, t }: DashboardHourlyBarProps) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-900">{t('hourlyOrders')}</h2>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              dy={4}
              interval={1}
            />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#fff',
                padding: '8px 12px',
              }}
              formatter={(value: number) => [value, t('ordersPerHour')]}
              labelStyle={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}
              cursor={{ fill: 'rgba(204, 255, 0, 0.08)' }}
            />
            <Bar dataKey="count" fill="#CCFF00" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/dashboard/DashboardHourlyBar.tsx
git commit -m "feat(dashboard): create DashboardHourlyBar component with orders/hour bar chart"
```

---

## Task 9: Update DashboardRecentOrders with redesigned layout

**Files:**

- Modify: `src/components/features/dashboard/DashboardRecentOrders.tsx`

**Context:** The current component shows 6 orders and has some styling mismatches. The redesign calls for:

- 8 items instead of 6
- `rounded-2xl` cards
- `border-zinc-100` instead of `border-neutral-100`
- Updated shadow to `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Stock section limited to 8 items instead of 10
- Zinc color palette instead of neutral

**Step 1: Update the component styling**

In `src/components/features/dashboard/DashboardRecentOrders.tsx`, make these changes:

1. Replace all `border-neutral-100` → `border-zinc-100`
2. Replace all `rounded-xl` → `rounded-2xl`
3. Replace all `text-neutral-` → `text-zinc-` (400, 500, 600, 900)
4. Replace all `bg-neutral-` → `bg-zinc-` (50, 100, 200, 400)
5. Replace all `divide-neutral-50` → `divide-zinc-50`
6. Replace all `hover:bg-neutral-50/50` → `hover:bg-zinc-50/50`
7. Add `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` to the outer container divs
8. Add `hover:shadow-md transition-shadow` to the outer container divs

These are purely cosmetic changes — no logic changes needed. The prop interface and behavior remain identical.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/dashboard/DashboardRecentOrders.tsx
git commit -m "feat(dashboard): restyle DashboardRecentOrders with zinc palette, rounded-2xl"
```

---

## Task 10: Extend data hooks with new queries

**Files:**

- Modify: `src/hooks/queries/useDashboardStats.ts`
- Modify: `src/hooks/useDashboardData.ts`

**Context:** The data hooks need to fetch additional data for the new dashboard components:

1. **Hourly orders**: Count orders grouped by hour of creation for today
2. **Category breakdown**: Sum revenue by category via order_items → menu_items → categories join
3. **Sparkline data**: Revenue per day for the last 7 days (for the revenue KPI sparkline)
4. **Trend calculations**: Compare today's orders/revenue vs yesterday's to compute % change

All new queries use the existing Supabase client pattern. They run in parallel with existing queries via `Promise.all`.

**Step 1: Update the DashboardData interface and query in `useDashboardStats.ts`**

In `src/hooks/queries/useDashboardStats.ts`, update the `DashboardData` interface to include new fields and add the new queries:

Add these to the `DashboardData` interface:

```typescript
import type { CategoryBreakdown, HourlyOrderCount, SparklinePoint } from '@/types/admin.types';

interface DashboardData {
  stats: DashboardStats;
  recentOrders: Order[];
  stockItems: StockItem[];
  categoryBreakdown: CategoryBreakdown[];
  hourlyOrders: HourlyOrderCount[];
  revenueSparkline: SparklinePoint[];
  ordersSparkline: SparklinePoint[];
  itemsSparkline: SparklinePoint[];
}
```

Add these new parallel queries inside `queryFn` (append to the existing `Promise.all`):

```typescript
// Yesterday's orders for trend comparison
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(0, 0, 0, 0);
const yesterdayEnd = new Date(yesterday);
yesterdayEnd.setHours(23, 59, 59, 999);

// Add to Promise.all:
// Orders for trend comparison (yesterday)
supabase
  .from('orders')
  .select('id, total_price, total')
  .eq('tenant_id', tenantId)
  .gte('created_at', yesterday.toISOString())
  .lt('created_at', today.toISOString()),

// Orders for last 7 days (for sparklines)
(() => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  return supabase
    .from('orders')
    .select('id, total_price, total, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', sevenDaysAgo.toISOString());
})(),

// Order items with categories for breakdown
supabase
  .from('order_items')
  .select('quantity, price_at_order, menu_items(categories(name))')
  .eq('tenant_id', tenantId)
  .gte('created_at', today.toISOString()),
```

Then process the results to compute:

- `hourlyOrders`: Group today's orders by `new Date(created_at).getHours()`, create entries from 8h to 22h
- `categoryBreakdown`: Group order_items by category name, sum `quantity * price_at_order`, take top 3 + "Others"
- `revenueSparkline` / `ordersSparkline`: Split 7-day orders by date, compute daily sum
- `ordersTrend` / `revenueTrend`: `((today - yesterday) / yesterday) * 100` as percentage

**Step 2: Update `useDashboardData.ts` to expose new data**

In `src/hooks/useDashboardData.ts`, update the `UseDashboardDataReturn` interface:

```typescript
import type { CategoryBreakdown, HourlyOrderCount, SparklinePoint } from '@/types/admin.types';

export interface UseDashboardDataReturn {
  stats: DashboardStats;
  recentOrders: Order[];
  stockItems: StockItem[];
  categoryBreakdown: CategoryBreakdown[];
  hourlyOrders: HourlyOrderCount[];
  revenueSparkline: SparklinePoint[];
  ordersSparkline: SparklinePoint[];
  itemsSparkline: SparklinePoint[];
  loading: boolean;
  handleStatusChange: (orderId: string, newStatus: string) => Promise<void>;
}
```

And extract the new fields from `dashboardData`:

```typescript
const categoryBreakdown = dashboardData?.categoryBreakdown ?? [];
const hourlyOrders = dashboardData?.hourlyOrders ?? [];
const revenueSparkline = dashboardData?.revenueSparkline ?? [];
const ordersSparkline = dashboardData?.ordersSparkline ?? [];
const itemsSparkline = dashboardData?.itemsSparkline ?? [];
```

Return them in the hook's return value.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (or warnings from DashboardClient which we'll fix in Task 12)

**Step 4: Commit**

```bash
git add src/hooks/queries/useDashboardStats.ts src/hooks/useDashboardData.ts
git commit -m "feat(dashboard): extend data hooks with hourly, category, sparkline, trend queries"
```

---

## Task 11: Update admin page SSR queries

**Files:**

- Modify: `src/app/sites/[site]/admin/page.tsx`

**Context:** The server component needs to pass additional initial data matching the new hook shape. Add SSR queries for:

- Yesterday's orders (for trend %)
- Last 7 days orders (for sparklines)
- Order items with categories (for donut)
- Compute initial `hourlyOrders`, `categoryBreakdown`, sparkline arrays

Also change recent orders limit from 6 → 8 to match the design.

**Step 1: Update the SSR queries**

In `src/app/sites/[site]/admin/page.tsx`:

1. Change the recent orders `.limit(6)` → `.limit(8)`
2. Add new parallel queries (yesterday orders, 7-day orders, order items with categories)
3. Compute initial values for `categoryBreakdown`, `hourlyOrders`, sparklines, trends
4. Pass them as props to `<DashboardClient />`

Add to the `Promise.all` block:

```typescript
// Yesterday's orders for trend
supabase
  .from('orders')
  .select('id, total_price, total, status')
  .eq('tenant_id', tenant.id)
  .gte('created_at', yesterday.toISOString())
  .lt('created_at', today.toISOString()),

// Last 7 days orders for sparklines
supabase
  .from('orders')
  .select('id, total_price, total, created_at, status')
  .eq('tenant_id', tenant.id)
  .gte('created_at', sevenDaysAgo.toISOString()),

// Order items with categories for donut
supabase
  .from('order_items')
  .select('quantity, price_at_order, menu_items(categories(name))')
  .eq('tenant_id', tenant.id)
  .gte('created_at', today.toISOString()),
```

Compute `ordersTrend` and `revenueTrend` from yesterday vs today comparison. Set them on `initialStats`.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Verify with dev server**

Run: `pnpm dev` → navigate to `/sites/lepicurien/admin`
Expected: Page loads without errors (even if layout isn't final yet)

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/page.tsx
git commit -m "feat(dashboard): extend SSR with trend, sparkline, category, hourly queries"
```

---

## Task 12: Rewrite DashboardClient with 3-column layout

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Context:** This is the master orchestrator. The entire layout changes from a 3-row grid to a Clientify-style layout:

```
┌──────────────────────────────────────────────────────────────┐
│  "Bonjour, {name}"              Jour | Semaine | Mois  2026 │
├───────────┬────────────────────────────┬─────────────────────┤
│  KPIs     │  AreaChart (center)        │  Donut + BarChart   │
│  (left)   │                            │  (right)            │
├───────────┴───────────────────┬────────┴─────────────────────┤
│  Recent Orders (2/3)          │  Stock Alerts (1/3)          │
└───────────────────────────────┴──────────────────────────────┘
```

**Responsive behavior:**

- **Mobile (<md):** All sections stacked, KPIs horizontal scroll
- **Tablet (md):** 2-column charts, 2-column bottom
- **Desktop (lg+):** Full 3-column layout as shown above

**Step 1: Rewrite DashboardClient**

Replace the entire contents of `src/components/admin/DashboardClient.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { StatsCardSkeleton } from '@/components/admin/StatsCard';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardKPIs from '@/components/features/dashboard/DashboardKPIs';
import PeriodSelector from '@/components/features/dashboard/PeriodSelector';
import type { Period } from '@/components/features/dashboard/PeriodSelector';
import DashboardRecentOrders from '@/components/features/dashboard/DashboardRecentOrders';
import dynamic from 'next/dynamic';

const DashboardCharts = dynamic(() => import('@/components/features/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardDonut = dynamic(() => import('@/components/features/dashboard/DashboardDonut'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardHourlyBar = dynamic(
  () => import('@/components/features/dashboard/DashboardHourlyBar'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
    ),
  },
);

type DashboardClientProps = UseDashboardDataParams;

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF' } = props;
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmt = (amount: number) => formatCurrency(amount, currency as CurrencyCode);
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const [period, setPeriod] = useState<Period>('week');

  const {
    stats,
    recentOrders,
    stockItems,
    categoryBreakdown,
    hourlyOrders,
    revenueSparkline,
    ordersSparkline,
    itemsSparkline,
    loading,
    handleStatusChange,
  } = useDashboardData(props);

  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');
  const showRevenueChart = can('canViewAllFinances');
  const showOrders = can('canViewAllOrders') || can('canViewOwnOrders');
  const showStock = can('canViewStocks');

  // Revenue chart data: 7-day sparkline repurposed as chart data
  const revenueChartData = revenueSparkline.map((point, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (revenueSparkline.length - 1 - i));
    return { day: d.toLocaleDateString(locale, { weekday: 'short' }), revenue: point.value };
  });

  if (loading) {
    return (
      <div className="min-h-0 lg:h-[calc(100dvh-4.5rem)] flex flex-col gap-4 xl:gap-5 overflow-auto lg:overflow-hidden">
        {/* Greeting skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 bg-zinc-200 rounded animate-pulse" />
          <div className="h-8 w-36 bg-zinc-100 rounded-xl animate-pulse" />
        </div>
        {/* Main grid skeleton */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4 xl:gap-5">
          <div className="flex lg:flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <StatsCardSkeleton key={i} />
            ))}
          </div>
          <div className="bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[200px]" />
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[150px]" />
            <div className="flex-1 bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[150px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 lg:h-[calc(100dvh-4.5rem)] flex flex-col gap-4 xl:gap-5 overflow-auto lg:overflow-hidden">
      {/* ─── Greeting Bar ─── */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-zinc-900">
          {t('greeting')}, {tenantName}
        </h1>
        <PeriodSelector value={period} onChange={setPeriod} t={t} />
      </div>

      {/* ─── Main Content: 3-column on desktop ─── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[220px_1fr_260px] gap-4 xl:gap-5">
        {/* Left column: KPIs stacked vertically */}
        <DashboardKPIs
          stats={stats}
          loading={false}
          t={t}
          fmtCompact={fmtCompact}
          showFinancials={showFinancials}
          revenueSparkline={revenueSparkline}
          ordersSparkline={ordersSparkline}
          itemsSparkline={itemsSparkline}
        />

        {/* Center column: AreaChart */}
        <div className="min-h-[250px] lg:min-h-0">
          <DashboardCharts
            revenueChartData={revenueChartData}
            t={t}
            showRevenueChart={showRevenueChart}
          />
        </div>

        {/* Right column: Donut + HourlyBar stacked */}
        <div className="flex flex-col gap-4 xl:gap-5 min-h-0">
          {showFinancials && (
            <div className="flex-1 min-h-[180px]">
              <DashboardDonut data={categoryBreakdown} t={t} fmtCompact={fmtCompact} />
            </div>
          )}
          {showOrders && (
            <div className="flex-1 min-h-[180px]">
              <DashboardHourlyBar data={hourlyOrders} t={t} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Section: Orders + Stock ─── */}
      {(showOrders || showStock) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 xl:gap-5 min-h-[300px] lg:min-h-0 lg:flex-1">
          <DashboardRecentOrders
            recentOrders={recentOrders}
            stockItems={stockItems}
            adminBase={adminBase}
            t={t}
            tc={tc}
            locale={locale}
            fmt={fmt}
            timeAgoFn={timeAgo}
            onStatusChange={handleStatusChange}
            showOrders={showOrders}
            showStock={showStock}
          />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — all imports resolved, all props matched

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: Visual verification**

Run: `pnpm dev` → navigate to `/sites/lepicurien/admin`
Expected: 3-column layout visible on desktop, greeting bar with period selector, KPIs stacked left, AreaChart center, donut+bar right, orders+stock bottom.

**Step 5: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat(dashboard): rewrite DashboardClient with 3-column Clientify Light layout"
```

---

## Task 13: Final verification and cleanup

**Files:**

- Possibly fix any remaining type errors or lint warnings across all modified files

**Step 1: Run full quality pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: All PASS

**Step 2: Run tests**

```bash
pnpm test
```

Expected: All 395+ tests pass (no dashboard-specific tests to break, these are UI components)

**Step 3: Build check**

```bash
pnpm build
```

Expected: Build succeeds with no errors

**Step 4: Visual QA**

Run: `pnpm dev` → check these viewports:

- **Desktop (1440px)**: 3-column layout, greeting bar, all charts visible
- **Tablet (768px)**: 2-column charts, KPIs in row, stacked sections
- **Mobile (375px)**: KPIs scrollable row, everything stacked vertically

Verify:

- AreaChart has lime→emerald gradient, XAxis labels, YAxis values
- Donut shows category segments with lime/amber/blue/zinc colors
- BarChart shows hourly data with lime bars
- KPI cards have sparklines at bottom
- Trend pills show + green or - red
- Dark tooltips on all charts
- Cards have `rounded-2xl`, subtle shadow
- Greeting shows tenant name
- Period selector renders (Day/Week/Month)

**Step 5: Fix any issues found during QA**

Address visual bugs, missing data, or style inconsistencies.

**Step 6: Final commit**

```bash
git add -A
git commit -m "fix(dashboard): final cleanup and QA fixes for dashboard redesign"
```
