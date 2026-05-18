import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CategoriesClient from '@/components/admin/CategoriesClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { Category, Menu } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  const [{ data: categories }, { data: menus }] = await Promise.all([
    supabase
      .from('categories')
      .select('*, menu_items(id)')
      .eq('tenant_id', tenant.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('menus')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  const formatted = (categories || []).map(
    (cat: Record<string, unknown>) =>
      ({
        ...cat,
        items_count: (cat.menu_items as unknown[])?.length || 0,
      }) as Category & { items_count: number },
  );

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto w-full">
      <CategoriesClient
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialCategories={formatted}
        menus={(menus || []) as Pick<Menu, 'id' | 'name'>[]}
      />
    </div>
  );
}
