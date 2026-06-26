'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/application/loading-indicator/LoadingIndicator';
import { AddRestaurantWizard } from '@/components/admin/AddRestaurantWizard';
import { CommandCenterShell } from '@/components/admin/tenants/v2/CommandCenterShell';
import { TopbarMinimal } from '@/components/admin/tenants/v2/TopbarMinimal';
import { Hero } from '@/components/admin/tenants/v2/Hero';
import { MicroRow } from '@/components/admin/tenants/v2/MicroRow';
import { ChartPanelMinimal } from '@/components/admin/tenants/v2/ChartPanelMinimal';
import { AlertsPanel } from '@/components/admin/tenants/v2/AlertsPanel';
import { EstablishmentsList } from '@/components/admin/tenants/v2/EstablishmentsList';
import { FluxList } from '@/components/admin/tenants/v2/FluxList';
import { TenantsListDialog } from '@/components/admin/tenants/v2/TenantsListDialog';
import type { OwnerDashboardRow } from '@/types/restaurant-group.types';
import type { ChartMode, ChartPeriod, LocationStat, Tenant } from '@/types/command-center.types';
import { initialsFor } from './command-center.derive';
import { useCommandCenterData } from './use-command-center-data';

/** Minimal directory row used to make any tenant findable in the search dialog. */
interface TenantDirectoryRow {
  id: string;
  slug: string;
  name: string;
  subscription_plan: string | null;
  is_active: boolean;
}

interface TenantsPageClientProps {
  serverMode: 'superadmin' | 'owner';
  /** Platform super-admin: unlocks the god-mode console link. */
  isSuperAdmin?: boolean;
  serverUserName: string;
  serverTenants?: Tenant[];
  serverRestaurants?: OwnerDashboardRow[];
  /**
   * True platform-wide tenant count, computed server-side. The displayed tenant
   * set (serverTenants / serverRestaurants) is bounded for scalability, so these
   * totals are passed separately to keep the headline counters accurate without
   * loading every tenant client-side.
   */
  serverTotalLocations?: number;
  /** True platform-wide count of active tenants, computed server-side. */
  serverActiveLocations?: number;
  /**
   * Lightweight, orders-free directory of every tenant (superadmin only). Used
   * to keep the search dialog able to reach any tenant beyond the bounded page
   * that carries real metrics. Never used to drive orders aggregation.
   */
  serverDirectory?: TenantDirectoryRow[];
  /** Theme read server-side from the attabl-cc-theme cookie (FOUC fix). */
  initialTheme?: 'light' | 'dark';
}

