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
    // Super admin: fetch ALL tenants via admin client (bypasses RLS)
    const adminSupabase = createAdminClient();
    const { data: allTenants } = await adminSupabase
      .from('tenants')
      .select('id, slug, name, subscription_status, subscription_plan, is_active')
      .order('name');

    return (
      <TenantsPageClient
        serverMode="superadmin"
        serverUserName={userName}
        serverTenants={allTenants || []}
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

  return (
    <TenantsPageClient
      serverMode="owner"
      serverUserName={userName}
      serverRestaurants={serverRestaurants}
      initialTheme={initialTheme}
    />
  );
}
