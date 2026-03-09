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
        .select('is_super_admin, role')
        .eq('user_id', user.id);

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

  // ─── Loading state ─────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <LoadingIndicator type="dot-circle" size="lg" className="text-app-text-muted" />
      </div>
    );
  }

  // ─── SUPER ADMIN MODE ──────────────────────────────────────
  if (mode === 'superadmin') {
    return (
      <div className="min-h-screen bg-app-bg">
        <header className="border-b border-app-border">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-accent p-2.5">
                <Shield className="h-5 w-5 text-accent-text" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-app-text">ATTABL</h1>
                  <span className="text-xl font-light text-app-text-muted">/</span>
                  <span className="text-sm font-medium text-app-text-secondary">Super Admin</span>
                </div>
                <p className="text-xs text-app-text-muted">
                  Gestion centralisee de tous les etablissements
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2 rounded-lg">
              <LogOut className="h-4 w-4" />
              Deconnexion
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Stats row — flat design with line separators */}
          <div className="mb-8 grid grid-cols-2 gap-px md:grid-cols-4 rounded-xl border border-app-border overflow-hidden bg-app-border">
            {[
              {
                icon: Store,
                label: 'Total',
                value: stats.total,
                iconBg: 'bg-accent',
                iconColor: 'text-accent-text',
              },
              {
                icon: Zap,
                label: 'Actifs',
                value: stats.active,
                iconBg: 'bg-status-success/10',
                iconColor: 'text-status-success',
              },
              {
                icon: Crown,
                label: 'Premium',
                value: stats.premium,
                iconBg: 'bg-amber-500/10',
                iconColor: 'text-amber-500',
              },
              {
                icon: Clock,
                label: 'Trial',
                value: stats.trial,
                iconBg: 'bg-app-elevated',
                iconColor: 'text-app-text-muted',
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-app-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className={`rounded-lg p-1.5 ${stat.iconBg}`}>
                    <stat.icon className={`h-3.5 w-3.5 ${stat.iconColor}`} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted">
                    {stat.label}
                  </span>
                </div>
                <p className="text-3xl font-black tracking-tight text-app-text">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-muted" />
              <Input
                placeholder="Rechercher par nom ou slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <p className="text-xs text-app-text-muted">
              {filteredTenants.length} etablissement{filteredTenants.length !== 1 ? 's' : ''}{' '}
              {searchQuery && 'trouves'}
            </p>
          </div>

          {filteredTenants.length > 0 ? (
            <div className="divide-y divide-app-border rounded-xl border border-app-border overflow-hidden">
              {filteredTenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between gap-4 bg-app-card p-4 hover:bg-app-hover transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-elevated shrink-0">
                      <Building2 className="h-5 w-5 text-app-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-app-text truncate">
                        {tenant.name}
                      </h3>
                      <p className="text-xs text-app-text-muted">{tenant.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-2">
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {tenant.subscription_plan || 'N/A'}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            tenant.is_active ? 'bg-status-success' : 'bg-app-text-muted'
                          }`}
                        />
                        <span className="text-[11px] font-medium text-app-text-muted">
                          {tenant.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSelectTenant(tenant.slug)}
                        className="rounded-lg"
                      >
                        Dashboard
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewMenu(tenant.slug)}
                        className="gap-1.5 rounded-lg"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-app-border py-20">
              <div className="mb-4 rounded-2xl bg-app-elevated p-5">
                <Building2 className="h-10 w-10 text-app-text-muted" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-app-text">
                {searchQuery ? 'Aucun resultat' : 'Aucun etablissement'}
              </h3>
              <p className="max-w-xs text-center text-xs text-app-text-muted">
                {searchQuery
                  ? `Aucun etablissement ne correspond a "${searchQuery}". Essayez un autre terme.`
                  : 'Aucun etablissement enregistre pour le moment.'}
              </p>
              {searchQuery && (
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 rounded-lg text-xs"
                >
                  Effacer la recherche
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── OWNER HUB MODE ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-app-bg">
      {/* Header */}
      <header className="border-b border-app-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="rounded-xl bg-accent p-2.5 shrink-0">
              <Building2 className="h-5 w-5 text-accent-text" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-app-text truncate">
                Mes Etablissements
              </h1>
              <p className="text-xs text-app-text-muted hidden sm:block">
                Gerez tous vos restaurants depuis un seul endroit
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-2 rounded-lg shrink-0"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Deconnexion</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-8">
        {/* Global KPIs — flat design, line-separated */}
        <div className="mb-6 sm:mb-8 grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl border border-app-border overflow-hidden bg-app-border">
          {[
            {
              icon: TrendingUp,
              label: "CA Aujourd'hui",
              value: formatCFA(ownerGlobals.totalRevenueToday),
              iconBg: 'bg-accent',
              iconColor: 'text-accent-text',
            },
            {
              icon: TrendingUp,
              label: 'CA ce mois',
              value: formatCFA(ownerGlobals.totalRevenueMonth),
              iconBg: 'bg-status-success/10',
              iconColor: 'text-status-success',
            },
            {
              icon: ShoppingBag,
              label: 'Commandes',
              value: String(ownerGlobals.totalOrdersToday),
              iconBg: 'bg-blue-500/10',
              iconColor: 'text-blue-500',
            },
            {
              icon: Store,
              label: 'Restaurants',
              value: String(ownerGlobals.totalRestaurants),
              iconBg: 'bg-app-elevated',
              iconColor: 'text-app-text-muted',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-app-card p-4 sm:p-5">
              <div className="mb-2 sm:mb-3 flex items-center gap-2">
                <div className={`rounded-lg p-1.5 ${stat.iconBg}`}>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.iconColor}`} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted truncate">
                  {stat.label}
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-app-text">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Restaurant list — flat rows with line separators */}
        <div className="divide-y divide-app-border rounded-xl border border-app-border overflow-hidden">
          {restaurants.map((r) => (
            <div
              key={r.tenant_id}
              className="bg-app-card p-4 sm:p-5 hover:bg-app-hover transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {r.tenant_logo_url ? (
                    <Image
                      src={r.tenant_logo_url}
                      alt={r.tenant_name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-elevated shrink-0">
                      <Building2 className="h-5 w-5 text-app-text-muted" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-app-text truncate">
                      {r.tenant_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-app-text-muted">{r.tenant_slug}.attabl.com</p>
                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            r.tenant_is_active ? 'bg-status-success' : 'bg-app-text-muted'
                          }`}
                        />
                        <span className="text-[10px] text-app-text-muted">
                          {r.tenant_is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPIs inline — hidden on mobile */}
                <div className="hidden md:flex items-center gap-6 text-right">
                  <div>
                    <p className="text-[10px] text-app-text-muted uppercase tracking-wide">
                      Commandes
                    </p>
                    <p className="text-sm font-bold text-app-text tabular-nums">
                      {Number(r.orders_today)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-app-text-muted uppercase tracking-wide">CA</p>
                    <p className="text-sm font-bold text-app-text tabular-nums">
                      {formatCFA(Number(r.revenue_today))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.tenant_plan && (
                    <Badge
                      variant="outline"
                      className="text-[11px] font-semibold hidden sm:inline-flex"
                    >
                      {r.tenant_plan}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSelectTenant(r.tenant_slug)}
                    className="rounded-lg gap-1.5"
                  >
                    Gerer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Add restaurant row */}
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-3 w-full bg-app-card p-4 sm:p-5 hover:bg-app-hover transition-colors text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-app-border shrink-0">
              <Plus className="h-5 w-5 text-app-text-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-app-text">Ajouter un etablissement</p>
              <p className="text-xs text-app-text-muted">Creez un nouveau restaurant</p>
            </div>
          </button>
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
