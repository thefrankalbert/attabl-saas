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
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  subscription_plan: string;
  is_active: boolean;
}

// ─── Plan badge color mapping ────────────────────────────────
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

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAccessAndLoadTenants() {
      // Verifier l'utilisateur
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Verifier si super admin
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('is_super_admin, role')
        .eq('user_id', user.id)
        .single();

      const isAdmin = adminUser?.is_super_admin === true || adminUser?.role === 'super_admin';
      setIsSuperAdmin(isAdmin);

      if (!isAdmin) {
        router.push('/login?error=unauthorized');
        return;
      }

      // Charger tous les tenants
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, slug, name, subscription_status, subscription_plan, is_active')
        .order('name');

      setTenants(tenantsData || []);
      setLoading(false);
    }

    checkAccessAndLoadTenants();
  }, [supabase, router]);

  // ─── Filtered tenants ────────────────────────────────────
  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [tenants, searchQuery]);

  // ─── Stats ───────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: tenants.length,
      active: tenants.filter((t) => t.is_active).length,
      premium: tenants.filter((t) => t.subscription_plan?.toLowerCase() === 'premium').length,
      trial: tenants.filter((t) => t.subscription_status?.toLowerCase() === 'trial').length,
    }),
    [tenants],
  );

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

  // ─── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-black p-4">
            <Shield className="h-8 w-8 text-[#CCFF00]" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Header ─────────────────────────────────────────── */}
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
        {/* ─── Stats bar ──────────────────────────────────────── */}
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

        {/* ─── Search + info line ─────────────────────────────── */}
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

        {/* ─── Tenants grid ───────────────────────────────────── */}
        {filteredTenants.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTenants.map((tenant) => (
              <div
                key={tenant.id}
                className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-[#CCFF00]/50"
              >
                {/* Card header */}
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
                  {/* Status indicator */}
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

                {/* Badges */}
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

                {/* Actions */}
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
          /* ─── Empty state ─────────────────────────────────── */
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
