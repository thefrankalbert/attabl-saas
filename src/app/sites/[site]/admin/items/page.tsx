import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import ItemsClient from '@/components/admin/ItemsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
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
  const [itemsRes, categoriesRes] = await Promise.all([
    supabase
      .from('menu_items')
      .select('*, categories(id, name)')
      .eq('tenant_id', tenant.id)
      .order('name'),
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('display_order'),
  ]);

  const items: MenuItem[] = (itemsRes.data || []).map((item: Record<string, unknown>) => ({
    ...item,
    category: item.categories as Category,
  })) as MenuItem[];

  const currency = (tenant.currency as CurrencyCode) || 'XAF';

  return (
    <div className="h-full flex flex-col overflow-hidden max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <ItemsClient
        tenantId={tenant.id}
        initialItems={items}
        initialCategories={(categoriesRes.data || []) as Category[]}
        currency={currency}
        supportedCurrencies={[currency]}
      />
    </div>
  );
}
