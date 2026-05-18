import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import ItemsClient from '@/components/admin/ItemsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import {
  buildMenuItemsSelect,
  fetchMenuItemsList,
  getMenuItemCategory,
} from '@/lib/menu-items-query';
import { logger } from '@/lib/logger';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function ItemsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();
  const selectClause = buildMenuItemsSelect({ withCategory: true, withVariants: false });

  const [itemsResult, categoriesRes] = await Promise.all([
    fetchMenuItemsList(supabase, tenant.id, selectClause, {}, { withCategory: true }),
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('display_order'),
  ]);

  if (itemsResult.error) {
    logger.error('Failed to load menu items for admin items page', itemsResult.error);
  }

  const items: MenuItem[] = itemsResult.data.map((item) => ({
    ...item,
    category: getMenuItemCategory(item),
  })) as MenuItem[];

  const currency = (tenant.currency as CurrencyCode) || 'XAF';

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto w-full">
      <ItemsClient
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialItems={items}
        initialCategories={(categoriesRes.data || []) as Category[]}
        currency={currency}
        supportedCurrencies={[currency]}
      />
    </div>
  );
}
