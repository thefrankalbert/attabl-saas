import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import MenuDetailClient from '@/components/admin/MenuDetailClient';
import type { Category, MenuItem } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

interface MenuDetailPageProps {
  params: Promise<{ site: string; menuId: string }>;
}

export default async function MenuDetailPage({ params }: MenuDetailPageProps) {
  const { site, menuId } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) redirect('/login');

  const { data: menu } = await supabase
    .from('menus')
    .select('*, venue:venues(id, name, slug)')
    .eq('id', menuId)
    .eq('tenant_id', tenant.id)
    .single();

  if (!menu) notFound();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('menu_id', menuId)
    .order('display_order', { ascending: true });

  const categoryIds = (categories || []).map((c: Category) => c.id);

  let items: MenuItem[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('menu_items')
      .select('*, category:categories(id, name)')
      .eq('tenant_id', tenant.id)
      .in('category_id', categoryIds)
      .order('display_order', { ascending: true });
    items = (itemsData || []) as MenuItem[];
  }

  return (
    <MenuDetailClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      menu={menu}
      categories={categories || []}
      items={items}
    />
  );
}
