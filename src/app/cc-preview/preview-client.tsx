'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommandCenterShell } from '@/components/admin/tenants/v2/CommandCenterShell';
import { TopbarMinimal } from '@/components/admin/tenants/v2/TopbarMinimal';
import { Hero } from '@/components/admin/tenants/v2/Hero';
import { MicroRow } from '@/components/admin/tenants/v2/MicroRow';
import { ChartPanelMinimal } from '@/components/admin/tenants/v2/ChartPanelMinimal';
import { AlertsPanel } from '@/components/admin/tenants/v2/AlertsPanel';
import { EstablishmentCard } from '@/components/admin/tenants/v2/EstablishmentCard';
import { FirstSteps } from '@/components/admin/tenants/v2/FirstSteps';
import { FluxList } from '@/components/admin/tenants/v2/FluxList';
import type {
  ChartDataPoint,
  ChartMode,
  ChartPeriod,
  CommandCenterAlert,
  CommandCenterGlobals,
  LocationStat,
  RecentOrder,
} from '@/types/command-center.types';

type Scenario = 'empty' | 'active';

const noop = () => {};

const CARD_LABELS = {
  manage: 'Gerer mon restaurant',
  viewMenu: 'Voir le menu',
  qr: 'QR code',
  online: 'En ligne',
  offline: 'Hors ligne',
  revenueToday: "CA aujourd'hui",
  ordersToday: 'commandes',
  trend: 'vs hier',
  trendNew: 'nouveau',
  noSales: 'Pas encore de ventes',
};

