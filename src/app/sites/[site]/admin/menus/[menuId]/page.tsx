import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import MenuDetailClient from '@/components/admin/MenuDetailClient';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import type { Category, MenuItem } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

interface MenuDetailPageProps {
  params: Promise<{ site: string; menuId: string }>;
}

export default async function MenuDetailPage({ params }: MenuDetailPageProps) {
  const { site, menuId } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) redirectToLogin();

  const supabase = await createClient();

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

  // Fetch categories not assigned to this menu (unassigned or belonging to other menus)
  const { data: availableCategories } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenant.id)
    .is('menu_id', null)
    .order('name', { ascending: true });

  const categoryIds = (categories || []).map((c: Category) => c.id);

  let items: MenuItem[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('menu_items')
      .select('*, category:categories(id, name), modifiers:item_modifiers(*)')
      .eq('tenant_id', tenant.id)
      .in('category_id', categoryIds)
      .order('display_order', { ascending: true });
    items = (itemsData || []) as MenuItem[];
  }

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <MenuDetailClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        menu={menu}
        categories={categories || []}
        availableCategories={availableCategories || []}
        items={items}
      />
    </div>
  );
}
