'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Building2,
  ExternalLink,
  Shield,
  LogOut,
  Search,
  Store,
  Crown,
  Zap,
  Clock,
  Plus,
  TrendingUp,
  ShoppingBag,
  ArrowRight,
  CalendarDays,
  Receipt,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { OwnerDashboardRow } from '@/types/restaurant-group.types';
import { AddRestaurantWizard } from '@/components/admin/AddRestaurantWizard';
import { LoadingIndicator } from '@/components/application/loading-indicator/loading-indicator';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

// ─── Currency formatter (West African CFA) ──────────────────
function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

function formatCompactCFA(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

// ─── Interfaces ─────────────────────────────────────────────
interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  subscription_plan: string;
  is_active: boolean;
}

interface ChartDataPoint {
  label: string;
  revenue: number;
  orders: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
  tenant_name: string;
  tenant_slug: string;
}

// ─── Status helpers ─────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-400/15 text-amber-400 border-amber-400/20',
  confirmed: 'bg-blue-400/15 text-blue-400 border-blue-400/20',
  preparing: 'bg-violet-400/15 text-violet-400 border-violet-400/20',
  ready: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
  served: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
  completed: 'bg-app-text-muted/10 text-app-text-muted border-app-border',
  cancelled: 'bg-red-400/15 text-red-400 border-red-400/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  ready: 'Prête',
  served: 'Servie',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

interface TenantsPageClientProps {
  serverMode: 'superadmin' | 'owner';
  serverUserName: string;
  serverTenants?: Tenant[];
  serverRestaurants?: OwnerDashboardRow[];
}

