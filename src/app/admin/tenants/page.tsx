import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import TenantsPageClient from './tenants-page-client';

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  // Read the Command Center theme cookie server-side so the shell renders
  // with the correct data-cc-theme on first paint (no FOUC).
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('attabl-cc-theme')?.value;
  const initialTheme: 'light' | 'dark' = themeCookie === 'dark' ? 'dark' : 'light';

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if the user has super_admin or owner role in any tenant
  const { data: adminUsers } = await supabase
    .from('admin_users')
    .select('is_super_admin, role, full_name, tenant_id')
    .eq('user_id', user.id);

  const isSuperAdmin = (adminUsers || []).some(
    (au) => au.is_super_admin === true || au.role === 'super_admin',
  );

  const isOwner = (adminUsers || []).some((au) => au.role === 'owner');

  // Only super admins and owners can access this page
  if (!isSuperAdmin && !isOwner) {
    notFound();
  }

  // Server-side data fetching - never let the client query tenants directly
  const userName = adminUsers?.[0]?.full_name || user.email?.split('@')[0] || '';

  if (isSuperAdmin) {
    // Super admin: at hundreds+ of tenants, loading every tenant and then
    // aggregating orders over the full set is an O(all tenants x all orders)
    // scan that defeats the per-tenant indexes. We bound the initial load to a
    // sane page and expose the true platform totals separately. The full tenant
    // directory is still reachable via the search dialog (see the client), and
    // the precise per-tenant rollups for the long tail belong to the DB rollup
    // wave (E) - this wave only bounds the work done in code.
    const adminSupabase = createAdminClient();

    const SUPERADMIN_TENANT_LIMIT = 50;
    // Hard upper bound on the orders-free directory used only to make any tenant
    // findable via search. Stays in code-level territory; if a deployment ever
    // exceeds this, the DB rollup wave (E) should replace it with a paginated,
    // server-side tenant search.
    const SUPERADMIN_DIRECTORY_LIMIT = 2000;

    const [tenantsRes, directoryRes, activeCountRes, totalCountRes] = await Promise.all([
      adminSupabase
        .from('tenants')
        .select('id, slug, name, subscription_status, subscription_plan, is_active')
        .order('name')
        .limit(SUPERADMIN_TENANT_LIMIT),
      adminSupabase
        .from('tenants')
        .select('id, slug, name, subscription_plan, is_active')
        .order('name')
        .limit(SUPERADMIN_DIRECTORY_LIMIT),
      adminSupabase
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      adminSupabase.from('tenants').select('id', { count: 'exact', head: true }),
    ]);

    return (
      <TenantsPageClient
        serverMode="superadmin"
        isSuperAdmin
        serverUserName={userName}
        serverTenants={tenantsRes.data || []}
        serverDirectory={directoryRes.data || []}
        serverTotalLocations={totalCountRes.count ?? (tenantsRes.data || []).length}
        serverActiveLocations={
          activeCountRes.count ?? (tenantsRes.data || []).filter((t) => t.is_active).length
        }
        initialTheme={initialTheme}
      />
    );
  }

  // Owner: fetch ONLY tenants linked to this user via admin_users
  const tenantIds = (adminUsers || []).map((au) => au.tenant_id).filter(Boolean);
  const adminSupabase = createAdminClient();
  const { data: ownerTenants } = await adminSupabase
    .from('tenants')
    .select('id, name, slug, subscription_plan, subscription_status, logo_url, is_active')
    .in('id', tenantIds.length > 0 ? tenantIds : ['__none__']);

  const serverRestaurants = (ownerTenants || []).map((t) => ({
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
  }));

  // Owner mode is inherently bounded: only the tenants linked to this user via
  // admin_users are ever loaded, so the orders aggregation in the client runs
  // over a small, owner-scoped tenant set. Totals reflect that same set.
  return (
    <TenantsPageClient
      serverMode="owner"
      serverUserName={userName}
      serverRestaurants={serverRestaurants}
      serverTotalLocations={serverRestaurants.length}
      serverActiveLocations={serverRestaurants.filter((r) => r.tenant_is_active).length}
      initialTheme={initialTheme}
    />
  );
}
