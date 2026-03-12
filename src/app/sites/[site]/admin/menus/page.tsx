import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import MenusClient from '@/components/admin/MenusClient';

export const dynamic = 'force-dynamic';

interface MenusPageProps {
  params: Promise<{ site: string }>;
}

export default async function MenusPage({ params }: MenusPageProps) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) redirect('/login');

  const supabase = await createClient();

  const { data: menus } = await supabase
    .from('menus')
    .select(
      '*, venue:venues(id, name, slug), children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
    )
    .eq('tenant_id', tenant.id)
    .is('parent_menu_id', null)
    .order('display_order', { ascending: true });

  const { data: venues } = await supabase
    .from('venues')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="max-w-7xl mx-auto">
      <MenusClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialMenus={menus || []}
        venues={venues || []}
        currency={(tenant.currency as 'XAF' | 'EUR' | 'USD') || 'XAF'}
      />
    </div>
  );
}
