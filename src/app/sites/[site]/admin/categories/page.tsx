import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CategoriesClient from '@/components/admin/CategoriesClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import {
  paginationQuerySchema,
  toSupabaseRange,
  type ServerListPagination,
} from '@/lib/pagination';
import type { Category, Menu } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { site } = await params;
  const sp = await searchParams;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const { page, pageSize } = paginationQuerySchema.parse({
    page: sp.page,
    pageSize: sp.pageSize,
  });
  const { from, to } = toSupabaseRange(page, pageSize);

  const supabase = await createClient();

  const [{ data: categories, count }, { data: menus }] = await Promise.all([
    supabase
      .from('categories')
      .select('*, menu_items(id)', { count: 'exact' })
      .eq('tenant_id', tenant.id)
      .order('display_order', { ascending: true })
      .range(from, to),
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

  const serverListPagination: ServerListPagination = {
    page,
    pageSize,
    total: count ?? formatted.length,
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden w-full">
      <CategoriesClient
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialCategories={formatted}
        menus={(menus || []) as Pick<Menu, 'id' | 'name'>[]}
        serverListPagination={serverListPagination}
      />
    </div>
  );
}
