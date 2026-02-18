'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2,
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

// ─── Currency formatter (West African CFA) ──────────────────
function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

// ─── Plan badge styles ──────────────────────────────────────
const PLAN_STYLES: Record<string, string> = {
  premium: 'bg-[#CCFF00]/15 text-[#7a9900] border-[#CCFF00]/30',
  essentiel: 'bg-blue-50 text-blue-700 border-blue-200',
  pro: 'bg-purple-50 text-purple-700 border-purple-200',
  trial: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

function getPlanStyle(plan: string): string {
  const key = plan.toLowerCase();
  return PLAN_STYLES[key] || 'bg-neutral-100 text-neutral-600 border-neutral-200';
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

export default function TenantsPage() {
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
        // Load all tenants for super admin view
        const { data: tenantsData } = await supabase
          .from('tenants')
          .select('id, slug, name, subscription_status, subscription_plan, is_active')
          .order('name');

        setTenants(tenantsData || []);
        setMode('superadmin');
      } else {
        // Load owner dashboard via RPC
        const { data } = await supabase.rpc('get_owner_dashboard', {
          p_user_id: user.id,
        });

        setRestaurants((data as OwnerDashboardRow[]) || []);
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
    const isDev = window.location.hostname === 'localhost';
    if (isDev) {
      window.location.assign(`http://${slug}.localhost:3000/admin`);
    } else {
      window.location.assign(`https://${slug}.attabl.com/admin`);
    }
  };

  const handleViewMenu = (slug: string) => {
    const isDev = window.location.hostname === 'localhost';
    if (isDev) {
      window.location.href = `http://${slug}.localhost:3000`;
    } else {
      window.location.href = `https://${slug}.attabl.com`;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ─── Loading state ─────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-black p-4">
            <Building2 className="h-8 w-8 text-[#CCFF00]" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  // ─── SUPER ADMIN MODE ──────────────────────────────────────
  if (mode === 'superadmin') {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-neutral-100">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-black p-2.5">
                <Shield className="h-5 w-5 text-[#CCFF00]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-neutral-900">ATTABL</h1>
                  <span className="text-xl font-light text-neutral-300">/</span>
                  <span className="text-sm font-medium text-neutral-500">Super Admin</span>
                </div>
                <p className="text-xs text-neutral-400">
                  Gestion centralisee de tous les etablissements
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="gap-2 rounded-lg border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
            >
              <LogOut className="h-4 w-4" />
              Deconnexion
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-lg bg-[#CCFF00] p-1.5">
                  <Store className="h-3.5 w-3.5 text-black" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                  Total
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight text-neutral-900">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                  Actifs
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight text-neutral-900">{stats.active}</p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-lg bg-amber-50 p-1.5">
                  <Crown className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                  Premium
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight text-neutral-900">{stats.premium}</p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-lg bg-neutral-100 p-1.5">
                  <Clock className="h-3.5 w-3.5 text-neutral-500" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                  Trial
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight text-neutral-900">{stats.trial}</p>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Rechercher par nom ou slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border-neutral-200 pl-9 text-sm focus-visible:ring-[#CCFF00]/50"
              />
            </div>
            <p className="text-xs text-neutral-400">
              {filteredTenants.length} etablissement{filteredTenants.length !== 1 ? 's' : ''}{' '}
              {searchQuery && 'trouves'}
            </p>
          </div>

          {filteredTenants.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-[#CCFF00]/50"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-50">
                        <Building2 className="h-5 w-5 text-neutral-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-900">{tenant.name}</h3>
                        <p className="text-xs text-neutral-400">{tenant.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          tenant.is_active ? 'bg-emerald-500' : 'bg-neutral-300'
                        }`}
                      />
                      <span className="text-[11px] font-medium text-neutral-400">
                        {tenant.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  </div>
                  <div className="mb-4 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold ${getPlanStyle(tenant.subscription_plan)}`}
                    >
                      {tenant.subscription_plan || 'N/A'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${
                        tenant.subscription_status === 'active'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : tenant.subscription_status === 'trial'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      {tenant.subscription_status || 'N/A'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleSelectTenant(tenant.slug)}
                      className="flex-1 rounded-lg bg-[#CCFF00] text-sm font-semibold text-black hover:bg-[#b8e600]"
                    >
                      Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleViewMenu(tenant.slug)}
                      className="gap-1.5 rounded-lg border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Menu
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-20">
              <div className="mb-4 rounded-2xl bg-neutral-50 p-5">
                <Building2 className="h-10 w-10 text-neutral-300" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-neutral-900">
                {searchQuery ? 'Aucun resultat' : 'Aucun etablissement'}
              </h3>
              <p className="max-w-xs text-center text-xs text-neutral-400">
                {searchQuery
                  ? `Aucun etablissement ne correspond a "${searchQuery}". Essayez un autre terme.`
                  : 'Aucun etablissement enregistre pour le moment.'}
              </p>
              {searchQuery && (
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 rounded-lg border-neutral-200 text-xs text-neutral-500"
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-black p-2.5">
              <Building2 className="h-5 w-5 text-[#CCFF00]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                Mes Etablissements
              </h1>
              <p className="text-xs text-neutral-400">
                Gerez tous vos restaurants depuis un seul endroit
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2 rounded-lg border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4" />
            Deconnexion
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Global KPIs */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-[#CCFF00] p-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-black" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                CA Aujourd&apos;hui
              </span>
            </div>
            <p className="text-2xl font-black tracking-tight text-neutral-900">
              {formatCFA(ownerGlobals.totalRevenueToday)}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                CA ce mois
              </span>
            </div>
            <p className="text-2xl font-black tracking-tight text-neutral-900">
              {formatCFA(ownerGlobals.totalRevenueMonth)}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 p-1.5">
                <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                Commandes
              </span>
            </div>
            <p className="text-2xl font-black tracking-tight text-neutral-900">
              {ownerGlobals.totalOrdersToday}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-neutral-100 p-1.5">
                <Store className="h-3.5 w-3.5 text-neutral-500" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                Restaurants
              </span>
            </div>
            <p className="text-2xl font-black tracking-tight text-neutral-900">
              {ownerGlobals.totalRestaurants}
            </p>
          </div>
        </div>

        {/* Restaurant cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r) => (
            <div
              key={r.tenant_id}
              className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-[#CCFF00]/50"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {r.tenant_logo_url ? (
                    <Image
                      src={r.tenant_logo_url}
                      alt={r.tenant_name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-50">
                      <Building2 className="h-5 w-5 text-neutral-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">{r.tenant_name}</h3>
                    <p className="text-xs text-neutral-400">{r.tenant_slug}.attabl.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      r.tenant_is_active ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-neutral-400">
                    {r.tenant_is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>

              {/* Badges */}
              <div className="mb-4 flex items-center gap-2">
                {r.tenant_plan && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-semibold ${getPlanStyle(r.tenant_plan)}`}
                  >
                    {r.tenant_plan}
                  </Badge>
                )}
                {r.tenant_status && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] ${
                      r.tenant_status === 'active'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : r.tenant_status === 'trial'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                    }`}
                  >
                    {r.tenant_status}
                  </Badge>
                )}
              </div>

              {/* KPIs */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-[11px] font-medium text-neutral-400">Commandes</p>
                  <p className="text-lg font-bold text-neutral-900">{Number(r.orders_today)}</p>
                </div>
                <div className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-[11px] font-medium text-neutral-400">CA aujourd&apos;hui</p>
                  <p className="text-lg font-bold text-neutral-900">
                    {formatCFA(Number(r.revenue_today))}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <Button
                onClick={() => handleSelectTenant(r.tenant_slug)}
                className="w-full gap-2 rounded-lg bg-[#CCFF00] text-sm font-semibold text-black hover:bg-[#b8e600]"
              >
                Gerer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add restaurant card */}
          <button
            onClick={() => setShowWizard(true)}
            className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 bg-white p-5 transition-colors hover:border-[#CCFF00] hover:bg-[#CCFF00]/5"
          >
            <div className="mb-3 rounded-xl bg-neutral-100 p-3">
              <Plus className="h-6 w-6 text-neutral-400" />
            </div>
            <p className="text-sm font-semibold text-neutral-600">Ajouter un etablissement</p>
            <p className="mt-1 text-xs text-neutral-400">Creez un nouveau restaurant</p>
          </button>
        </div>
      </div>

      {/* Add Restaurant Wizard */}
      {showWizard && (
        <AddRestaurantWizard
          onClose={() => setShowWizard(false)}
          onSuccess={(slug) => {
            setShowWizard(false);
            // Navigate to the new restaurant's dashboard
            const isDev = window.location.hostname === 'localhost';
            if (isDev) {
              window.location.assign(`http://${slug}.localhost:3000/admin`);
            } else {
              window.location.assign(`https://${slug}.attabl.com/admin`);
            }
          }}
        />
      )}
    </div>
  );
}
