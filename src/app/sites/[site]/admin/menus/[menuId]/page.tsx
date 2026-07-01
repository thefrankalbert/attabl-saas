import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import MenuDetailClient from '@/components/admin/MenuDetailClient';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import {
  DEFAULT_PAGE_SIZE,
  paginationQuerySchema,
  toSupabaseRange,
  type ServerListPagination,
} from '@/lib/pagination';
import type { Category, MenuItem } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

const MENU_CATEGORIES_PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface MenuDetailPageProps {
  params: Promise<{ site: string; menuId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function MenuDetailPage({ params, searchParams }: MenuDetailPageProps) {
  const { site, menuId } = await params;
  const sp = await searchParams;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) redirectToLogin();

  const { page } = paginationQuerySchema.parse({
    page: sp.page,
    pageSize: MENU_CATEGORIES_PAGE_SIZE,
  });
  const { from, to } = toSupabaseRange(page, MENU_CATEGORIES_PAGE_SIZE);

  const supabase = await createClient();

  const { data: menu } = await supabase
    .from('menus')
    .select('*, venue:venues(id, name, slug)')
    .eq('id', menuId)
    .eq('tenant_id', tenant.id)
    .single();

  if (!menu) notFound();

  const { data: categories, count: categoriesCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .eq('menu_id', menuId)
    .order('display_order', { ascending: true })
    .range(from, to);

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
      .is('deleted_at', null)
      .in('category_id', categoryIds)
      .order('display_order', { ascending: true });
    items = (itemsData || []) as MenuItem[];
  }

  const categoryPagination: ServerListPagination = {
    page,
    pageSize: MENU_CATEGORIES_PAGE_SIZE,
    total: categoriesCount ?? categories?.length ?? 0,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <MenuDetailClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        menu={menu}
        categories={categories || []}
        availableCategories={availableCategories || []}
        items={items}
        categoryPagination={categoryPagination}
      />
    </div>
  );
}