export default function TenantsPageClient({
  serverMode,
  isSuperAdmin = false,
  serverUserName,
  serverTenants,
  serverRestaurants,
  serverTotalLocations,
  serverActiveLocations,
  serverDirectory,
  initialTheme = 'light',
}: TenantsPageClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const tErrors = useTranslations('admin.tenants.commandCenter.errors');
  const tConsole = useTranslations('admin.platform');

  const baseTenants: Tenant[] = useMemo(() => {
    if (serverMode === 'superadmin') return serverTenants || [];
    return (serverRestaurants || []).map((r) => ({
      id: r.tenant_id,
      slug: r.tenant_slug,
      name: r.tenant_name,
      subscription_status: r.tenant_status || '',
      subscription_plan: r.tenant_plan || '',
      is_active: r.tenant_is_active,
    }));
  }, [serverMode, serverTenants, serverRestaurants]);

  const logoBySlug = useMemo(() => {
    const map = new Map<string, string | null>();
    (serverRestaurants || []).forEach((r) => map.set(r.tenant_slug, r.tenant_logo_url));
    return map;
  }, [serverRestaurants]);

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day');
  const [chartMode, setChartMode] = useState<ChartMode>('revenue');
  const [showWizard, setShowWizard] = useState(false);
  const [showFullList, setShowFullList] = useState(false);

  const {
    loading,
    locations,
    globals,
    chartData,
    recentOrders,
    alerts,
    error,
    isChartLoading,
    isRefreshing,
    refresh,
    fetchChartFor,
  } = useCommandCenterData(
    { baseTenants, logoBySlug, serverTotalLocations, serverActiveLocations },
    chartPeriod,
  );

  // The initial tenant load is bounded for scalability, so the in-memory list
  // (with real per-tenant metrics) covers only the first page. To keep the
  // superadmin able to find ANY tenant via the search dialog, the server also
  // sends a lightweight, orders-free directory of every tenant. Directory-only
  // rows (the long tail beyond the loaded page) carry zeroed metrics; their
  // precise rollups belong to the DB rollup wave. This never expands the orders
  // aggregation tenant set, which stays bound to the loaded page.
  const dialogLocations = useMemo<LocationStat[]>(() => {
    if (!serverDirectory || serverDirectory.length === 0) return locations;
    const loadedIds = new Set(baseTenants.map((t) => t.id));
    const directory: LocationStat[] = serverDirectory
      .filter((r) => !loadedIds.has(r.id))
      .map((r) => ({
        tenant_id: r.id,
        tenant_slug: r.slug,
        tenant_name: r.name,
        tenant_plan: r.subscription_plan,
        tenant_logo_url: null,
        is_active: r.is_active,
        revenue_today: 0,
        revenue_yesterday: 0,
        orders_today: 0,
        orders_yesterday: 0,
        sparkline: [],
      }));
    // Loaded tenants (with real metrics) take precedence; directory-only rows
    // fill the long tail so search can reach every tenant.
    return directory.length > 0 ? [...locations, ...directory] : locations;
  }, [serverDirectory, baseTenants, locations]);

  const handlePeriodChange = useCallback(
    (period: ChartPeriod) => {
      setChartPeriod(period);
      void fetchChartFor(period);
    },
    [fetchChartFor],
  );

  const handleOpenDashboard = useCallback(
    (slug: string) => router.push(`/sites/${slug}/admin`),
    [router],
  );
  const handleOpenMenu = useCallback((slug: string) => router.push(`/sites/${slug}`), [router]);
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
  }, [router, supabase]);

  const handleAlertsClick = useCallback(() => {
    // Two AlertsPanel instances exist (mobile + lg). Scroll to whichever is
    // currently visible (offsetParent is null for a display:none element).
    const candidates = document.querySelectorAll<HTMLElement>(`[data-cc-alerts]`);
    for (const el of candidates) {
      if (el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }, []);

  const crumb = serverMode === 'superadmin' ? 'Plateforme' : 'Mes etablissements';
  const userInitials = initialsFor(serverUserName || 'US');
  const displayName = serverUserName || 'Utilisateur';
  const lastOrderAt = recentOrders[0]?.created_at ?? null;
  const multiTenant = baseTenants.length > 1;

  if (loading) {
    return (
      <CommandCenterShell defaultTheme={initialTheme}>
        <div
          className="flex h-full items-center justify-center"
          style={{ background: 'var(--cc-bg)' }}
        >
          <LoadingIndicator type="dot-circle" size="lg" className="text-app-text-muted" />
        </div>
      </CommandCenterShell>
    );
  }

  return (
    <CommandCenterShell defaultTheme={initialTheme}>
      <TopbarMinimal
        crumb={crumb}
        userInitials={userInitials}
        userName={displayName}
        theme={initialTheme}
        onLogout={handleLogout}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <main
        id="main-content"
        className="mx-auto grid w-full max-w-[1400px] min-h-0 flex-1 grid-cols-1 gap-y-6 overflow-y-auto px-4 pb-10 pt-3 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-x-10 lg:px-8"
      >
        {isSuperAdmin && (
          <div className="lg:col-span-2">
            <Link
              href="/admin/platform"
              className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors hover:bg-[var(--cc-surface-hover,rgba(0,0,0,0.04))]"
              style={{ color: 'var(--cc-text)', borderColor: 'var(--cc-border,rgba(0,0,0,0.1))' }}
            >
              <span className="font-medium">{tConsole('banner')}</span>
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
        )}

        {error && (
          <div className="lg:col-span-2">
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              style={{ color: 'var(--cc-text)' }}
            >
              <span>{tErrors('fetchFailed')}</span>
              <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
                {tErrors('retry')}
              </Button>
            </div>
          </div>
        )}

        <section className="flex min-h-0 flex-col gap-6">
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
            onAlertsClick={handleAlertsClick}
          />
          {alerts.length > 0 && (
            <div data-cc-alerts className="lg:hidden">
              <AlertsPanel
                alerts={alerts}
                onOpenDashboard={handleOpenDashboard}
                multiTenant={multiTenant}
              />
            </div>
          )}
          <ChartPanelMinimal
            data={chartData}
            mode={chartMode}
            period={chartPeriod}
            onModeChange={setChartMode}
            onPeriodChange={handlePeriodChange}
            isLoading={isChartLoading}
          />
        </section>

        <aside className="flex min-h-0 flex-col gap-7">
          <div data-cc-alerts className="hidden lg:block">
            <AlertsPanel
              alerts={alerts}
              onOpenDashboard={handleOpenDashboard}
              multiTenant={multiTenant}
            />
          </div>
          <EstablishmentsList
            locations={locations}
            onOpenDashboard={handleOpenDashboard}
            onOpenMenu={handleOpenMenu}
            onAdd={serverMode === 'owner' ? () => setShowWizard(true) : undefined}
            onSeeAll={() => setShowFullList(true)}
          />
          <FluxList
            orders={recentOrders}
            onSelect={handleOpenDashboard}
            multiTenant={multiTenant}
          />
        </aside>
      </main>

      <TenantsListDialog
        open={showFullList}
        onOpenChange={setShowFullList}
        locations={dialogLocations}
        onOpenDashboard={handleOpenDashboard}
        onOpenMenu={handleOpenMenu}
      />

      {showWizard && (
        <AddRestaurantWizard
          onClose={() => setShowWizard(false)}
          onSuccess={(slug) => {
            setShowWizard(false);
            router.push(`/sites/${slug}/admin`);
          }}
        />
      )}
    </CommandCenterShell>
  );
}
