import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { QRCodePage } from './QRCodePage';
import { getTenantUrl } from '@/lib/constants';

export default async function QRCodesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Get tenant data
  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-app-text">QR Codes</h1>
        <p className="text-app-text-secondary mt-2">Tenant non trouvé</p>
      </div>
    );
  }

  const supabase = await createClient();

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

  // Construct menu URL — use subdomain format (e.g. https://radisson.attabl.com)
  // The middleware rewrites subdomain requests to /sites/{slug}/ internally
  const menuUrl = getTenantUrl(tenant.slug);

  return (
    <div className="max-w-7xl mx-auto">
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
