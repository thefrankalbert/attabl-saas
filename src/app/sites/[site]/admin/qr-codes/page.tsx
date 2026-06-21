import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { QRCodePage } from './QRCodePage';
import { getTenantUrl } from '@/lib/constants';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { redirectToLogin, redirectToUnauthorized } from '@/lib/auth/redirect-to-main';

export const dynamic = 'force-dynamic';

export default async function QRCodesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Get tenant data
  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // Auth + tenant membership guard (defense-in-depth alongside the admin layout).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirectToLogin();
  }
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!adminUser) {
    redirectToUnauthorized();
  }

  // Fetch tables, zones, and menus in parallel
  const [{ data: zones }, { data: tables }, { data: menus }] = await Promise.all([
    supabase.from('zones').select('*').eq('tenant_id', tenant.id).order('name'),
    supabase.from('tables').select('*').eq('tenant_id', tenant.id).order('table_number'),
    supabase
      .from('menus')
      .select('id, name, slug, is_active')
      .eq('tenant_id', tenant.id)
      .is('parent_menu_id', null)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  // Construct menu URL - use subdomain format (e.g. https://radisson.attabl.com)
  // The middleware rewrites subdomain requests to /sites/{slug}/ internally
  const menuUrl = getTenantUrl(tenant.slug);

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <QRCodePage
        tenant={{
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color || '#000000',
          secondaryColor: tenant.secondary_color || '#FFFFFF',
          description: tenant.description,
        }}
        menuUrl={menuUrl}
        zones={zones || []}
        tables={tables || []}
        menus={(menus || []) as { id: string; name: string; slug: string; is_active: boolean }[]}
      />
    </div>
  );
}
