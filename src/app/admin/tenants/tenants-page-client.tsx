'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { OwnerDashboardRow } from '@/types/restaurant-group.types';
import { AddRestaurantWizard } from '@/components/admin/AddRestaurantWizard';
import { LoadingIndicator } from '@/components/application/loading-indicator/loading-indicator';

// ─── Currency formatter (West African CFA) ──────────────────
function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

// ─── Tenant interface (for super admin mode) ────────────────
interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  subscription_plan: string;
  is_active: boolean;
}

export default function TenantsPageClient() {
  const [mode, setMode] = useState<'loading' | 'superadmin' | 'owner'>('loading');

  // Super admin state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Owner hub state
  const [restaurants, setRestaurants] = useState<OwnerDashboardRow[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [userName, setUserName] = useState('');

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Check all admin_users entries for this user
      const { data: adminUsers } = await supabase
        .from('admin_users')
        .select('is_super_admin, role, full_name')
        .eq('user_id', user.id);

      const firstAdmin = adminUsers?.[0];
      setUserName(firstAdmin?.full_name || user.email?.split('@')[0] || '');

      const isSuperAdmin = (adminUsers || []).some(
        (au) => au.is_super_admin === true || au.role === 'super_admin',
      );

      if (isSuperAdmin) {
        const { data: tenantsData } = await supabase
          .from('tenants')
          .select('id, slug, name, subscription_status, subscription_plan, is_active')
          .order('name');

        setTenants(tenantsData || []);
        setMode('superadmin');
      } else {
        const { data, error: rpcError } = await supabase.rpc('get_owner_dashboard', {
          p_user_id: user.id,
        });

        if (rpcError) {
          const { data: userTenants } = await supabase
            .from('admin_users')
            .select(
              'tenant_id, tenants(id, name, slug, subscription_plan, subscription_status, logo_url, is_active)',
            )
            .eq('user_id', user.id);

          const fallbackRestaurants: OwnerDashboardRow[] = (userTenants || [])
            .filter((ut) => ut.tenants)
            .map((ut) => {
              const t = ut.tenants as unknown as {
                id: string;
                name: string;
                slug: string;
                subscription_plan: string;
                subscription_status: string;
                logo_url: string;
                is_active: boolean;
              };
              return {
                tenant_id: t.id,
                tenant_name: t.name,
                tenant_slug: t.slug,
                tenant_plan: t.subscription_plan,
                tenant_status: t.subscription_status,
                tenant_logo_url: t.logo_url,
                tenant_is_active: t.is_active,
                orders_today: 0,
                revenue_today: 0,
                orders_month: 0,
                revenue_month: 0,
              };
            });
          setRestaurants(fallbackRestaurants);
        } else {
          setRestaurants((data as OwnerDashboardRow[]) || []);
        }
        setMode('owner');
      }
    }

    init();
  }, [supabase, router]);

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
      premium: tenants.filter((t) => t.subscription_plan?.toLowerCase() === 'premium').length,
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
        {/* Header — matches dashboard compact style */}
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
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
            {/* Stats — compact cards matching dashboard gauge legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
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
                  value: stats.premium,
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

            {/* Search */}
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

            {/* Tenant list */}
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
                        <h3 className="text-sm font-semibold text-app-text truncate">
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
      {/* Header — greeting style like dashboard */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-2 rounded-xl border-app-border shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Déconnexion</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
          {/* Global KPIs — compact card grid matching dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
            {[
              {
                icon: TrendingUp,
                label: "CA aujourd'hui",
                value: formatCFA(ownerGlobals.totalRevenueToday),
                color: 'text-accent',
                bg: 'bg-accent-muted',
              },
              {
                icon: TrendingUp,
                label: 'CA ce mois',
                value: formatCFA(ownerGlobals.totalRevenueMonth),
                color: 'text-status-success',
                bg: 'bg-app-status-success-bg',
              },
              {
                icon: ShoppingBag,
                label: 'Commandes',
                value: String(ownerGlobals.totalOrdersToday),
                color: 'text-blue-500',
                bg: 'bg-blue-500/10',
              },
              {
                icon: Store,
                label: 'Établissements',
                value: String(ownerGlobals.totalRestaurants),
                color: 'text-app-text-muted',
                bg: 'bg-app-elevated',
              },
            ].map((stat) => (
              <div key={stat.label} className="border border-app-border rounded-xl p-3 bg-app-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`rounded-lg p-1 ${stat.bg}`}>
                    <stat.icon className={`h-3 w-3 ${stat.color}`} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-app-text-muted truncate">
                    {stat.label}
                  </span>
                </div>
                <p className="text-xl sm:text-2xl font-black text-app-text tabular-nums">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Section title */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted">
              Mes établissements
            </h2>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>

          {/* Restaurant cards */}
          <div className="space-y-1.5">
            {restaurants.map((r) => (
              <div
                key={r.tenant_id}
                onClick={() => handleSelectTenant(r.tenant_slug)}
                className="flex items-center justify-between gap-3 border border-app-border rounded-xl bg-app-card p-3 sm:p-4 hover:bg-app-hover hover:border-accent/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {r.tenant_logo_url ? (
                    <Image
                      src={r.tenant_logo_url}
                      alt={r.tenant_name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-elevated shrink-0">
                      <Building2 className="h-4 w-4 text-app-text-muted" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-app-text truncate">
                        {r.tenant_name}
                      </h3>
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                          r.tenant_is_active ? 'bg-status-success' : 'bg-app-text-muted'
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-app-text-muted">{r.tenant_slug}.attabl.com</p>
                      {r.tenant_plan && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-semibold rounded-md border-app-border px-1.5 py-0"
                        >
                          {r.tenant_plan}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* KPIs inline */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden md:block text-right">
                    <p className="text-[9px] text-app-text-muted uppercase tracking-wide">
                      Commandes
                    </p>
                    <p className="text-sm font-bold text-app-text tabular-nums">
                      {Number(r.orders_today)}
                    </p>
                  </div>
                  <div className="hidden md:block text-right">
                    <p className="text-[9px] text-app-text-muted uppercase tracking-wide">CA</p>
                    <p className="text-sm font-bold text-app-text tabular-nums">
                      {formatCFA(Number(r.revenue_today))}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-app-text-muted group-hover:text-accent transition-colors" />
                </div>
              </div>
            ))}
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