function planLabelOf(plan: string | null): string | undefined {
  if (!plan) return undefined;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

const FIRST_STEPS = [
  {
    key: 'menu',
    icon: 'menu' as const,
    title: 'Voir mon menu public',
    hint: 'Ce que vos clients voient',
    onClick: noop,
  },
  {
    key: 'qr',
    icon: 'qr' as const,
    title: 'Partager mon QR code',
    hint: 'A poser sur les tables',
    onClick: noop,
  },
  {
    key: 'dishes',
    icon: 'dishes' as const,
    title: 'Ajouter des plats',
    hint: 'Completer votre carte',
    onClick: noop,
  },
];

// --- Mock data ---------------------------------------------------------------

const EMPTY_LOCATIONS: LocationStat[] = [
  {
    tenant_id: 't-gianni',
    tenant_slug: 'blutable',
    tenant_name: 'Gianni food',
    tenant_plan: 'starter',
    tenant_logo_url: null,
    is_active: true,
    revenue_today: 0,
    revenue_yesterday: 0,
    orders_today: 0,
    orders_yesterday: 0,
    sparkline: [],
  },
];

const ACTIVE_LOCATIONS: LocationStat[] = [
  {
    tenant_id: 't-gianni',
    tenant_slug: 'blutable',
    tenant_name: 'Gianni food',
    tenant_plan: 'pro',
    tenant_logo_url: null,
    is_active: true,
    revenue_today: 84500,
    revenue_yesterday: 71000,
    orders_today: 23,
    orders_yesterday: 19,
    sparkline: [2, 4, 3, 6, 8, 7, 9, 12, 10, 14, 13, 16],
  },
  {
    tenant_id: 't-maquis',
    tenant_slug: 'maquis-royal',
    tenant_name: 'Le Maquis Royal',
    tenant_plan: 'business',
    tenant_logo_url: null,
    is_active: true,
    revenue_today: 152000,
    revenue_yesterday: 168000,
    orders_today: 41,
    orders_yesterday: 44,
    sparkline: [5, 7, 6, 9, 11, 10, 13, 12, 15, 14, 18, 17],
  },
  {
    tenant_id: 't-cafe',
    tenant_slug: 'cafe-central',
    tenant_name: 'Cafe Central',
    tenant_plan: 'starter',
    tenant_logo_url: null,
    is_active: false,
    revenue_today: 0,
    revenue_yesterday: 12000,
    orders_today: 0,
    orders_yesterday: 4,
    sparkline: [1, 0, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  },
];

const EMPTY_GLOBALS: CommandCenterGlobals = {
  total_locations: 1,
  active_locations: 1,
  revenue_today: 0,
  revenue_yesterday: 0,
  orders_today: 0,
  orders_yesterday: 0,
  alerts_count: 0,
};

const ACTIVE_GLOBALS: CommandCenterGlobals = {
  total_locations: 3,
  active_locations: 2,
  revenue_today: 236500,
  revenue_yesterday: 251000,
  orders_today: 64,
  orders_yesterday: 67,
  alerts_count: 2,
};

const ACTIVE_CHART: ChartDataPoint[] = Array.from({ length: 24 }, (_, h) => {
  const base = h < 6 ? 0 : Math.round(2000 + Math.sin(h / 3) * 5000 + h * 600);
  return {
    label: `${String(h).padStart(2, '0')}h`,
    revenue: Math.max(0, base),
    orders: Math.round(base / 3500),
  };
});

const ACTIVE_ORDERS: RecentOrder[] = [
  {
    id: 'o1',
    order_number: '0042',
    total: 6500,
    status: 'pending',
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
    tenant_name: 'Gianni food',
    tenant_slug: 'blutable',
  },
  {
    id: 'o2',
    order_number: '0041',
    total: 12000,
    status: 'preparing',
    created_at: new Date(Date.now() - 11 * 60000).toISOString(),
    tenant_name: 'Le Maquis Royal',
    tenant_slug: 'maquis-royal',
  },
  {
    id: 'o3',
    order_number: '0040',
    total: 3500,
    status: 'delivered',
    created_at: new Date(Date.now() - 26 * 60000).toISOString(),
    tenant_name: 'Gianni food',
    tenant_slug: 'blutable',
  },
  {
    id: 'o4',
    order_number: '0039',
    total: 9000,
    status: 'delivered',
    created_at: new Date(Date.now() - 44 * 60000).toISOString(),
    tenant_name: 'Le Maquis Royal',
    tenant_slug: 'maquis-royal',
  },
];

const ACTIVE_ALERTS: CommandCenterAlert[] = [
  {
    id: 'a1',
    kind: 'stock',
    label: 'Stock bas: Poulet braise (3 restants)',
    tenant_name: 'Gianni food',
    tenant_slug: 'blutable',
    severity: 'warn',
    created_at: new Date(Date.now() - 8 * 60000).toISOString(),
  },
  {
    id: 'a2',
    kind: 'offline',
    label: 'Cafe Central est hors ligne',
    tenant_name: 'Cafe Central',
    tenant_slug: 'cafe-central',
    severity: 'error',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
];

// --- Preview client ----------------------------------------------------------

export function PreviewClient() {
  const [scenario, setScenario] = useState<Scenario>('empty');
  const [chartMode, setChartMode] = useState<ChartMode>('revenue');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day');
  const locale = useLocale();

  const isEmpty = scenario === 'empty';
  const locations = isEmpty ? EMPTY_LOCATIONS : ACTIVE_LOCATIONS;
  const globals = isEmpty ? EMPTY_GLOBALS : ACTIVE_GLOBALS;
  const chartData = isEmpty ? [] : ACTIVE_CHART;
  const recentOrders = isEmpty ? [] : ACTIVE_ORDERS;
  const alerts = isEmpty ? [] : ACTIVE_ALERTS;
  const multiTenant = locations.length > 1;
  const lastOrderAt = recentOrders[0]?.created_at ?? null;

  return (
    <CommandCenterShell defaultTheme="light">
      <TopbarMinimal
        crumb="Mes etablissements"
        userInitials="AB"
        userName="Admin BluTable"
        theme="light"
        onLogout={noop}
        onRefresh={noop}
        isRefreshing={false}
      />

      {/* Dev-only scenario switch (not part of the real page) */}
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2 px-4 pt-2 sm:px-6 lg:px-8">
        <span
          className="text-[11px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--cc-text-3)' }}
        >
          Preview
        </span>
        {(['empty', 'active'] as Scenario[]).map((s) => (
          <Button
            key={s}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScenario(s)}
            className="h-auto rounded-md px-2.5 py-1 text-[12px] shadow-none"
            style={
              scenario === s
                ? { background: 'var(--cc-accent-soft)', color: 'var(--cc-accent-ink)' }
                : { color: 'var(--cc-text-3)' }
            }
          >
            {s === 'empty' ? 'Compte vide (Gianni food)' : 'Compte actif (3 sites)'}
          </Button>
        ))}
      </div>

      <main
        id="main-content"
        className="mx-auto w-full min-h-0 max-w-[1400px] flex-1 overflow-y-auto px-4 pb-12 pt-5 sm:px-6 lg:px-8"
      >
        {/* HERO: establishments come first - the reason the owner is here */}
        <section className="mb-9">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div
              className="flex items-center gap-2 text-xs font-medium tracking-[0.02em]"
              style={{ color: 'var(--cc-text-2)' }}
            >
              Vos etablissements
              <span className="cc-mono text-[11px]" style={{ color: 'var(--cc-text-3)' }}>
                {locations.length}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={noop}
              className="min-h-[44px] min-w-[44px] rounded-md"
              style={{ color: 'var(--cc-text-3)' }}
              aria-label="Ajouter un etablissement"
            >
              <Plus className="size-4" strokeWidth={2} />
            </Button>
          </div>
          <div
            className={cn(
              'grid gap-4',
              locations.length === 1 && 'max-w-2xl',
              locations.length === 2 && 'sm:grid-cols-2',
              locations.length >= 3 && 'sm:grid-cols-2 xl:grid-cols-3',
            )}
          >
            {locations.map((loc) => (
              <EstablishmentCard
                key={loc.tenant_id}
                location={loc}
                locale={locale}
                labels={CARD_LABELS}
                planLabel={planLabelOf(loc.tenant_plan)}
                onManage={noop}
                onViewMenu={noop}
                onQr={noop}
              />
            ))}
          </div>
        </section>

        {isEmpty ? (
          <div className="flex flex-col gap-7">
            {/* Compact stats strip (no big empty cards) */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[var(--cc-border)] py-3.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--cc-text-3)]">
                  Commandes
                </span>
                <span className="cc-mono text-[15px] font-semibold text-[var(--cc-text)]">
                  {globals.orders_today}
                </span>
              </div>
              <span aria-hidden className="h-4 w-px bg-[var(--cc-border)]" />
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--cc-text-3)]">
                  Sites
                </span>
                <span
                  className="flex items-center gap-1.5 text-[12.5px]"
                  style={{ color: 'var(--cc-accent-ink)' }}
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: 'var(--cc-accent-ink)' }}
                  />
                  {globals.active_locations} / {globals.total_locations} en ligne
                </span>
              </div>
              <span aria-hidden className="h-4 w-px bg-[var(--cc-border)]" />
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--cc-text-3)]">
                  Alertes
                </span>
                <span className="cc-mono text-[15px] font-semibold text-[var(--cc-text-3)]">-</span>
              </div>
            </div>
            <FirstSteps title="Premiers pas" steps={FIRST_STEPS} columns={3} />
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-y-6 lg:grid-cols-[1.15fr_1fr] lg:gap-x-10">
            <div className="flex min-h-0 flex-col gap-6">
              <Hero
                revenueToday={globals.revenue_today}
                revenueYesterday={globals.revenue_yesterday}
                lastOrderAt={lastOrderAt}
              />
              <MicroRow
                ordersToday={globals.orders_today}
                sitesOnline={globals.active_locations}
                sitesTotal={globals.total_locations}
                alertsCount={alerts.length}
                onAlertsClick={noop}
              />
              <ChartPanelMinimal
                data={chartData}
                mode={chartMode}
                period={chartPeriod}
                onModeChange={setChartMode}
                onPeriodChange={setChartPeriod}
                isLoading={false}
              />
            </div>
            <aside className="flex min-h-0 flex-col gap-7">
              {alerts.length > 0 && (
                <div data-cc-alerts>
                  <AlertsPanel alerts={alerts} onOpenDashboard={noop} multiTenant={multiTenant} />
                </div>
              )}
              <FluxList orders={recentOrders} onSelect={noop} multiTenant={multiTenant} />
            </aside>
          </section>
        )}
      </main>
    </CommandCenterShell>
  );
}