export default function TenantsPageClient({
  serverMode,
  serverUserName,
  serverTenants,
  serverRestaurants,
}: TenantsPageClientProps) {
  const [mode] = useState<'loading' | 'superadmin' | 'owner'>(serverMode);

  // Super admin state
  const [tenants] = useState<Tenant[]>(serverTenants || []);
  const [searchQuery, setSearchQuery] = useState('');

  // Owner hub state
  const [restaurants] = useState<OwnerDashboardRow[]>(serverRestaurants || []);
  const [showWizard, setShowWizard] = useState(false);
  const [userName] = useState(serverUserName);

  // Chart & orders state
  const [chartPeriod, setChartPeriod] = useState<'day' | 'month'>('day');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [chartMode, setChartMode] = useState<'revenue' | 'orders'>('revenue');

  const router = useRouter();
  const supabase = createClient();

  // ─── Fetch chart data for owner ───────────────────────────
  const fetchChartData = useCallback(
    async (tenantIds: string[], period: 'day' | 'month') => {
      if (tenantIds.length === 0) return;

      const now = new Date();
      let startDate: Date;
      let groupBy: 'hour' | 'day';

      if (period === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        groupBy = 'hour';
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        groupBy = 'day';
      }

      const { data: orders } = await supabase
        .from('orders')
        .select('total, created_at, status')
        .in('tenant_id', tenantIds)
        .gte('created_at', startDate.toISOString())
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (!orders || orders.length === 0) {
        // Generate empty chart data
        if (groupBy === 'hour') {
          const points: ChartDataPoint[] = [];
          for (let h = 0; h <= now.getHours(); h++) {
            points.push({ label: `${h}h`, revenue: 0, orders: 0 });
          }
          setChartData(points);
        } else {
          const points: ChartDataPoint[] = [];
          const daysInMonth = now.getDate();
          for (let d = 1; d <= daysInMonth; d++) {
            points.push({ label: `${d}`, revenue: 0, orders: 0 });
          }
          setChartData(points);
        }
        return;
      }

      // Aggregate by hour or day
      const buckets = new Map<string, { revenue: number; orders: number }>();

      if (groupBy === 'hour') {
        for (let h = 0; h <= now.getHours(); h++) {
          buckets.set(`${h}h`, { revenue: 0, orders: 0 });
        }
        for (const o of orders) {
          const h = new Date(o.created_at).getHours();
          const key = `${h}h`;
          const b = buckets.get(key);
          if (b) {
            b.revenue += Number(o.total) || 0;
            b.orders += 1;
          }
        }
      } else {
        const daysInMonth = now.getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          buckets.set(`${d}`, { revenue: 0, orders: 0 });
        }
        for (const o of orders) {
          const d = new Date(o.created_at).getDate();
          const key = `${d}`;
          const b = buckets.get(key);
          if (b) {
            b.revenue += Number(o.total) || 0;
            b.orders += 1;
          }
        }
      }

      const points: ChartDataPoint[] = Array.from(buckets.entries()).map(([label, v]) => ({
        label,
        revenue: v.revenue,
        orders: v.orders,
      }));
      setChartData(points);
    },
    [supabase],
  );

  // ─── Fetch recent orders for owner ────────────────────────
  const fetchRecentOrders = useCallback(
    async (tenantIds: string[]) => {
      if (tenantIds.length === 0) return;

      const { data } = await supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, tenant_id, tenants(name, slug)')
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false })
        .limit(8);

      if (data) {
        setRecentOrders(
          data.map((o) => {
            const t = o.tenants as unknown as { name: string; slug: string } | null;
            return {
              id: o.id,
              order_number: o.order_number || '—',
              total: Number(o.total) || 0,
              status: o.status || 'pending',
              created_at: o.created_at,
              tenant_name: t?.name || '',
              tenant_slug: t?.slug || '',
            };
          }),
        );
      }
    },
    [supabase],
  );

  // Fetch chart data and recent orders on mount (for owner mode)
  useEffect(() => {
    if (mode !== 'owner' || restaurants.length === 0) return;
    const tIds = restaurants.map((r) => r.tenant_id);
    const load = async () => {
      await Promise.all([fetchChartData(tIds, 'day'), fetchRecentOrders(tIds)]);
    };
    load();
  }, [mode, restaurants, fetchChartData, fetchRecentOrders]);

  // Refetch chart data when period changes
  useEffect(() => {
    if (mode !== 'owner' || restaurants.length === 0) return;
    const tIds = restaurants.map((r) => r.tenant_id);
    const refetch = async () => {
      await fetchChartData(tIds, chartPeriod);
    };
    refetch();
  }, [chartPeriod, mode, restaurants, fetchChartData]);

  // ─── Super admin helpers ────────────────────────────────────
  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [tenants, searchQuery]);

  const stats = useMemo(
    () => ({
      total: tenants.length,
      active: tenants.filter((t) => t.is_active).length,
      paid: tenants.filter((t) =>
        ['pro', 'business', 'enterprise'].includes(t.subscription_plan?.toLowerCase() || ''),
      ).length,
      trial: tenants.filter((t) => t.subscription_status?.toLowerCase() === 'trial').length,
    }),
    [tenants],
  );

  // ─── Owner hub helpers ──────────────────────────────────────
  const ownerGlobals = useMemo(
    () => ({
      totalRestaurants: restaurants.length,
      totalOrdersToday: restaurants.reduce((sum, r) => sum + Number(r.orders_today), 0),
      totalRevenueToday: restaurants.reduce((sum, r) => sum + Number(r.revenue_today), 0),
      totalOrdersMonth: restaurants.reduce((sum, r) => sum + Number(r.orders_month), 0),
      totalRevenueMonth: restaurants.reduce((sum, r) => sum + Number(r.revenue_month), 0),
    }),
    [restaurants],
  );

  // ─── Navigation helpers ─────────────────────────────────────
  const handleSelectTenant = (slug: string) => {
    router.push(`/sites/${slug}/admin`);
  };

  const handleViewMenu = (slug: string) => {
    router.push(`/sites/${slug}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ─── Greeting ─────────────────────────────────────────────
  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  // ─── Time formatter ───────────────────────────────────────
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // ─── Loading state ─────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center bg-app-bg">
        <LoadingIndicator type="dot-circle" size="lg" className="text-app-text-muted" />
      </div>
    );
  }

  // ─── SUPER ADMIN MODE ──────────────────────────────────────
  if (mode === 'superadmin') {
    return (
      <div className="h-dvh flex flex-col bg-app-bg">
        <header className="shrink-0 border-b border-app-border px-4 sm:px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent p-2">
                <Shield className="h-4 w-4 text-accent-text" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-app-text">ATTABL</h1>
                  <span className="text-app-text-muted">/</span>
                  <span className="text-xs font-medium text-app-text-secondary">Super Admin</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2 rounded-xl border-app-border"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Déconnexion</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-5">
              {[
                {
                  icon: Store,
                  label: 'Total',
                  value: stats.total,
                  color: 'text-accent',
                  bg: 'bg-accent-muted',
                },
                {
                  icon: Zap,
                  label: 'Actifs',
                  value: stats.active,
                  color: 'text-status-success',
                  bg: 'bg-app-status-success-bg',
                },
                {
                  icon: Crown,
                  label: 'Premium',
                  value: stats.paid,
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/10',
                },
                {
                  icon: Clock,
                  label: 'Trial',
                  value: stats.trial,
                  color: 'text-app-text-muted',
                  bg: 'bg-app-elevated',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="border border-app-border rounded-xl p-3 bg-app-card"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`rounded-lg p-1 ${stat.bg}`}>
                      <stat.icon className={`h-3 w-3 ${stat.color}`} />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-app-text-muted">
                      {stat.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black text-app-text tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-text-muted" />
                <Input
                  placeholder="Rechercher par nom ou slug..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm rounded-xl bg-app-elevated border-app-border"
                />
              </div>
              <span className="text-[10px] text-app-text-muted shrink-0">
                {filteredTenants.length} établissement{filteredTenants.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredTenants.length > 0 ? (
              <div className="space-y-1.5">
                {filteredTenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className="flex items-center justify-between gap-3 border border-app-border rounded-xl bg-app-card p-3 hover:bg-app-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-app-elevated shrink-0">
                        <Building2 className="h-4 w-4 text-app-text-muted" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-app-text break-words">
                          {tenant.name}
                        </h3>
                        <p className="text-[10px] text-app-text-muted">{tenant.slug}.attabl.com</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="hidden sm:flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold rounded-lg border-app-border"
                        >
                          {tenant.subscription_plan || 'N/A'}
                        </Badge>
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            tenant.is_active ? 'bg-status-success' : 'bg-app-text-muted'
                          }`}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSelectTenant(tenant.slug)}
                        className="rounded-xl gap-1.5 h-8 text-xs"
                      >
                        Dashboard
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewMenu(tenant.slug)}
                        className="rounded-xl h-8 border-app-border"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-app-border py-16 bg-app-card">
                <div className="mb-3 rounded-xl bg-app-elevated p-4">
                  <Building2 className="h-8 w-8 text-app-text-muted" />
                </div>
                <h3 className="text-sm font-semibold text-app-text mb-1">
                  {searchQuery ? 'Aucun résultat' : 'Aucun établissement'}
                </h3>
                <p className="text-xs text-app-text-muted text-center max-w-xs">
                  {searchQuery
                    ? `Aucun établissement ne correspond à "${searchQuery}".`
                    : 'Aucun établissement enregistré pour le moment.'}
                </p>
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="mt-3 rounded-xl text-xs"
                  >
                    Effacer
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── OWNER HUB MODE ────────────────────────────────────────
  return (
    <div className="h-dvh flex flex-col bg-app-bg">
      {/* Header */}
      <header className="shrink-0 border-b border-app-border px-4 sm:px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <h1 className="text-lg font-bold text-app-text">
              {greetKey}, {userName}
            </h1>
            <span className="text-xs text-app-text-muted capitalize" suppressHydrationWarning>
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2 rounded-xl border-app-border"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content — single viewport, no scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-3 flex-1 flex flex-col gap-3 min-h-0">
          {/* ═══ TOP ROW: KPIs + Chart ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
            {/* KPI compact cards — 3 cards in first column */}
            <div className="flex md:flex-col gap-2">
              <div className="flex-1 bg-app-card rounded-xl border border-app-border p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3 w-3 text-accent" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-app-text-muted">
                    CA
                  </span>
                </div>
                <p className="text-sm font-black text-app-text tabular-nums leading-tight">
                  {formatCFA(ownerGlobals.totalRevenueToday)}
                </p>
                <p className="text-[9px] text-app-text-muted">
                  Mois : {formatCFA(ownerGlobals.totalRevenueMonth)}
                </p>
              </div>
              <div className="flex-1 bg-app-card rounded-xl border border-app-border p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingBag className="h-3 w-3 text-blue-500" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-app-text-muted">
                    Commandes
                  </span>
                </div>
                <p className="text-sm font-black text-app-text tabular-nums leading-tight">
                  {ownerGlobals.totalOrdersToday}
                </p>
                <p className="text-[9px] text-app-text-muted">
                  Mois : {ownerGlobals.totalOrdersMonth}
                </p>
              </div>
              <div className="flex-1 bg-app-card rounded-xl border border-app-border p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Store className="h-3 w-3 text-app-text-muted" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-app-text-muted">
                    Sites
                  </span>
                </div>
                <p className="text-sm font-black text-app-text tabular-nums leading-tight">
                  {ownerGlobals.totalRestaurants}
                </p>
              </div>
            </div>

            {/* Chart — takes 3 cols */}
            <div className="md:col-span-3 bg-app-card rounded-xl border border-app-border overflow-hidden flex flex-col">
              <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
                <div className="flex items-center bg-app-elevated rounded-lg p-0.5">
                  <button
                    onClick={() => setChartMode('revenue')}
                    className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${
                      chartMode === 'revenue'
                        ? 'bg-app-card text-accent shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary'
                    }`}
                  >
                    CA
                  </button>
                  <button
                    onClick={() => setChartMode('orders')}
                    className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${
                      chartMode === 'orders'
                        ? 'bg-app-card text-accent shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary'
                    }`}
                  >
                    Commandes
                  </button>
                </div>
                <div className="flex items-center bg-app-elevated rounded-lg p-0.5">
                  <button
                    onClick={() => setChartPeriod('day')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${
                      chartPeriod === 'day'
                        ? 'bg-app-card text-app-text shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary'
                    }`}
                  >
                    <CalendarDays className="h-2.5 w-2.5" />
                    Jour
                  </button>
                  <button
                    onClick={() => setChartPeriod('month')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${
                      chartPeriod === 'month'
                        ? 'bg-app-card text-app-text shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary'
                    }`}
                  >
                    <CalendarDays className="h-2.5 w-2.5" />
                    Mois
                  </button>
                </div>
              </div>
              <div className="px-2 pb-2 flex-1 min-h-[120px] h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'revenue' ? (
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hubRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="50%" stopColor="var(--accent)" stopOpacity={0.1} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--app-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                        dy={4}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                        tickFormatter={formatCompactCFA}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--app-elevated)',
                          border: '1px solid var(--app-border)',
                          borderRadius: '10px',
                          fontSize: '11px',
                          color: 'var(--app-text)',
                          padding: '6px 10px',
                        }}
                        formatter={(value: number | undefined) => [formatCFA(value ?? 0), 'CA']}
                        labelStyle={{
                          color: 'var(--app-text-muted)',
                          fontSize: '9px',
                          marginBottom: '2px',
                        }}
                        cursor={{
                          stroke: 'var(--accent)',
                          strokeWidth: 1,
                          strokeDasharray: '4 4',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--accent)"
                        fill="url(#hubRevenueGrad)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 3,
                          fill: 'var(--accent)',
                          stroke: 'var(--app-card)',
                          strokeWidth: 2,
                        }}
                      />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--app-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                        dy={4}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                        width={25}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--app-elevated)',
                          border: '1px solid var(--app-border)',
                          borderRadius: '10px',
                          fontSize: '11px',
                          color: 'var(--app-text)',
                          padding: '6px 10px',
                        }}
                        formatter={(value: number | undefined) => [value ?? 0, 'Commandes']}
                        labelStyle={{
                          color: 'var(--app-text-muted)',
                          fontSize: '9px',
                          marginBottom: '2px',
                        }}
                        cursor={{ fill: 'var(--accent)', fillOpacity: 0.06 }}
                      />
                      <Bar
                        dataKey="orders"
                        fill="var(--accent)"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ═══ BOTTOM ROW: Recent Orders + Establishments ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
            {/* Recent orders */}
            <div className="bg-app-card rounded-xl border border-app-border overflow-hidden flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-app-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-3 w-3 text-app-text-muted" />
                  <h2 className="text-[9px] font-bold uppercase tracking-widest text-app-text-muted">
                    Commandes récentes
                  </h2>
                </div>
                {recentOrders.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-success" />
                    </span>
                    <span className="text-[8px] text-status-success font-medium">Live</span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {recentOrders.length > 0 ? (
                  <div className="divide-y divide-app-border">
                    {recentOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => handleSelectTenant(order.tenant_slug)}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-app-hover transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-app-text">
                              #{order.order_number}
                            </span>
                            <span
                              className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}
                            >
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                          {restaurants.length > 1 && (
                            <p className="text-[9px] text-app-text-muted break-words">
                              {order.tenant_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold text-app-text tabular-nums">
                            {formatCFA(order.total)}
                          </p>
                          <p className="text-[8px] text-app-text-muted tabular-nums">
                            {formatTime(order.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6">
                    <ShoppingBag className="h-5 w-5 text-app-text-muted/30 mb-1.5" />
                    <p className="text-[10px] text-app-text-muted">Aucune commande récente</p>
                  </div>
                )}
              </div>
            </div>

            {/* Establishments */}
            <div className="bg-app-card rounded-xl border border-app-border overflow-hidden flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-app-border flex items-center justify-between shrink-0">
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-app-text-muted">
                  Mes établissements
                </h2>
                <button
                  onClick={() => setShowWizard(true)}
                  className="flex items-center gap-1 text-[10px] font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="divide-y divide-app-border">
                  {restaurants.map((r) => (
                    <div
                      key={r.tenant_id}
                      onClick={() => handleSelectTenant(r.tenant_slug)}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-app-hover transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.tenant_logo_url ? (
                          <Image
                            src={r.tenant_logo_url}
                            alt={r.tenant_name}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-elevated shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-app-text-muted" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-xs font-semibold text-app-text break-words">
                              {r.tenant_name}
                            </h3>
                            <span
                              className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                r.tenant_is_active ? 'bg-status-success' : 'bg-app-text-muted'
                              }`}
                            />
                            {r.tenant_plan && (
                              <Badge
                                variant="outline"
                                className="text-[8px] font-semibold rounded-md border-app-border px-1 py-0"
                              >
                                {r.tenant_plan}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[9px] text-app-text-muted">
                            {r.tenant_slug}.attabl.com
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden sm:block text-right">
                          <p className="text-[8px] text-app-text-muted uppercase">Cmd</p>
                          <p className="text-xs font-bold text-app-text tabular-nums">
                            {Number(r.orders_today)}
                          </p>
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-[8px] text-app-text-muted uppercase">CA</p>
                          <p className="text-xs font-bold text-app-text tabular-nums">
                            {formatCFA(Number(r.revenue_today))}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-app-text-muted group-hover:text-accent transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Restaurant Wizard */}
      {showWizard && (
        <AddRestaurantWizard
          onClose={() => setShowWizard(false)}
          onSuccess={(slug) => {
            setShowWizard(false);
            router.push(`/sites/${slug}/admin`);
          }}
        />
      )}
    </div>
  );
}
